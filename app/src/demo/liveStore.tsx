// Live provider: feeds the resident dashboard from the Haven backend instead of the simulated scenario.
// The backend's allocation plan decides the destination. Checklist ticks, "We've left", and the local
// copy of sent messages are stored on this device.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { z } from 'zod';
import { Action, LinkButton, useDash } from '../components/dashboard/parts';
import { EditNeedsSheet } from '../components/dashboard/Household';
import { useAuth } from '../hooks/useAuth';
import { http } from '../services/api/client';
import { ApiError } from '../services/api/http';
import { cache } from '../storage/cache';
import { preparationSteps } from './checklist';
import {
  broadcastsFromUpdates, familyPatch, hurricaneFromApi, householdFromFamily, instructionFromUpdates, liveDisasterSchema, liveFamilySchema,
  liveHurricaneSchema, livePlanSchema, liveShelterSchema, liveUpdateSchema, localMinute, PETS_UNSPECIFIED, recommendationFromPlan, shelterFromApi,
  type HurricaneView, type LiveDisaster, type LiveFamily, type LivePlan, type LiveShelter, type LiveUpdate,
} from './live';
import { evacuationNotice, transition } from './hurricane';
import { assess, describeChange } from './recommend';
import { STATE_VERSION, view, type Action as DemoAction, type DemoState } from './state';
import { Context, type DemoContext } from './store';
import type { DemoHousehold, Message, Recommendation, SystemNotice } from './types';

/** Poll fast so the demo reacts to "Initiate hurricane" within a few seconds. */
const POLL_MS = 5000;
const meSchema = z.object({ id: z.string(), role: z.string(), family_id: z.string().nullable() });

interface Data { family: LiveFamily; disaster: LiveDisaster; shelters: LiveShelter[]; plan: LivePlan; updates: LiveUpdate[]; hurricane: HurricaneView }
interface Local { checked: string[]; travellingTo: string | null; messages: Message[] }

const enc = encodeURIComponent;
async function disasters() { return (await http('/api/disasters', z.object({ disasters: z.array(liveDisasterSchema) }))).disasters; }
async function shelters(disasterId: string) { return (await http('/api/shelters?disaster_id=' + enc(disasterId), z.object({ shelters: z.array(liveShelterSchema) }))).shelters; }

async function fetchHurricane(disasterId: string): Promise<HurricaneView> {
  return hurricaneFromApi(await http('/api/disasters/' + enc(disasterId) + '/hurricane', liveHurricaneSchema));
}

/** `lastHurricane` is the last known status: a failed status request keeps it instead of flipping to peace. */
async function fetchAll(lastHurricane: HurricaneView | null): Promise<Data | null> {
  const me = await http('/api/me', meSchema);
  if (!me.family_id) return null;
  const family = await http('/api/families/' + enc(me.family_id), liveFamilySchema);
  const [all, shelterList, plan, updates, hurricane] = await Promise.all([
    disasters(),
    shelters(family.disaster_id),
    http('/api/families/' + enc(family.id) + '/plan', livePlanSchema),
    http('/api/disasters/' + enc(family.disaster_id) + '/updates', z.object({ updates: z.array(liveUpdateSchema) })).then((r) => r.updates),
    fetchHurricane(family.disaster_id).catch((e) => {
      if (e instanceof ApiError && e.status === 401) throw e;
      if (lastHurricane) return lastHurricane;
      throw e;
    }),
  ]);
  const disaster = all.find((d) => d.id === family.disaster_id) ?? { id: family.disaster_id, type: 'Hurricane', name: 'Active hurricane', status: 'active', affected_area: 'your area', updated_at: family.updated_at };
  return { family, disaster, shelters: shelterList, plan, updates, hurricane };
}

/** Keep the household's destination after they marked that they left; explain any plan change instead. */
function keepDestination(rec: Recommendation, h: DemoHousehold, list: ReturnType<typeof shelterFromApi>[], travellingTo: string | null): Recommendation {
  if (!travellingTo) return rec;
  const kept = list.find((s) => s.id === travellingTo);
  if (!kept) return { ...rec, keptBecauseTravelling: false };
  if (rec.destination?.shelter.id === travellingTo) return { ...rec, keptBecauseTravelling: true };
  const current = assess(h, kept, []);
  return {
    ...rec,
    status: current.verified ? 'recommended' : 'unverified',
    destination: current,
    alternatives: rec.alternatives.filter((a) => a.assessment.shelter.id !== travellingTo),
    keptBecauseTravelling: true,
    reserved: false,
    advisory: `The coordinators’ plan now suggests ${rec.destination?.shelter.name ?? 'no shelter'} instead of ${kept.name}. Your destination has not been changed. Message a coordinator before changing plans.`,
  };
}

