// React provider for the resident dashboard demo: wraps the pure reducer with persistence, a short
// honest "updating" state, and simulated message delivery. Everything here is simulated.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { cache } from '../storage/cache';
import { initialState, reducer, steps, view, type Action, type DemoState, type View } from './state';
import type { HurricaneView } from './live';
import type { DemoHousehold } from './types';

const KEY = 'resident-demo-state';
const RECALC_MS = 650;
const SEND_MS = 900;
const REPLY_MS = 2200;
const RECALCULATES = new Set<Action['type']>(['setHousehold', 'triggerClosure', 'updateAvailability']);

/** Live-backend extras. Absent in the simulated demo. */
export interface LiveExtras {
  disasterName: string;
  affectedArea: string;
  lastSync: number | null;
  error: string | null;
  refresh: () => void;
  signOut: () => void;
}

export interface DemoContext {
  mode: 'demo' | 'live';
  live?: LiveExtras;
  /** Hurricane status. Undefined in the simulated demo, which behaves as an active hurricane. */
  hurricane?: HurricaneView;
  /** Increases each time the status flips from peace to active, so the app can jump to the Plan tab. */
  evacuationSeq?: number;
  state: DemoState;
  view: View;
  steps: ReturnType<typeof steps>;
  /** True briefly while the recommendation is being recalculated. */
  updating: boolean;
  dispatch: (action: Action) => void;
  sendMessage: (body: string, retryId?: string) => void;
  /** Saves household needs; resolves once saved, rejects with a readable message if not. */
  saveHousehold: (household: DemoHousehold) => Promise<void>;
}

export const Context = createContext<DemoContext | null>(null);

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, initialState);
  const [loaded, setLoaded] = useState(false);
  const [updating, setUpdating] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const latest = useRef(state);
  latest.current = state;

  // Restore the demo from the previous page load (checklist ticks, events, messages).
  useEffect(() => {
    let live = true;
    void cache.get<DemoState>(KEY)
      .then((saved) => { if (live && saved) rawDispatch({ type: 'restore', state: saved }); })
      .catch(() => {})
      .finally(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (loaded) void cache.set(KEY, state).catch(() => {});
  }, [state, loaded]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const later = useCallback((fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); }, []);

  const dispatch = useCallback((action: Action) => {
    if (action.type === 'reset') {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      setUpdating(false);
    }
    if (RECALCULATES.has(action.type)) {
      setUpdating(true);
      later(() => setUpdating(false), RECALC_MS);
    }
    rawDispatch(action);
  }, [later]);

  const sendMessage = useCallback((body: string, retryId?: string) => {
    const id = retryId ?? `MSG-H${Date.now()}`;
    rawDispatch({ type: 'messageQueued', id, body });
    later(() => {
      const failing = !latest.current.online || latest.current.failNextMessage;
      rawDispatch({ type: 'messageResult', id });
      if (!failing) later(() => rawDispatch({ type: 'coordinatorReply' }), REPLY_MS);
    }, SEND_MS);
  }, [later]);

  const saveHousehold = useCallback(async (household: DemoHousehold) => {
    if (!latest.current.online) throw new Error('You are offline');
    dispatch({ type: 'setHousehold', household });
  }, [dispatch]);

  const value = useMemo<DemoContext>(
    () => ({ mode: 'demo', state, view: view(state), steps: steps(state), updating, dispatch, sendMessage, saveHousehold }),
    [state, updating, dispatch, sendMessage, saveHousehold],
  );

  if (!loaded) return null;
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useDemo(): DemoContext {
  const value = useContext(Context);
  if (!value) throw new Error('useDemo must be used inside DemoProvider');
  return value;
}
