// Maps the Haven backend (master's Litestar API) onto the resident dashboard's model. Pure functions
// only, so the mapping is testable. The backend's allocation plan decides the destination; the local
// rules are used only to explain the other shelters.
import { z } from 'zod';
import { assess, describeChange, whyNot } from './recommend';
import type { Answer, Broadcast, DemoHousehold, DemoShelter, OfficialInstruction, Recommendation, ShelterAssessment } from './types';

const point = z.object({ latitude: z.number(), longitude: z.number() });
const capabilities = z.object({
  pets_allowed: z.boolean(), child_friendly: z.boolean(), wheelchair_accessible: z.boolean(),
  medical_staff: z.array(z.string()), special_care_notes: z.string().nullable(),
});
export const liveFamilySchema = z.object({
  id: z.string(), disaster_id: z.string(), adults: z.number().int(), children: z.number().int(), location: point,
  needs: z.object({
    pets: z.boolean(), immediate_medication: z.boolean(), medical_notes: z.string().nullable(),
    accessibility_notes: z.string().nullable(), other_special_care: z.string().nullable(),
  }),
  resources: z.object({ has_car: z.boolean() }), created_at: z.string(), updated_at: z.string(),
});
export const liveShelterSchema = z.object({
  id: z.string(), disaster_id: z.string(), name: z.string(), address: z.string(), location: point,
  status: z.enum(['open', 'closed', 'full']),
  capacity: z.object({ total_people: z.number(), available_people: z.number() }),
  capabilities, updated_at: z.string(),
});
export const livePlanSchema = z.object({
  family_id: z.string(), disaster_id: z.string(), status: z.enum(['recommended', 'no_match']),
  shelter: z.object({ id: z.string(), name: z.string(), address: z.string(), location: point, status: z.enum(['open', 'closed', 'full']), capabilities }).nullable(),
  reason: z.string(), instructions: z.array(z.string()),
  alerts: z.array(z.object({ code: z.string(), severity: z.enum(['warning', 'critical']), message: z.string(), unmet_requirements: z.array(z.string()).optional() })),
  capacity_reserved: z.boolean(), version: z.number().int(), updated_at: z.string(),
});
export const liveUpdateSchema = z.object({
  id: z.string(), disaster_id: z.string(), title: z.string(), message: z.string(),
  severity: z.enum(['info', 'warning', 'critical']), published_at: z.string(),
});
export const liveDisasterSchema = z.object({ id: z.string(), type: z.string(), name: z.string(), status: z.string(), affected_area: z.string(), updated_at: z.string() });

export type LiveFamily = z.infer<typeof liveFamilySchema>;
export type LiveShelter = z.infer<typeof liveShelterSchema>;
export type LivePlan = z.infer<typeof livePlanSchema>;
export type LiveUpdate = z.infer<typeof liveUpdateSchema>;
export type LiveDisaster = z.infer<typeof liveDisasterSchema>;

/** Source label for anything published through the backend. Its demo data is fictional. */
/** The backend only records whether there are pets, not how many or what kind. */
export const PETS_UNSPECIFIED = 'Pets in household';

export const LIVE_AUTHORITY = 'Emergency management (demo data)';

/** Local wall-clock minutes. `clock()` shows local HH:MM and `ago()` works across days. */
export function localMinute(iso: string | number | Date): number {
  const d = new Date(iso);
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 60000);
}

// The backend stores accessibility and care needs as free text; these phrases round-trip the answers.
const WHEELCHAIR_YES = 'Wheelchair-accessible entrance needed';
const WHEELCHAIR_UNSURE = 'Not sure whether a wheelchair-accessible entrance is needed';
const POWER_YES = 'Uses powered essential equipment';
const POWER_UNSURE = 'May use powered essential equipment';
const TRANSPORT = 'Needs help with transport';

function powerAnswer(text: string): Answer {
  if (text.includes(POWER_UNSURE)) return 'unknown';
  return text.includes(POWER_YES) || /oxygen|ventilator|dialysis|cpap|electric|powered/i.test(text) ? 'yes' : 'no';
}

export function householdFromFamily(f: LiveFamily, label: string): DemoHousehold {
  const access = f.needs.accessibility_notes ?? '';
  const care = [f.needs.medical_notes, f.needs.other_special_care].filter(Boolean).join(' ');
  return {
    id: f.id,
    name: 'Your household',
    adults: f.adults,
    children: f.children,
    childAges: [],
    dogs: f.needs.pets ? 1 : 0,
    petNote: f.needs.pets ? PETS_UNSPECIFIED : '',
    // The backend treats any accessibility note as needing a wheelchair-accessible shelter.
    wheelchairEntrance: !access ? 'no' : access === WHEELCHAIR_UNSURE ? 'unknown' : 'yes',
    poweredEquipment: powerAnswer(care),
    vehicle: f.resources.has_car ? 'yes' : 'no',
    transportHelp: care.includes(TRANSPORT) ? 'yes' : 'no',
    location: { label, lat: f.location.latitude, lng: f.location.longitude },
  };
}

