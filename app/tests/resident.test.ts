import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  broadcastsFromUpdates, familyPatch, householdFromFamily, instructionFromUpdates, recommendationFromPlan, shelterFromApi,
  type ApiFamily, type ApiPlan, type ApiShelter,
} from '../src/resident/api';
import { checklistAfterSync, preparationSteps } from '../src/resident/checklist';
import { describeChange } from '../src/resident/rules';
import { clock, localMinute } from '../src/resident/time';

const family: ApiFamily = {
  id: 'fam_1', disaster_id: 'dis_1', adults: 2, children: 2, location: { latitude: 26.2, longitude: -81.6 },
  needs: { pets: true, immediate_medication: false, medical_notes: null, accessibility_notes: 'Uses a wheelchair', other_special_care: 'Allergic to latex' },
  resources: { has_car: true }, created_at: '2026-11-08T10:00:00Z', updated_at: '2026-11-08T10:00:00Z',
};
const caps = (wheel: boolean, pets: boolean) => ({ pets_allowed: pets, child_friendly: true, wheelchair_accessible: wheel, medical_staff: [], special_care_notes: null });
const shelter = (id: string, wheel: boolean, pets: boolean, available = 50, status: ApiShelter['status'] = 'open'): ApiShelter => ({
  id, disaster_id: 'dis_1', name: `Shelter ${id}`, address: `${id} Road`, location: { latitude: 26.25, longitude: -81.6 },
  status, capacity: { total_people: 100, available_people: available }, capabilities: caps(wheel, pets), updated_at: '2026-11-08T11:00:00Z',
});
const plan = (shelterId: string | null, alerts: ApiPlan['alerts'] = []): ApiPlan => ({
  family_id: 'fam_1', disaster_id: 'dis_1', status: shelterId ? 'recommended' : 'no_match',
  shelter: shelterId ? { id: shelterId, name: `Shelter ${shelterId}`, address: '', location: { latitude: 26.25, longitude: -81.6 }, status: 'open', capabilities: caps(true, true) } : null,
  reason: '', instructions: [], alerts, capacity_reserved: !!shelterId, version: 1, updated_at: '2026-11-08T11:00:00Z',
});
const h = () => householdFromFamily(family, 'Home');

test('family maps to household: any accessibility note means a wheelchair entrance is needed', () => {
  const household = h();
  assert.equal(household.wheelchairEntrance, 'yes');
  assert.equal(household.pets, true);
  assert.equal(household.vehicle, 'yes');
  assert.equal(household.poweredEquipment, 'no');
});

test('household edits round-trip through the backend patch and keep unrelated notes', () => {
  const edited = { ...h(), wheelchairEntrance: 'unknown' as const, poweredEquipment: 'yes' as const, pets: false };
  const patch = familyPatch(edited, family);
  assert.equal(patch.needs.pets, false);
  assert.match(patch.needs.other_special_care ?? '', /Allergic to latex/);
  const back = householdFromFamily({ ...family, needs: { ...family.needs, ...patch.needs } }, 'Home');
  assert.equal(back.wheelchairEntrance, 'unknown');
  assert.equal(back.poweredEquipment, 'yes');
  assert.equal(familyPatch({ ...edited, wheelchairEntrance: 'no' }, family).needs.accessibility_notes, null);
  // A custom accessibility note is kept while the answer stays "yes".
  assert.equal(familyPatch({ ...edited, wheelchairEntrance: 'yes' }, family).needs.accessibility_notes, 'Uses a wheelchair');
});

test('the backend plan decides the destination; other shelters are explained', () => {
  const list = [shelter('A', true, true), shelter('B', false, true), shelter('C', true, true, 0, 'full')].map(shelterFromApi);
  const rec = recommendationFromPlan(plan('A'), h(), list);
  assert.equal(rec.status, 'recommended');
  assert.equal(rec.destination?.shelter.id, 'A');
  assert.equal(rec.reserved, true);
  assert.deepEqual(rec.destination?.blockers, []);
  assert.match(rec.alternatives.find((a) => a.assessment.shelter.id === 'B')?.whyNot ?? '', /not wheelchair accessible/i);
  assert.match(rec.alternatives.find((a) => a.assessment.shelter.id === 'C')?.whyNot ?? '', /full/i);
});

test('backup power is never reported, so a household that needs it sees it as unresolved', () => {
  const household = { ...h(), poweredEquipment: 'yes' as const };
  const rec = recommendationFromPlan(plan('A'), household, [shelter('A', true, true)].map(shelterFromApi));
  assert.ok(rec.destination?.unresolved.includes('Backup power not confirmed'));
});

test('a needs-mismatch alert makes the plan unverified, and no_match means none', () => {
  const list = [shelter('B', false, true)].map(shelterFromApi);
  assert.equal(recommendationFromPlan(plan('B', [{ code: 'shelter_needs_mismatch', severity: 'critical', message: 'x' }]), h(), list).status, 'unverified');
  const none = recommendationFromPlan(plan(null), h(), list);
  assert.equal(none.status, 'none');
  assert.equal(none.reserved, false);
});

test('describeChange explains a new destination and new unknowns', () => {
  const list = [shelter('A', true, true), shelter('D', true, true)].map(shelterFromApi);
  const before = recommendationFromPlan(plan('A'), h(), list);
  const after = recommendationFromPlan(plan('D'), { ...h(), poweredEquipment: 'unknown' }, list);
  const lines = describeChange(before, after);
  assert.ok(lines.some((l) => l.includes('changed from Shelter A to Shelter D')));
  assert.ok(lines.some((l) => l.startsWith('Not yet known')));
  assert.deepEqual(describeChange(before, before), []);
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

test('checklist follows the household profile and gives no medical treatment advice', () => {
  const ids = preparationSteps(h()).map((s) => s.id);
  assert.deepEqual(ids, ['medication', 'mobility', 'pets', 'children', 'transport', 'documents']);
  const minimal = preparationSteps({ ...h(), pets: false, children: 0, wheelchairEntrance: 'no', vehicle: 'no' });
  assert.deepEqual(minimal.map((s) => s.id), ['medication', 'transport', 'documents']);
  assert.ok(!preparationSteps(h()).some((s) => /dose|take \d|treat/i.test(`${s.title} ${s.detail ?? ''}`)));
});

test('local times format as HH:MM in the device time zone', () => {
  const d = new Date(2026, 10, 8, 9, 5);
  assert.equal(clock(localMinute(d)), '09:05');
});

const active = { phase: 'active' as const, started_at: '2026-11-08T10:00:00Z' };
const peace = { phase: 'peace' as const, started_at: null };

test('returning to peace clears every completed item, including saved items from a prior app session', () => {
  const checked = preparationSteps(h()).map((step) => step.id);
  const saved = JSON.parse(JSON.stringify({ checked, hurricane: active }));
  assert.deepEqual(checklistAfterSync(saved.checked, saved.hurricane, peace), []);
  assert.deepEqual(checklistAfterSync(checked, undefined, peace), []);
});

test('routine polling and reopening in the same phase preserve new checklist progress', () => {
  const checked = ['medication', 'documents'];
  assert.deepEqual(checklistAfterSync(checked, active, active), checked);
  assert.deepEqual(checklistAfterSync(checked, peace, peace), checked);
  assert.deepEqual(checklistAfterSync(checked, peace, active), checked);
  assert.deepEqual(checklistAfterSync(checked, undefined, active), checked);
});

test('a reset and new hurricane while the app was closed clears the old checklist', () => {
  assert.deepEqual(checklistAfterSync(['medication'], active, { ...active, started_at: '2026-11-09T10:00:00Z' }), []);
});
