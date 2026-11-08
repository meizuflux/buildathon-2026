// Haven backend contract and its mapping onto the resident app model. Pure functions only, so the
// mapping is testable. The backend's allocation plan decides the destination.
import { z } from 'zod';
import { assess, householdUnknowns, whyNot } from './rules';
import { localMinute } from './time';
import type { Answer, Broadcast, Household, OfficialInstruction, Recommendation, Shelter, ShelterAssessment } from './types';

const point = z.object({ latitude: z.number(), longitude: z.number() });
const capabilities = z.object({
  pets_allowed: z.boolean(), child_friendly: z.boolean(), wheelchair_accessible: z.boolean(),
  medical_staff: z.array(z.string()), special_care_notes: z.string().nullable(),
});
export const familySchema = z.object({
  id: z.string(), disaster_id: z.string(), adults: z.number().int(), children: z.number().int(), location: point,
  needs: z.object({
    pets: z.boolean(), immediate_medication: z.boolean(), medical_notes: z.string().nullable(),
    accessibility_notes: z.string().nullable(), other_special_care: z.string().nullable(),
  }),
  resources: z.object({ has_car: z.boolean() }), created_at: z.string(), updated_at: z.string(),
});
export const shelterSchema = z.object({
  id: z.string(), disaster_id: z.string(), name: z.string(), address: z.string(), location: point,
  status: z.enum(['open', 'closed', 'full']),
  capacity: z.object({ total_people: z.number(), available_people: z.number() }),
  capabilities, updated_at: z.string(),
});
export const planSchema = z.object({
  family_id: z.string(), disaster_id: z.string(), status: z.enum(['recommended', 'no_match']),
  shelter: z.object({ id: z.string(), name: z.string(), address: z.string(), location: point, status: z.enum(['open', 'closed', 'full']), capabilities }).nullable(),
  reason: z.string(), instructions: z.array(z.string()),
  alerts: z.array(z.object({ code: z.string(), severity: z.enum(['warning', 'critical']), message: z.string() })),
  capacity_reserved: z.boolean(), version: z.number().int(), updated_at: z.string(),
});
export const updateSchema = z.object({
  id: z.string(), disaster_id: z.string(), title: z.string(), message: z.string(),
  severity: z.enum(['info', 'warning', 'critical']), published_at: z.string(),
});
export const disasterSchema = z.object({ id: z.string(), type: z.string(), name: z.string(), status: z.string(), affected_area: z.string(), updated_at: z.string() });
export const hurricaneSchema = z.object({ phase: z.enum(['peace', 'active']), started_at: z.string().nullable() });
export type ApiHurricane = z.infer<typeof hurricaneSchema>;

export type ApiFamily = z.infer<typeof familySchema>;
export type ApiShelter = z.infer<typeof shelterSchema>;
export type ApiPlan = z.infer<typeof planSchema>;
export type ApiUpdate = z.infer<typeof updateSchema>;
export type ApiDisaster = z.infer<typeof disasterSchema>;

/** Source label for official updates published through the coordination service. */
export const AUTHORITY = 'Emergency management';

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

export function householdFromFamily(f: ApiFamily, label: string): Household {
  const access = f.needs.accessibility_notes ?? '';
  const care = [f.needs.medical_notes, f.needs.other_special_care].filter(Boolean).join(' ');
  return {
    id: f.id,
    adults: f.adults,
    children: f.children,
    pets: f.needs.pets,
    // The backend treats any accessibility note as needing a wheelchair-accessible shelter.
    wheelchairEntrance: !access ? 'no' : access === WHEELCHAIR_UNSURE ? 'unknown' : 'yes',
    poweredEquipment: powerAnswer(care),
    vehicle: f.resources.has_car ? 'yes' : 'no',
    transportHelp: care.includes(TRANSPORT) ? 'yes' : 'no',
    location: { label, lat: f.location.latitude, lng: f.location.longitude },
  };
}

