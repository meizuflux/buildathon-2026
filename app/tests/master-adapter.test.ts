import test from 'node:test';
import assert from 'node:assert/strict';
import { familyPayload, mapPlan } from '../src/services/adapters/masterAdapter';
import { households } from '../src/mocks/fixtures';
import type { MasterPlan } from '../src/services/api/masterSchemas';
test('master payload requires explicit location and disaster and does not infer immediate medication', () => {
  const input = { ...households()[0]!, disasterId: 'disaster-1', location: { label: 'Tampa', latitude: 27.95, longitude: -82.46 }, needs: ['Essential medication'] };
  const payload = familyPayload(input);
  assert.equal(payload.needs.immediate_medication, false); assert.equal(payload.needs.medical_notes, 'Essential medication');
  assert.equal(familyPayload({ ...input, needs: ['Medication needed immediately'] }).needs.immediate_medication, true);
  assert(!('name' in payload)); assert(!('petDetails' in payload)); assert(!payload.needs.other_special_care);
  assert.throws(() => familyPayload({ ...input, disasterId: undefined }), /Select the disaster/);
  assert.throws(() => familyPayload({ ...input, location: { label: 'Address only' } }), /coordinates/);
});
test('allocation warnings are retained even if a shelter has a reservation', () => {
  const raw: MasterPlan = { family_id: 'family-1', disaster_id: 'disaster-1', status: 'recommended', reason: 'Assigned with an accessibility mismatch.', instructions: ['Contact the coordination team.'], alerts: [{ code: 'shelter_needs_mismatch', severity: 'critical', message: 'Assigned shelter does not meet all needs.' }], capacity_reserved: true, version: 2, updated_at: new Date().toISOString(), shelter: { id: 'shelter-1', name: 'Community shelter', address: '100 Test St', location: { latitude: 27.95, longitude: -82.46 }, status: 'full', capabilities: { pets_allowed: false, child_friendly: true, wheelchair_accessible: false, medical_staff: [], special_care_notes: null }, resources: { food: 'available' } } };
  const mapped = mapPlan(raw, 'hurricane'); assert.equal(mapped.warnings?.[0]?.severity, 'critical'); assert.equal(mapped.officialInstructions[0]?.text, raw.instructions[0]); assert.deepEqual(mapped.shelterAssignment?.coordinates, raw.shelter?.location);
  assert.equal(mapPlan({ ...raw, status: 'no_match', shelter: null, capacity_reserved: false }, 'hurricane').shelterAssignment, null);
});
