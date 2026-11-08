import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evacuationNotice, hurricaneTitle, needsOnFile, planMode, transition } from '../src/demo/hurricane';
import type { HurricaneView } from '../src/demo/live';
import type { DemoHousehold, Recommendation } from '../src/demo/types';

const peace: HurricaneView = { phase: 'peace', name: null, category: null, startedAt: null };
const active: HurricaneView = { phase: 'active', name: 'Hurricane Delia', category: 4, startedAt: '2026-11-08T12:00:00Z' };
const household: DemoHousehold = {
  id: 'h', name: 'Your household', adults: 2, children: 1, childAges: [], dogs: 1, petNote: '', wheelchairEntrance: 'yes', poweredEquipment: 'no',
  vehicle: 'no', transportHelp: 'yes', medication: true, location: { label: 'Home', lat: 0, lng: 0 },
};

test('plan mode: peace shows all clear; active and mock mode (undefined) show the evacuation plan', () => {
  assert.equal(planMode(peace), 'all-clear');
  assert.equal(planMode(active), 'evacuation');
  assert.equal(planMode(undefined), 'evacuation');
});

test('transitions are detected only between known statuses', () => {
  assert.equal(transition(null, active), 'none');
  assert.equal(transition(null, peace), 'none');
  assert.equal(transition(peace, active), 'evacuation');
  assert.equal(transition(active, peace), 'reset');
  assert.equal(transition(peace, peace), 'none');
  assert.equal(transition(active, active), 'none');
});

test('needs on file list only what applies', () => {
  assert.deepEqual(needsOnFile(household), ['3 people in your household', 'Immediate medication', 'Wheelchair-accessible entrance', 'Pets', 'No car', 'Help with transport']);
  const plain = { ...household, adults: 1, children: 0, dogs: 0, wheelchairEntrance: 'no' as const, vehicle: 'yes' as const, transportHelp: 'no' as const, medication: false };
  assert.deepEqual(needsOnFile(plain), ['1 person in your household']);
});

test('evacuation notice names the hurricane and the assigned shelter', () => {
  const rec = { destination: { shelter: { name: 'Eastside Hall', address: '12 Main St' } } } as unknown as Recommendation;
  const n = evacuationNotice('NT-2', 600, active, rec);
  assert.equal(n.title, 'Evacuation order issued');
  assert.match(n.lines.join(' '), /Hurricane Delia, Category 4/);
  assert.match(n.lines.join(' '), /Eastside Hall, 12 Main St/);
  assert.match(evacuationNotice('NT-3', 600, active, { destination: null } as unknown as Recommendation).lines[1] ?? '', /No shelter/);
  assert.equal(hurricaneTitle(active), 'Hurricane Delia · Category 4');
});