function build(data: Data, local: Local, prev: DemoState | null, title: string, evacuation = false): DemoState {
  const household = householdFromFamily(data.family, `Home in ${data.disaster.affected_area}`);
  const list = data.shelters.map(shelterFromApi);
  const recommendation = keepDestination(recommendationFromPlan(data.plan, household, list), household, list, local.travellingTo);
  // While there is no active hurricane the plan is held back: no plan-change notices that would name a shelter.
  const active = data.hurricane.phase === 'active';
  const lines = prev && active && !evacuation ? describeChange(prev.recommendation, recommendation) : [];
  const now = localMinute(Date.now());
  const seq = (prev?.seq ?? 1) + 1;
  const base = prev?.notices ?? [];
  const notices: SystemNotice[] = evacuation ? [evacuationNotice(`NT-${seq}`, now, data.hurricane, recommendation), ...base]
    : lines.length ? [{ id: `NT-${seq}`, at: now, title, lines }, ...base] : base;
  return {
    version: STATE_VERSION, now, household, shelters: list, closures: [],
    instruction: instructionFromUpdates(data.updates), broadcasts: broadcastsFromUpdates(data.updates),
    messages: local.messages, notices, checked: local.checked, travellingTo: local.travellingTo,
    online: true, failNextMessage: false, recommendation, lastChange: lines.length ? lines : active && !evacuation ? prev?.lastChange ?? [] : [],
    saved: null, cursors: { closure: 0, broadcast: 0, availability: 0, reply: 0 }, seq,
  };
}

function message(e: unknown) { return e instanceof Error ? e.message : 'Something went wrong.'; }

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [phase, setPhase] = useState<'loading' | 'setup' | 'ready' | 'error'>('loading');
  const [state, setState] = useState<DemoState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [evacuationSeq, setEvacuationSeq] = useState(0);
  const data = useRef<Data | null>(null);
  const local = useRef<Local>({ checked: [], travellingTo: null, messages: [] });
  const latest = useRef<DemoState | null>(null);
  latest.current = state;

  const localKey = (familyId: string) => `live-resident:${familyId}`;
  const persist = useCallback(() => {
    if (data.current) void cache.set(localKey(data.current.family.id), local.current).catch(() => {});
  }, []);

  const sync = useCallback(async (title = 'Coordinators’ plan updated') => {
    try {
      const next = await fetchAll(data.current?.hurricane ?? null);
      if (!next) { setPhase('setup'); return; }
      if (!data.current || data.current.family.id !== next.family.id) {
        const saved = await cache.get<Local>(localKey(next.family.id)).catch(() => null);
        local.current = { checked: saved?.checked ?? [], travellingTo: saved?.travellingTo ?? null, messages: (saved?.messages ?? []).map((m) => (m.state === 'sending' ? { ...m, state: 'failed' } : m)) };
      }
      const change = transition(data.current?.hurricane ?? null, next.hurricane);
      data.current = next;
      setState((prev) => build(next, local.current, prev, title, change === 'evacuation'));
      if (change === 'evacuation') setEvacuationSeq((n) => n + 1);
      setError(null);
      setLastSync(Date.now());
      setPhase('ready');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { void auth.signOut(); return; }
      setError(message(e));
      // Keep showing the last good data, clearly marked as saved, instead of failing the page.
      setState((prev) => (prev ? { ...prev, online: false, saved: prev.saved ?? view(prev) } : prev));
      setPhase((p) => (p === 'loading' ? 'error' : p));
    }
  }, [auth]);

  useEffect(() => {
    void sync();
    const timer = setInterval(() => { void sync(); }, POLL_MS);
    return () => clearInterval(timer);
  }, [sync]);

  const rebuild = useCallback(() => {
    if (data.current) setState((prev) => build(data.current!, local.current, prev, 'You marked that you have left'));
  }, []);

  const saveHousehold = useCallback(async (household: DemoHousehold) => {
    const family = data.current?.family;
    if (!family) throw new Error('Household not loaded yet');
    setUpdating(true);
    try {
      await http('/api/families/' + enc(family.id), liveFamilySchema, { method: 'PATCH', body: familyPatch(household, family) });
      await http('/api/families/' + enc(family.id) + '/plan/generate', livePlanSchema, { method: 'POST' });
      await sync('Household needs updated');
    } finally { setUpdating(false); }
  }, [sync]);

  const dispatch = useCallback((action: DemoAction) => {
    const family = data.current?.family;
    if (!family) return;
    if (action.type === 'toggleStep') {
      const c = local.current.checked;
      local.current = { ...local.current, checked: c.includes(action.id) ? c.filter((x) => x !== action.id) : [...c, action.id] };
      persist();
      setState((prev) => (prev ? { ...prev, checked: local.current.checked } : prev));
    } else if (action.type === 'startJourney') {
      local.current = { ...local.current, travellingTo: latest.current?.recommendation.destination?.shelter.id ?? null };
      persist();
      rebuild();
    } else if (action.type === 'setHousehold') {
      void saveHousehold(action.household).catch(() => {});
    }
    // Simulation-only actions (closures, scripted broadcasts, presenter controls) do nothing here.
  }, [persist, rebuild, saveHousehold]);

  const sendMessage = useCallback((body: string, retryId?: string) => {
    const family = data.current?.family;
    if (!family) return;
    const id = retryId ?? `msg-${Date.now()}`;
    const existing = local.current.messages.find((m) => m.id === id);
    const put = (m: Message) => {
      local.current = { ...local.current, messages: local.current.messages.some((x) => x.id === m.id) ? local.current.messages.map((x) => (x.id === m.id ? m : x)) : [...local.current.messages, m] };
      persist();
      setState((prev) => (prev ? { ...prev, messages: local.current.messages } : prev));
    };
    const sending: Message = existing ? { ...existing, state: 'sending' } : { id, from: 'household', author: 'You', role: 'Your household', body, at: localMinute(Date.now()), state: 'sending' };
    put(sending);
    void http('/api/families/' + enc(family.id) + '/reports', z.object({ id: z.string() }), {
      method: 'POST', body: { type: 'need_help', message: sending.body, location: family.location, client_request_id: id },
    }).then(() => put({ ...sending, state: 'sent' }), () => put({ ...sending, state: 'failed' }));
  }, [persist]);

  const createProfile = useCallback(async (h: DemoHousehold) => {
    const disaster = (await disasters())[0];
    if (!disaster) throw new Error('No active hurricane is listed by the service.');
    const list = await shelters(disaster.id);
    // Demo accounts have no address; place the household at the centre of the listed shelters.
    const lat = list.reduce((t, s) => t + s.location.latitude, 0) / Math.max(1, list.length);
    const lng = list.reduce((t, s) => t + s.location.longitude, 0) / Math.max(1, list.length);
    const patch = familyPatch(h, null);
    await http('/api/families', liveFamilySchema, {
      method: 'POST',
      body: { disaster_id: disaster.id, adults: patch.adults, children: patch.children, location: { latitude: lat, longitude: lng },
        needs: { ...patch.needs, immediate_medication: false, medical_notes: null }, resources: patch.resources },
    });
    setPhase('loading');
    await sync();
  }, [sync]);

  const value = useMemo<DemoContext | null>(() => state && {
    mode: 'live',
    state,
    view: view(state),
    steps: preparationSteps(state.household, state.instruction),
    updating,
    dispatch,
    sendMessage,
    saveHousehold,
    hurricane: data.current?.hurricane,
    evacuationSeq,
    live: { disasterName: data.current?.disaster.name ?? '', affectedArea: data.current?.disaster.affected_area ?? 'your area', lastSync, error, refresh: () => { void sync(); }, signOut: () => { void auth.signOut(); } },
  }, [state, updating, dispatch, sendMessage, saveHousehold, lastSync, error, sync, auth, evacuationSeq]);

  if (phase === 'setup') return <SetupHousehold onCreate={createProfile} onSignOut={() => void auth.signOut()} />;
  if (phase === 'ready' && value) return <Context.Provider value={value}>{children}</Context.Provider>;
  return <Status error={phase === 'error' ? error : null} onRetry={() => { setPhase('loading'); void sync(); }} onSignOut={() => void auth.signOut()} />;
}

