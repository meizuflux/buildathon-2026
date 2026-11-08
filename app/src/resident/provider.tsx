// Loads the signed-in household's plan from the Haven backend and keeps it fresh. The backend's
// allocation plan decides the destination. Checklist ticks, "We've left", and the local copy of sent
// messages are stored on this device.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { useAuth } from '../hooks/useAuth';
import { http } from '../services/api/client';
import { ApiError } from '../services/api/http';
import { cache } from '../storage/cache';
import {
  broadcastsFromUpdates, disasterSchema, familyPatch, familySchema, householdFromFamily, instructionFromUpdates,
  keepDestination, planSchema, recommendationFromPlan, shelterFromApi, shelterSchema, updateSchema,
  type ApiDisaster, type ApiFamily, type ApiPlan, type ApiShelter, type ApiUpdate,
} from './api';
import { preparationSteps, type Step } from './checklist';
import { describeChange } from './rules';
import { localMinute } from './time';
import type { Broadcast, Household, Message, OfficialInstruction, Recommendation, Shelter, SystemNotice } from './types';

const POLL_MS = 30000;
const meSchema = z.object({ id: z.string(), role: z.string(), family_id: z.string().nullable() });
const enc = encodeURIComponent;

/** What the resident sees. While offline, the last good snapshot is shown instead of live data. */
export interface View {
  now: number;
  household: Household;
  shelters: Shelter[];
  instruction: OfficialInstruction | null;
  broadcasts: Broadcast[];
  recommendation: Recommendation;
  lastChange: string[];
}

export interface ResidentState extends View {
  messages: Message[];
  notices: SystemNotice[];
  checked: string[];
  travellingTo: string | null;
  online: boolean;
  saved: View | null;
}

interface Ready {
  phase: 'ready';
  state: ResidentState;
  view: View;
  steps: Step[];
  /** True while household changes are being saved and the plan regenerated. */
  updating: boolean;
  disasterName: string;
  lastSync: number | null;
  toggleStep: (id: string) => void;
  startJourney: () => void;
  sendMessage: (body: string, retryId?: string) => void;
  /** Resolves once the backend has saved the household and regenerated the plan; rejects otherwise. */
  saveHousehold: (h: Household) => Promise<void>;
  signOut: () => void;
}
interface Setup { phase: 'setup'; createHousehold: (h: Household) => Promise<void>; signOut: () => void }
interface Pending { phase: 'loading' | 'error'; error: string | null; retry: () => void; signOut: () => void }
export type ResidentContext = Ready | Setup | Pending;

interface Data { family: ApiFamily; disaster: ApiDisaster; shelters: ApiShelter[]; plan: ApiPlan; updates: ApiUpdate[] }
interface Local { checked: string[]; travellingTo: string | null; messages: Message[] }

const Context = createContext<ResidentContext | null>(null);

async function listDisasters() { return (await http('/api/disasters', z.object({ disasters: z.array(disasterSchema) }))).disasters; }
async function listShelters(disasterId: string) { return (await http('/api/shelters?disaster_id=' + enc(disasterId), z.object({ shelters: z.array(shelterSchema) }))).shelters; }

async function fetchAll(): Promise<Data | null> {
  const me = await http('/api/me', meSchema);
  if (!me.family_id) return null;
  const family = await http('/api/families/' + enc(me.family_id), familySchema);
  const [disasters, shelters, plan, updates] = await Promise.all([
    listDisasters(),
    listShelters(family.disaster_id),
    http('/api/families/' + enc(family.id) + '/plan', planSchema),
    http('/api/disasters/' + enc(family.disaster_id) + '/updates', z.object({ updates: z.array(updateSchema) })).then((r) => r.updates),
  ]);
  const disaster = disasters.find((d) => d.id === family.disaster_id)
    ?? { id: family.disaster_id, type: 'Disaster', name: 'Active emergency', status: 'active', affected_area: 'your area', updated_at: family.updated_at };
  return { family, disaster, shelters, plan, updates };
}

function snapshot(s: ResidentState): View {
  const { now, household, shelters, instruction, broadcasts, recommendation, lastChange } = s;
  return { now, household, shelters, instruction, broadcasts, recommendation, lastChange };
}

