import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  broadcastsFromUpdates, familyPatch, hurricaneFromApi, householdFromFamily, liveHurricaneSchema, instructionFromUpdates, recommendationFromPlan, shelterFromApi,
  type LiveFamily, type LivePlan, type LiveShelter,
} from '../src/demo/live';

const family: LiveFamily = {
  id: 'fam_1', disaster_id: 'dis_1', adults: 2, children: 2, location: { latitude: 26.2, longitude: -81.6 },
  needs: { pets: true, immediate_medication: false, medical_notes: null, accessibility_notes: 'Uses a wheelchair', other_special_care: 'Allergic to latex' },
  resources: { has_car: true }, created_at: '2026-11-08T10:00:00Z', updated_at: '2026-11-08T10:00:00Z',
};
const caps = (wheel: boolean, pets: boolean) => ({ pets_allowed: pets, child_friendly: true, wheelchair_accessible: wheel, medical_staff: [], special_care_notes: null });
const shelter = (id: string, wheel: boolean, pets: boolean, available = 50, status: LiveShelter['status'] = 'open'): LiveShelter => ({
  id, disaster_id: 'dis_1', name: `Shelter ${id}`, address: `${id} Road`, location: { latitude: 26.25, longitude: -81.6 },
  status, capacity: { total_people: 100, available_people: available }, capabilities: caps(wheel, pets), updated_at: '2026-11-08T11:00:00Z',
});
const plan = (shelterId: string | null, alerts: LivePlan['alerts'] = []): LivePlan => ({
  family_id: 'fam_1', disaster_id: 'dis_1', status: shelterId ? 'recommended' : 'no_match',
  shelter: shelterId ? { id: shelterId, name: `Shelter ${shelterId}`, address: '', location: { latitude: 26.25, longitude: -81.6 }, status: 'open', capabilities: caps(true, true) } : null,
  reason: '', instructions: [], alerts, capacity_reserved: !!shelterId, version: 1, updated_at: '2026-11-08T11:00:00Z',
});

test('family maps to household: accessibility notes mean a wheelchair entrance is needed', () => {
  const h = householdFromFamily(family, 'Home');
  assert.equal(h.wheelchairEntrance, 'yes');
  assert.equal(h.dogs, 1);
  assert.equal(h.vehicle, 'yes');
  assert.equal(h.poweredEquipment, 'no');
});

test('household edits round-trip through the backend patch and keep unrelated notes', () => {
  const h = { ...householdFromFamily(family, 'Home'), wheelchairEntrance: 'unknown' as const, poweredEquipment: 'yes' as const, dogs: 0 };
  const patch = familyPatch(h, family);
  assert.equal(patch.needs.pets, false);
  assert.match(patch.needs.other_special_care ?? '', /Allergic to latex/);
  const back = householdFromFamily({ ...family, needs: { ...family.needs, ...patch.needs } }, 'Home');
  assert.equal(back.wheelchairEntrance, 'unknown');
  assert.equal(back.poweredEquipment, 'yes');
  assert.equal(familyPatch({ ...h, wheelchairEntrance: 'no' }, family).needs.accessibility_notes, null);
  // An existing custom accessibility note is kept when the answer stays "yes".
  assert.equal(familyPatch({ ...h, wheelchairEntrance: 'yes' }, family).needs.accessibility_notes, 'Uses a wheelchair');
});

test('the backend plan decides the destination; others are explained', () => {
  const h = householdFromFamily(family, 'Home');
  const list = [shelter('A', true, true), shelter('B', false, true), shelter('C', true, true, 0, 'full')].map(shelterFromApi);
  const rec = recommendationFromPlan(plan('A'), h, list);
  assert.equal(rec.status, 'recommended');
  assert.equal(rec.destination?.shelter.id, 'A');
  assert.equal(rec.reserved, true);
  assert.equal(rec.destination?.route, null);
  assert.deepEqual(rec.destination?.blockers, []);
  const b = rec.alternatives.find((a) => a.assessment.shelter.id === 'B');
  assert.match(b?.whyNot ?? '', /not wheelchair accessible/i);
  assert.match(rec.alternatives.find((a) => a.assessment.shelter.id === 'C')?.whyNot ?? '', /full/i);
});

test('a plan with a needs-mismatch alert is shown as unverified, and no_match as none', () => {
  const h = householdFromFamily(family, 'Home');
  const list = [shelter('B', false, true)].map(shelterFromApi);
  assert.equal(recommendationFromPlan(plan('B', [{ code: 'shelter_needs_mismatch', severity: 'critical', message: 'x' }]), h, list).status, 'unverified');
  const none = recommendationFromPlan(plan(null), h, list);
  assert.equal(none.status, 'none');
  assert.equal(none.reserved, false);
});

test('updates become broadcasts and the newest critical one is the instruction', () => {
  const updates = [
    { id: 'u1', disaster_id: 'dis_1', title: 'Evacuate', message: 'Go now', severity: 'critical' as const, published_at: '2026-11-08T09:00:00Z' },
    { id: 'u2', disaster_id: 'dis_1', title: 'Water', message: 'Boil', severity: 'info' as const, published_at: '2026-11-08T12:00:00Z' },
  ];
  assert.deepEqual(broadcastsFromUpdates(updates).map((b) => b.id), ['u2', 'u1']);
  const instruction = instructionFromUpdates(updates);
  assert.equal(instruction?.headline, 'Evacuate');
  assert.equal(instruction?.level, 'mandatory');
  assert.equal(instructionFromUpdates([updates[1]!]), null);
});

test('hurricane status maps to the app view; peace carries no name or category', () => {
  const peace = liveHurricaneSchema.parse({ disaster_id: 'dis_1', phase: 'peace', hurricane: null, started_at: null, updated_at: null });
  assert.deepEqual(hurricaneFromApi(peace), { phase: 'peace', name: null, category: null, startedAt: null });
  const active = liveHurricaneSchema.parse({ disaster_id: 'dis_1', phase: 'active', hurricane: { name: 'Hurricane Delia', category: 4 }, started_at: '2026-11-08T12:00:00Z', updated_at: '2026-11-08T12:00:00Z' });
  assert.deepEqual(hurricaneFromApi(active), { phase: 'active', name: 'Hurricane Delia', category: 4, startedAt: '2026-11-08T12:00:00Z' });
  assert.throws(() => liveHurricaneSchema.parse({ disaster_id: 'x', phase: 'unknown', hurricane: null, started_at: null, updated_at: null }));
});

test('household maps immediate medication', () => {
  assert.equal(householdFromFamily({ ...family, needs: { ...family.needs, immediate_medication: true } }, 'Home').medication, true);
});