function Status({ error, onRetry, onSignOut }: { error: string | null; onRetry: () => void; onSignOut: () => void }) {
  const { c, s } = useDash();
  return (
    <View style={{ flex: 1, backgroundColor: c.cream, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
      {error ? (
        <View style={[s.panel, { maxWidth: 420, width: '100%' }]}>
          <Text accessibilityRole="header" style={s.h2}>Can’t load your plan</Text>
          <Text style={s.body}>{error}</Text>
          <Action title="Try again" icon="refresh-cw" onPress={onRetry} />
          <LinkButton title="Sign out" icon="log-out" tone="neutral" onPress={onSignOut} />
        </View>
      ) : (
        <><ActivityIndicator color={c.green} size="large" /><Text style={s.secondary}>Loading your household plan…</Text></>
      )}
    </View>
  );
}

const NEW_HOUSEHOLD: DemoHousehold = {
  id: 'new', name: 'Your household', adults: 1, children: 0, childAges: [], dogs: 0, petNote: PETS_UNSPECIFIED,
  wheelchairEntrance: 'no', poweredEquipment: 'no', vehicle: 'yes', transportHelp: 'no', location: { label: '', lat: 0, lng: 0 },
};

function SetupHousehold({ onCreate, onSignOut }: { onCreate: (h: DemoHousehold) => Promise<void>; onSignOut: () => void }) {
  const { c, s } = useDash();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(NEW_HOUSEHOLD);
  return (
    <View style={{ flex: 1, backgroundColor: c.cream, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <View style={[s.panel, { maxWidth: 420, width: '100%' }]}>
        <Text accessibilityRole="header" style={s.h2}>Set up your household</Text>
        <Text style={s.body}>This account has no household profile yet. Add one to get a shelter recommendation.</Text>
        {busy && <ActivityIndicator color={c.green} />}
        {error && <Text style={[s.body, { color: c.red }]}>Not saved: {error}</Text>}
        <LinkButton title="Sign out" icon="log-out" tone="neutral" onPress={onSignOut} />
      </View>
      <EditNeedsSheet visible={!busy} household={draft} online title="Set up your household" saveTitle="Create household" dismissable={false} saveError={error}
        onClose={() => {}}
        onSave={(h) => { setDraft(h); setBusy(true); setError(null); onCreate(h).catch((e) => { setError(message(e)); setBusy(false); }); }} />
    </View>
  );
}
