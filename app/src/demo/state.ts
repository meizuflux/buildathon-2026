// Pure state machine for the resident dashboard demo. The React provider (store.tsx) adds timers and
// persistence; everything deterministic lives here so it can be tested.
import { preparationSteps } from './checklist';
import { describeChange, recommend } from './recommend';
import * as scenario from './scenario';
import type {
  Broadcast, Closure, DemoHousehold, DemoShelter, Message, OfficialInstruction, Recommendation, SystemNotice,
} from './types';

export const STATE_VERSION = 3;

/** What the resident sees. Frozen while offline so saved information is never mixed with live data. */
export interface View {
  now: number;
  household: DemoHousehold;
  shelters: DemoShelter[];
  closures: Closure[];
  instruction: OfficialInstruction | null;
  broadcasts: Broadcast[];
  recommendation: Recommendation;
  lastChange: string[];
}

export interface DemoState {
  version: number;
  now: number;
  household: DemoHousehold;
  shelters: DemoShelter[];
  closures: Closure[];
  instruction: OfficialInstruction | null;
  broadcasts: Broadcast[];
  messages: Message[];
  notices: SystemNotice[];
  checked: string[];
  travellingTo: string | null;
  online: boolean;
  failNextMessage: boolean;
  recommendation: Recommendation;
  lastChange: string[];
  /** Snapshot shown while offline, and the time it was saved. */
  saved: View | null;
  cursors: { closure: number; broadcast: number; availability: number; reply: number };
  seq: number;
}

export type Action =
  | { type: 'setHousehold'; household: DemoHousehold }
  | { type: 'triggerClosure' }
  | { type: 'sendBroadcast' }
  | { type: 'updateAvailability' }
  | { type: 'advanceTime'; minutes: number }
  | { type: 'setOnline'; online: boolean }
  | { type: 'setFailNext'; fail: boolean }
  | { type: 'toggleStep'; id: string }
  | { type: 'startJourney' }
  | { type: 'messageQueued'; id: string; body: string }
  | { type: 'messageResult'; id: string }
  | { type: 'coordinatorReply' }
  | { type: 'reset' };

export function initialState(): DemoState {
  const household = structuredClone(scenario.household);
  const shelters = structuredClone(scenario.shelters);
  return {
    version: STATE_VERSION,
    now: scenario.START_MINUTE,
    household,
    shelters,
    closures: [],
    instruction: scenario.instruction,
    broadcasts: structuredClone(scenario.initialBroadcasts),
    messages: structuredClone(scenario.initialMessages),
    notices: [],
    checked: [],
    travellingTo: null,
    online: true,
    failNextMessage: false,
    recommendation: recommend(household, shelters, [], null),
    lastChange: [],
    saved: null,
    cursors: { closure: 0, broadcast: 0, availability: 0, reply: 0 },
    seq: 1,
  };
}

export function view(state: DemoState): View {
  if (!state.online && state.saved) return state.saved;
  const { now, household, shelters, closures, instruction, broadcasts, recommendation, lastChange } = state;
  return { now, household, shelters, closures, instruction, broadcasts, recommendation, lastChange };
}

/** Steps the checklist should show for the current household. */
export function steps(state: DemoState) {
  return preparationSteps(state.household, state.instruction);
}

function recompute(state: DemoState, title: string): DemoState {
  const next = recommend(state.household, state.shelters, state.closures, state.travellingTo);
  const lines = describeChange(state.recommendation, next);
  const notices = lines.length
    ? [{ id: `NT-${state.seq}`, at: state.now, title, lines } satisfies SystemNotice, ...state.notices]
    : state.notices;
  return { ...state, recommendation: next, lastChange: lines, notices, seq: state.seq + 1 };
}