function build(data: Data, local: Local, prev: ResidentState | null, title: string): ResidentState {
  const household = householdFromFamily(data.family, `Home in ${data.disaster.affected_area}`);
  const shelters = data.shelters.map(shelterFromApi);
  const recommendation = keepDestination(recommendationFromPlan(data.plan, household, shelters), household, shelters, local.travellingTo);
  const lines = prev ? describeChange(prev.recommendation, recommendation) : [];
  const now = localMinute(Date.now());
  const notices: SystemNotice[] = lines.length ? [{ id: `NT-${Date.now()}`, at: now, title, lines }, ...(prev?.notices ?? [])] : prev?.notices ?? [];
  return {
    now, household, shelters, recommendation,
    instruction: instructionFromUpdates(data.updates), broadcasts: broadcastsFromUpdates(data.updates),
    lastChange: lines.length ? lines : prev?.lastChange ?? [],
    messages: local.messages, notices, checked: local.checked, travellingTo: local.travellingTo,
    online: true, saved: null,
  };
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

export function ResidentProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [phase, setPhase] = useState<'loading' | 'setup' | 'ready' | 'error'>('loading');
  const [state, setState] = useState<ResidentState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const data = useRef<Data | null>(null);
  const local = useRef<Local>({ checked: [], travellingTo: null, messages: [] });
  const latest = useRef<ResidentState | null>(null);
  latest.current = state;
  const signOut = useCallback(() => { void auth.signOut(); }, [auth]);

  const localKey = (familyId: string) => `resident:${familyId}`;
  const persist = useCallback(() => {
    if (data.current) void cache.set(localKey(data.current.family.id), local.current).catch(() => {});
  }, []);

  const sync = useCallback(async (title = 'Coordinators’ plan updated') => {
    try {
      const next = await fetchAll();
      if (!next) { setPhase('setup'); return; }
      if (!data.current || data.current.family.id !== next.family.id) {
        const saved = await cache.get<Local>(localKey(next.family.id)).catch(() => null);
        local.current = {
          checked: saved?.checked ?? [],
          travellingTo: saved?.travellingTo ?? null,
          // A send interrupted by a reload is shown as failed so it can be retried.
          messages: (saved?.messages ?? []).map((m) => (m.state === 'sending' ? { ...m, state: 'failed' } : m)),
        };
      }
      data.current = next;
      setState((prev) => build(next, local.current, prev, title));
      setError(null);
      setLastSync(Date.now());
      setPhase('ready');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { signOut(); return; }
      setError(errorText(e));
      // Keep showing the last good data, clearly marked as saved, instead of failing the page.
      setState((prev) => (prev ? { ...prev, online: false, saved: prev.saved ?? snapshot(prev) } : prev));
      setPhase((p) => (p === 'loading' ? 'error' : p));
    }
  }, [signOut]);

  useEffect(() => {
    void sync();
    const timer = setInterval(() => { void sync(); }, POLL_MS);
    return () => clearInterval(timer);
  }, [sync]);

  const toggleStep = useCallback((id: string) => {
    const c = local.current.checked;
    local.current = { ...local.current, checked: c.includes(id) ? c.filter((x) => x !== id) : [...c, id] };
    persist();
    setState((prev) => (prev ? { ...prev, checked: local.current.checked } : prev));
  }, [persist]);

  const startJourney = useCallback(() => {
    local.current = { ...local.current, travellingTo: latest.current?.recommendation.destination?.shelter.id ?? null };
    persist();
    if (data.current) setState((prev) => build(data.current!, local.current, prev, 'You marked that you have left'));
  }, [persist]);

  const saveHousehold = useCallback(async (household: Household) => {
    const family = data.current?.family;
    if (!family) throw new Error('Household not loaded yet');
    setUpdating(true);
    try {
      await http('/api/families/' + enc(family.id), familySchema, { method: 'PATCH', body: familyPatch(household, family) });
      await http('/api/families/' + enc(family.id) + '/plan/generate', planSchema, { method: 'POST' });
      await sync('Household needs updated');
    } finally { setUpdating(false); }
  }, [sync]);

  const sendMessage = useCallback((body: string, retryId?: string) => {
    const family = data.current?.family;
    if (!family) return;
    const id = retryId ?? `msg-${Date.now()}`;
    const existing = local.current.messages.find((m) => m.id === id);
    const put = (m: Message) => {
      const list = local.current.messages;
      local.current = { ...local.current, messages: list.some((x) => x.id === m.id) ? list.map((x) => (x.id === m.id ? m : x)) : [...list, m] };
      persist();
      setState((prev) => (prev ? { ...prev, messages: local.current.messages } : prev));
    };
    const sending: Message = existing ? { ...existing, state: 'sending' } : { id, body, at: localMinute(Date.now()), state: 'sending' };
    put(sending);
    // Sent to coordinators as a help report; the id makes retries idempotent.
    void http('/api/families/' + enc(family.id) + '/reports', z.object({ id: z.string() }), {
      method: 'POST', body: { type: 'need_help', message: sending.body, location: family.location, client_request_id: id },
    }).then(() => put({ ...sending, state: 'sent' }), () => put({ ...sending, state: 'failed' }));
  }, [persist]);

  const createHousehold = useCallback(async (h: Household) => {
    const disaster = (await listDisasters())[0];
    if (!disaster) throw new Error('No active emergency is listed by the service');
    const shelters = await listShelters(disaster.id);
    // Golden Gate Estates resident demo household location (or centre of shelters).
    const lat = disaster.id === 'golden_gate_hurricane'
      ? 26.31402411
      : shelters.reduce((t, s) => t + s.location.latitude, 0) / Math.max(1, shelters.length);
    const lng = disaster.id === 'golden_gate_hurricane'
      ? -81.58765271
      : shelters.reduce((t, s) => t + s.location.longitude, 0) / Math.max(1, shelters.length);
    const patch = familyPatch(h, null);
    await http('/api/families', familySchema, {
      method: 'POST',
      body: { disaster_id: disaster.id, adults: patch.adults, children: patch.children, location: { latitude: lat, longitude: lng },
        needs: { ...patch.needs, immediate_medication: false, medical_notes: null }, resources: patch.resources },
    });
    setPhase('loading');
    await sync();
  }, [sync]);

  const retry = useCallback(() => { setPhase('loading'); void sync(); }, [sync]);

  const value = useMemo<ResidentContext>(() => {
    if (phase === 'setup') return { phase, createHousehold, signOut };
    if (phase === 'ready' && state) {
      const view = !state.online && state.saved ? state.saved : snapshot(state);
      return {
        phase, state, view, steps: preparationSteps(state.household), updating, disasterName: data.current?.disaster.name ?? '', lastSync,
        toggleStep, startJourney, sendMessage, saveHousehold, signOut,
      };
    }
    return { phase: phase === 'error' ? 'error' : 'loading', error, retry, signOut };
  }, [phase, state, updating, lastSync, error, createHousehold, toggleStep, startJourney, sendMessage, saveHousehold, retry, signOut]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useResident(): ResidentContext {
  const value = useContext(Context);
  if (!value) throw new Error('useResident must be used inside ResidentProvider');
  return value;
}