/** PATCH body for household edits. Keeps unrelated free-text notes the backend already has. */
export function familyPatch(h: Household, current: ApiFamily | null) {
  const strip = (text: string | null | undefined, phrases: string[]) =>
    phrases.reduce((t, p) => t.replace(p, ''), text ?? '').replace(/(;\s*)+/g, '; ').replace(/^;\s*|;\s*$/g, '').trim();
  const custom = strip(current?.needs.accessibility_notes, [WHEELCHAIR_YES, WHEELCHAIR_UNSURE]);
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
    needs: { pets: h.pets, accessibility_notes: accessibility, other_special_care: otherText || null },
    resources: { has_car: h.vehicle === 'yes' },
  };
}

export function shelterFromApi(s: ApiShelter): Shelter {
  const cap = (on: boolean, yes: string, no: string) => ({ state: on ? 'confirmed' as const : 'not_available' as const, detail: on ? yes : no });
  return {
    id: s.id, name: s.name, address: s.address, lat: s.location.latitude, lng: s.location.longitude,
    status: s.status === 'closed' ? 'closed' : 'open',
    spaces: s.status === 'full' ? 0 : s.capacity.available_people,
    spacesReportedAt: localMinute(s.updated_at),
    capabilities: {
      wheelchairEntrance: cap(s.capabilities.wheelchair_accessible, 'Listed as wheelchair accessible', 'Not listed as wheelchair accessible'),
      pets: cap(s.capabilities.pets_allowed, 'Pets allowed', 'Pets not allowed'),
      children: cap(s.capabilities.child_friendly, 'Child friendly', 'Not listed as child friendly'),
      // The service does not report backup power, so it is always unconfirmed.
      poweredEquipment: { state: 'unknown', detail: 'Backup power is not reported by the service' },
    },
  };
}

/** Straight-line distance in km. Always labelled as such; never presented as a road route. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** The backend plan is the decision. Local checks only add detail and explain the other shelters. */
export function recommendationFromPlan(plan: ApiPlan, h: Household, shelters: Shelter[]): Recommendation {
  const all = shelters.map((s) => assess(h, s));
  let destination: ShelterAssessment | null = null;
  if (plan.status === 'recommended' && plan.shelter) {
    const listed = all.find((a) => a.shelter.id === plan.shelter!.id);
    destination = listed ?? assess(h, shelterFromApi({
      ...plan.shelter, disaster_id: plan.disaster_id, capacity: { total_people: 0, available_people: 0 }, updated_at: plan.updated_at,
    }));
  }
  const mismatch = plan.alerts.some((a) => a.severity === 'critical' || a.code === 'shelter_needs_mismatch' || a.code === 'shelter_capacity_overflow');
  const status: Recommendation['status'] = !destination ? 'none' : mismatch || destination.blockers.length > 0 ? 'unverified' : 'recommended';
  const rest = all.filter((a) => a.shelter.id !== destination?.shelter.id)
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.unresolved.length - b.unresolved.length || a.shelter.name.localeCompare(b.shelter.name));
  return {
    status,
    destination,
    alternatives: rest.map((a) => ({ assessment: a, whyNot: whyNot(a) })),
    householdUnknowns: householdUnknowns(h),
    reserved: !!destination && plan.capacity_reserved,
  };
}

export function broadcastsFromUpdates(updates: ApiUpdate[]): Broadcast[] {
  return [...updates].sort((a, b) => b.published_at.localeCompare(a.published_at)).map((u) => ({
    id: u.id, title: u.title, body: u.message, authority: AUTHORITY, at: localMinute(u.published_at),
    severity: u.severity === 'critical' ? 'critical' : u.severity === 'warning' ? 'attention' : 'info',
  }));
}

/** The newest critical (else warning) update becomes the official instruction band. */
export function instructionFromUpdates(updates: ApiUpdate[]): OfficialInstruction | null {
  const sorted = [...updates].sort((a, b) => b.published_at.localeCompare(a.published_at));
  const top = sorted.find((u) => u.severity === 'critical') ?? sorted.find((u) => u.severity === 'warning');
  if (!top) return null;
  return { id: top.id, level: top.severity === 'critical' ? 'mandatory' : 'advisory', headline: top.title, details: top.message, authority: AUTHORITY, issuedAt: localMinute(top.published_at) };
}