export function reducer(state: DemoState, action: Action): DemoState {
  switch (action.type) {
    case 'setHousehold':
      return recompute({ ...state, now: state.now + 1, household: action.household }, 'Household needs updated');
    case 'triggerClosure': {
      const next = scenario.closureScript[state.cursors.closure];
      if (!next) return state;
      const now = state.now + 4;
      const closure: Closure = { ...next, at: now };
      return recompute(
        { ...state, now, closures: [...state.closures, closure], cursors: { ...state.cursors, closure: state.cursors.closure + 1 } },
        `Road closure: ${closure.label}`,
      );
    }
    case 'sendBroadcast': {
      const next = scenario.broadcastScript[state.cursors.broadcast];
      if (!next) return state;
      const now = state.now + 3;
      return {
        ...state,
        now,
        broadcasts: [{ ...next, at: now }, ...state.broadcasts],
        cursors: { ...state.cursors, broadcast: state.cursors.broadcast + 1 },
      };
    }
    case 'updateAvailability': {
      const next = scenario.availabilityScript[state.cursors.availability];
      if (!next) return state;
      const now = state.now + 5;
      const shelters = state.shelters.map((s) =>
        s.id === next.shelterId ? { ...s, spaces: next.spaces, spacesReportedAt: now } : s,
      );
      const name = state.shelters.find((s) => s.id === next.shelterId)?.name ?? 'A shelter';
      return recompute(
        { ...state, now, shelters, cursors: { ...state.cursors, availability: state.cursors.availability + 1 } },
        `Availability update: ${name}`,
      );
    }
    case 'advanceTime':
      return { ...state, now: state.now + action.minutes };
    case 'setOnline': {
      if (action.online === state.online) return state;
      if (!action.online) return { ...state, online: false, saved: view(state) };
      // Back online: show what changed since the saved snapshot.
      const lines = state.saved ? describeChange(state.saved.recommendation, state.recommendation) : [];
      const notices = lines.length
        ? [{ id: `NT-${state.seq}`, at: state.now, title: 'Reconnected: changes while offline', lines }, ...state.notices]
        : state.notices;
      return { ...state, online: true, saved: null, notices, lastChange: lines.length ? lines : state.lastChange, seq: state.seq + 1 };
    }
    case 'setFailNext':
      return { ...state, failNextMessage: action.fail };
    case 'toggleStep':
      return {
        ...state,
        checked: state.checked.includes(action.id) ? state.checked.filter((x) => x !== action.id) : [...state.checked, action.id],
      };
    case 'startJourney': {
      const id = state.recommendation.destination?.shelter.id ?? null;
      if (!id) return state;
      const next = recommend(state.household, state.shelters, state.closures, id);
      return {
        ...state,
        travellingTo: id,
        recommendation: next,
        notices: [
          { id: `NT-${state.seq}`, at: state.now, title: 'You marked that you have left', lines: [`Destination kept: ${next.destination?.shelter.name}. It will not be changed automatically.`] },
          ...state.notices,
        ],
        seq: state.seq + 1,
      };
    }
    case 'messageQueued': {
      const existing = state.messages.find((m) => m.id === action.id);
      const message: Message = existing
        ? { ...existing, state: 'sending' }
        : { id: action.id, from: 'household', author: 'You', role: state.household.name, body: action.body, at: state.now, state: 'sending' };
      return {
        ...state,
        messages: existing ? state.messages.map((m) => (m.id === action.id ? message : m)) : [...state.messages, message],
      };
    }
    case 'messageResult': {
      const failed = !state.online || state.failNextMessage;
      return {
        ...state,
        failNextMessage: failed ? false : state.failNextMessage,
        messages: state.messages.map((m) => (m.id === action.id ? { ...m, state: failed ? 'failed' : 'sent' } : m)),
      };
    }
    case 'coordinatorReply': {
      const body = scenario.coordinatorReplies[state.cursors.reply % scenario.coordinatorReplies.length]!;
      const reply: Message = {
        id: `MSG-R${state.seq}`, from: 'coordinator', author: 'Jordan Lee', role: 'Shelter coordination desk',
        body, at: state.now + 1, simulated: true,
      };
      return { ...state, now: state.now + 1, messages: [...state.messages, reply], cursors: { ...state.cursors, reply: state.cursors.reply + 1 }, seq: state.seq + 1 };
    }
    case 'reset':
      return initialState();
  }
}
