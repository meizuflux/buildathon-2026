import test from 'node:test';
import assert from 'node:assert/strict';
import { recommend } from '../src/demo/recommend';
import { initialState, reducer, view, type Action, type DemoState } from '../src/demo/state';
import * as scenario from '../src/demo/scenario';

const run = (...actions: Action[]) => actions.reduce<DemoState>(reducer, initialState());

test('initially recommends the farther shelter that meets the wheelchair and dog requirements', () => {
  const r = initialState().recommendation;
  assert.equal(r.status, 'recommended');
  assert.equal(r.destination?.shelter.name, 'Lakeview Recreation Center');
  assert.deepEqual(r.destination?.checks.map((c) => c.state), ['confirmed', 'confirmed', 'confirmed']);
  const nearest = r.alternatives.find((a) => a.assessment.shelter.id === 'SH-03');
  assert.ok(nearest, 'nearest shelter listed as an alternative');
  assert.match(nearest.whyNot, /not wheelchair accessible/);
  const unverified = r.alternatives.find((a) => a.assessment.shelter.id === 'SH-07');
  assert.match(unverified!.whyNot, /wheelchair access not confirmed/);
});

test('a "Not sure" wheelchair answer keeps the confirmed shelter and flags the unknown', () => {
  const s = run({ type: 'setHousehold', household: { ...scenario.household, wheelchairEntrance: 'unknown' } });
  assert.equal(s.recommendation.destination?.shelter.id, 'SH-11');
  assert.deepEqual(s.recommendation.householdUnknowns, ['Whether anyone needs a wheelchair-accessible entrance']);
  assert.ok(s.lastChange.some((l) => l.includes('Not yet known')));
});

test('without the wheelchair requirement the nearer pet-friendly shelter can win', () => {
  const r = recommend({ ...scenario.household, wheelchairEntrance: 'no' }, scenario.shelters, [], null);
  // Northgate accepts dogs and is closer; Bayview does not accept dogs.
  assert.equal(r.destination?.shelter.id, 'SH-07');
});

test('first road closure reroutes, second makes the route unavailable', () => {
  const one = run({ type: 'triggerClosure' });
  assert.equal(one.recommendation.destination?.shelter.id, 'SH-11');
  assert.equal(one.recommendation.destination?.route?.id, 'R-11B');
  assert.ok(one.recommendation.destination?.rerouted);
  assert.ok(one.lastChange[0]?.includes('Sligh Ave and Habana Ave'));

  const two = reducer(one, { type: 'triggerClosure' });
  // Lakeview unreachable; Northgate is reachable but wheelchair access is unconfirmed.
  assert.equal(two.recommendation.status, 'unverified');
  assert.equal(two.recommendation.destination?.shelter.id, 'SH-07');
  const lakeview = two.recommendation.alternatives.find((a) => a.assessment.shelter.id === 'SH-11');
  assert.match(lakeview!.whyNot, /No route available/);
});

test('availability updates: fewer spaces is noted, then full means no verified destination', () => {
  const low = run({ type: 'updateAvailability' });
  assert.equal(low.recommendation.destination?.shelter.id, 'SH-11');
  assert.ok(low.lastChange.some((l) => l.includes('6 spaces')));
  const full = reducer(low, { type: 'updateAvailability' });
  assert.equal(full.recommendation.status, 'unverified');
  assert.notEqual(full.recommendation.destination?.shelter.id, 'SH-11');
});

test('after the household leaves, the destination is never silently replaced', () => {
  const s = run({ type: 'startJourney' }, { type: 'updateAvailability' }, { type: 'updateAvailability' });
  assert.equal(s.travellingTo, 'SH-11');
  assert.equal(s.recommendation.destination?.shelter.id, 'SH-11');
  assert.ok(s.recommendation.keptBecauseTravelling);
  assert.match(s.recommendation.advisory ?? '', /has not been changed/);
});

test('offline freezes the resident view and reconnecting reports what changed', () => {
  const off = run({ type: 'setOnline', online: false }, { type: 'triggerClosure' });
  assert.equal(view(off).closures.length, 0, 'saved view does not show the new closure');
  assert.equal(off.closures.length, 1);
  const on = reducer(off, { type: 'setOnline', online: true });
  assert.equal(view(on).closures.length, 1);
  assert.equal(on.notices[0]?.title, 'Reconnected: changes while offline');
});

test('a failed message keeps its text and can be retried', () => {
  const failed = run({ type: 'setFailNext', fail: true }, { type: 'messageQueued', id: 'M1', body: 'Our dog is large.' }, { type: 'messageResult', id: 'M1' });
  const msg = failed.messages.find((m) => m.id === 'M1');
  assert.equal(msg?.state, 'failed');
  assert.equal(msg?.body, 'Our dog is large.');
  const retried = [{ type: 'messageQueued', id: 'M1', body: '' } as Action, { type: 'messageResult', id: 'M1' } as Action].reduce(reducer, failed);
  assert.equal(retried.messages.find((m) => m.id === 'M1')?.state, 'sent');
  assert.equal(retried.messages.filter((m) => m.id === 'M1').length, 1);
});

test('reset restores the scenario exactly and the demo is deterministic', () => {
  const played = run({ type: 'triggerClosure' }, { type: 'sendBroadcast' }, { type: 'updateAvailability' }, { type: 'toggleStep', id: 'pets' });
  assert.deepEqual(reducer(played, { type: 'reset' }), initialState());
  const again = run({ type: 'triggerClosure' }, { type: 'sendBroadcast' }, { type: 'updateAvailability' }, { type: 'toggleStep', id: 'pets' });
  assert.deepEqual(again, played);
});

test('presenter scripts stop cleanly when exhausted', () => {
  const s = run({ type: 'triggerClosure' }, { type: 'triggerClosure' }, { type: 'triggerClosure' });
  assert.equal(s.closures.length, 2);
});

test('no copy calls a destination "safe" or gives a score', () => {
  const text = JSON.stringify([scenario, initialState().recommendation]).toLowerCase();
  assert.doesNotMatch(text, /\bsafe\b|score|confidence/);
});