/** PATCH body for the household editor. Keeps unrelated free-text notes the backend already has. */
export function familyPatch(h: DemoHousehold, current: LiveFamily | null) {
  const strip = (text: string | null | undefined, phrases: string[]) =>
    phrases.reduce((t, p) => t.replace(p, ''), text ?? '').replace(/(;\s*)+/g, '; ').replace(/^;\s*|;\s*$/g, '').trim();
  const access = current?.needs.accessibility_notes ?? '';
  const custom = strip(access, [WHEELCHAIR_YES, WHEELCHAIR_UNSURE]);
  const accessibility = h.wheelchairEntrance === 'no' ? null
    : h.wheelchairEntrance === 'unknown' ? WHEELCHAIR_UNSURE
    : custom || WHEELCHAIR_YES;
  const other = [strip(current?.needs.other_special_care, [POWER_YES, POWER_UNSURE, TRANSPORT])];
  if (h.poweredEquipment === 'yes') other.push(POWER_YES);
  if (h.poweredEquipment === 'unknown') other.push(POWER_UNSURE);
  if (h.transportHelp === 'yes') other.push(TRANSPORT);
  const otherText = other.filter(Boolean).join('; ');
  return {
    adults: h.adults,
    children: h.children,
    needs: { pets: h.dogs > 0, accessibility_notes: accessibility, other_special_care: otherText || null },
    resources: { has_car: h.vehicle === 'yes' },
  };
}

/** Backend shelters carry no routes, so travel time stays unknown; no road route is invented. */
export function shelterFromApi(s: LiveShelter): DemoShelter {
  const cap = (on: boolean, yes: string, no: string, at: number) => ({ state: on ? 'confirmed' as const : 'not_available' as const, detail: on ? yes : no, reportedAt: at });
  const at = localMinute(s.updated_at);
  return {
    id: s.id, name: s.name, address: s.address, operator: 'Shelter operator', lat: s.location.latitude, lng: s.location.longitude,
    status: s.status === 'closed' ? 'closed' : 'open',
    spaces: s.status === 'full' ? 0 : s.capacity.available_people,
    spacesReportedAt: at,
    capabilities: {
      wheelchairEntrance: cap(s.capabilities.wheelchair_accessible, 'Listed as wheelchair accessible', 'Not listed as wheelchair accessible', at),
      dogs: cap(s.capabilities.pets_allowed, 'Pets allowed', 'Pets not allowed', at),
      children: cap(s.capabilities.child_friendly, 'Child friendly', 'Not listed as child friendly', at),
      poweredEquipment: { state: 'unknown', detail: 'Backup power is not reported by this service', reportedAt: at },
    },
    routes: [],
  };
}

/** Straight-line distance in km. Shown labelled as such; never presented as a road route. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** The backend plan is the decision. Local checks only add detail and explain other shelters. */
export function recommendationFromPlan(plan: LivePlan, h: DemoHousehold, shelters: DemoShelter[]): Recommendation {
  const all = shelters.map((s) => assess(h, s, []));
  const householdUnknowns: string[] = [];
  if (h.wheelchairEntrance === 'unknown') householdUnknowns.push('Whether anyone needs a wheelchair-accessible entrance');
  if (h.poweredEquipment === 'unknown') householdUnknowns.push('Whether anyone needs power for essential equipment');

  let destination: ShelterAssessment | null = null;
  if (plan.status === 'recommended' && plan.shelter) {
    destination = all.find((a) => a.shelter.id === plan.shelter!.id) ?? assess(h, shelterFromApi({
      ...plan.shelter, disaster_id: plan.disaster_id, capacity: { total_people: 0, available_people: 0 }, updated_at: plan.updated_at,
    }), []);
  }
  const mismatch = plan.alerts.some((a) => a.severity === 'critical' || a.code === 'shelter_needs_mismatch' || a.code === 'shelter_capacity_overflow');
  const status: Recommendation['status'] = !destination ? 'none' : mismatch || destination.blockers.length > 0 ? 'unverified' : 'recommended';
  const rest = all.filter((a) => a.shelter.id !== destination?.shelter.id)
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.unresolved.length - b.unresolved.length || a.shelter.name.localeCompare(b.shelter.name));
  return {
    status,
    destination,
    alternatives: rest.map((a) => ({ assessment: a, whyNot: a.eligible ? 'Not chosen by the coordinators’ allocation plan.' : whyNot(a, destination) })),
    householdUnknowns,
    keptBecauseTravelling: false,
    advisory: null,
    reserved: !!destination && plan.capacity_reserved,
    planAlerts: plan.alerts.map((a) => a.message),
  };
}

export function broadcastsFromUpdates(updates: LiveUpdate[]): Broadcast[] {
  return [...updates].sort((a, b) => b.published_at.localeCompare(a.published_at)).map((u) => ({
    id: u.id, title: u.title, body: u.message, authority: LIVE_AUTHORITY, at: localMinute(u.published_at),
    severity: u.severity === 'critical' ? 'critical' : u.severity === 'warning' ? 'attention' : 'info',
  }));
}

/** The newest critical (else warning) update becomes the official instruction band. */
export function instructionFromUpdates(updates: LiveUpdate[]): OfficialInstruction | null {
  const sorted = [...updates].sort((a, b) => b.published_at.localeCompare(a.published_at));
  const top = sorted.find((u) => u.severity === 'critical') ?? sorted.find((u) => u.severity === 'warning');
  if (!top) return null;
  return { id: top.id, level: top.severity === 'critical' ? 'mandatory' : 'advisory', headline: top.title, details: top.message, authority: LIVE_AUTHORITY, issuedAt: localMinute(top.published_at) };
}

export { describeChange };
