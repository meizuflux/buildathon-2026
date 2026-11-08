import test from 'node:test';
import assert from 'node:assert/strict';
import { peopleError, summarizePets, initialPets } from '../src/utils/household';
import { coordinate, distanceMiles, showSafetyStatus } from '../src/utils/shelter';
import { householdInputSchema, planSchema } from '../src/types/models';
import { households, makePlan } from '../src/mocks/fixtures';

test('household total includes children and rejects invalid combinations', () => {
  assert.equal(peopleError(4, 2), '');
  assert.equal(peopleError(2, 2), '');
  for (const [total, children] of [[0, 0], [2, 3], [4.5, 2], [4, -1], [4, 1.5], [61, 1], [4, NaN]]) assert.notEqual(peopleError(total!, children!), '');
  assert(householdInputSchema.safeParse({ ...households()[0]!, adults: 0, children: 2 }).success);
  assert(!householdInputSchema.safeParse({ ...households()[0]!, adults: 0, children: 0 }).success);
});
test('per-type pet counts round-trip, and legacy pet descriptions are preserved', () => {
  const counts = { Dogs: 2, Cats: 1, Birds: 0, Rabbits: 0, Other: 3 };
  const summary = summarizePets(counts, 'Turtles');
  assert.equal(summary.pets, 6);
  const profile = householdInputSchema.parse({ ...households()[0]!, ...summary });
  assert.deepEqual(initialPets({ ...households()[0]!, ...profile }).counts, counts);
  assert.equal(initialPets({ ...households()[0]!, petTypes: 'Dog', pets: 2 }).counts.Dogs, 2);
  const legacy = initialPets({ ...households()[0]!, petTypes: '1 dog, 2 cats', pets: 3 });
  assert.equal(legacy.counts.Other, 3);
  assert.equal(legacy.other, '1 dog, 2 cats');
  assert(!householdInputSchema.safeParse({ ...profile, pets: 5 }).success);
  assert(!householdInputSchema.safeParse({ ...profile, ...summarizePets({ ...counts, Other: 1 }, '') }).success);
});
test('shelter coordinates are optional and approximate distance handles missing and zero coordinates', () => {
  const shelter = makePlan(households()[0]!).shelterAssignment!;
  assert(planSchema.safeParse(makePlan(households()[0]!)).success);
  assert.equal(coordinate({ latitude: 0, longitude: 0 })?.latitude, 0);
  assert.equal(coordinate({ latitude: 12 }), null);
  assert.equal(coordinate({ latitude: NaN, longitude: 1 }), null);
  assert.equal(coordinate({ latitude: 100, longitude: 1 }), null);
  assert(shelter.coordinates);
  assert.equal(distanceMiles(shelter.coordinates, shelter.coordinates), 0);
  assert(Math.abs(distanceMiles({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }) - 69.093) < 0.01);
});
test('hurricane views hide safety status while other hazard views retain it', () => {
  assert.equal(showSafetyStatus('Hurricanes'), false);
  assert.equal(showSafetyStatus('All', 'Hurricane'), false);
  for (const hazard of ['Flood', 'Earthquake', 'Wildfire', 'Storm']) assert.equal(showSafetyStatus('All', hazard), true);
  for (const filter of ['Floods', 'Quakes', 'Fire', 'Storms']) assert.equal(showSafetyStatus(filter), true);
});
