import test from 'node:test';
import assert from 'node:assert/strict';
import { MockAdapter, scenarios } from '../src/services/adapters/mockAdapter';
import { households } from '../src/mocks/fixtures';
import { householdSchema, householdInputSchema, planSchema, assistanceSchema, reportSchema, alertSchema, updateSchema, changeSchema } from '../src/types/models';
import { makeHttpClient, ApiError } from '../src/services/api/http';
import { affectedQueries } from '../src/utils/changes';
import { newestPlan } from '../src/utils/planVersions';
import type { CacheStore } from '../src/storage/cache';
const memory = (): CacheStore => { const values = new Map<string, string>(); return { async get<T>(key: string) { const value = values.get(key); return value ? JSON.parse(value) as T : null; }, async set(key, value) { values.set(key, JSON.stringify(value)); }, async remove(key) { values.delete(key); } }; };

test('household onboarding, editing, and persistent restore preserve the shared contract', async () => {
  const store = memory(); const api = new MockAdapter(store, 0);
  assert.equal(await api.getHousehold(), null);
  const household = await api.createHousehold(households()[0]!);
  assert(householdSchema.safeParse(household).success);
  const edited = await api.updateHousehold({ ...household, children: 3, needsShelter: true });
  assert.equal(edited.id, household.id);
  const restored = new MockAdapter(store, 0);
  assert.equal((await restored.getHousehold())?.children, 3);
  assert(planSchema.safeParse(await restored.getCurrentPlan()).success);
  assert(!householdInputSchema.safeParse({ ...household, adults: 0, children: 0 }).success);
  assert(!householdInputSchema.safeParse({ ...household, children: 1.5 }).success);
});
test('assistance submission stays submitted and retries are idempotent', async () => {
  const api = new MockAdapter(undefined, 0); await api.selectHousehold(1);
  const input = { category: 'transportation' as const, people: 3, requirements: [], description: '', idempotencyKey: 'assistance-1' };
  const submitted = await api.createAssistanceRequest(input);
  assert(assistanceSchema.safeParse(submitted).success); assert.equal(submitted.status, 'submitted'); assert.equal(submitted.organization, null);
  const retry = await api.createAssistanceRequest(input); assert.equal(retry.id, submitted.id); assert.equal((await api.getAssistanceRequests()).length, 1);
  await api.trigger('transport'); assert.equal((await api.getAssistanceRequestDetails(submitted.id)).status, 'accepted');
});
test('reports are received separately from organization acknowledgment', async () => {
  const api = new MockAdapter(undefined, 0);
  const input = { kind: 'I am safe' as const, description: 'Safe with family', idempotencyKey: 'report-1' };
  const report = await api.submitSituationReport(input); assert(reportSchema.safeParse(report).success); assert.equal(report.acknowledgment, null);
  assert.equal((await api.submitSituationReport(input)).id, report.id); assert.equal((await api.getSituationReports()).length, 1);
});
test('all demo scenarios emit valid updates; plans retain previous versions and unavailable resources', async () => {
  const api = new MockAdapter(undefined, 0); await api.selectHousehold(2);
  const first = (await api.getCurrentPlan())!;
  for (const scenario of Object.keys(scenarios) as (keyof typeof scenarios)[]) await api.trigger(scenario);
  const current = (await api.getCurrentPlan())!;
  assert(current.version > first.version); assert.equal(current.shelterAssignment?.status, 'unavailable'); assert(current.unmetNeeds.includes('Replacement shelter'));
  assert.equal((await api.getPlanHistory()).at(-1)?.version, first.version);
  assert(planSchema.safeParse(current).success);
  for (const alert of await api.getDisasterAlerts()) assert(alertSchema.safeParse(alert).success);
  for (const update of await api.getUpdates()) assert(updateSchema.safeParse(update).success);
  for (const request of await api.getAssistanceRequests()) assert(assistanceSchema.safeParse(request).success);
  for (const household of households()) assert(householdSchema.safeParse(household).success);
});
test('long polling wakes for events, advances cursors, deduplicates, and aborts cleanly', async () => {
  const api = new MockAdapter(undefined, 0); const controller = new AbortController();
  const waiting = api.watchForChanges('0', controller.signal);
  await api.selectHousehold(0);
  const batch = await waiting; assert(changeSchema.safeParse(batch).success);
  const seen = new Set<string>(); assert.deepEqual([...affectedQueries(batch, seen)].sort(), ['history', 'household', 'plan', 'reports', 'requests']);
  assert.equal(affectedQueries(batch, seen).size, 0);
  const next = api.watchForChanges(batch.cursor, controller.signal); controller.abort(); await assert.rejects(next, /Cancelled/);
});
test('offline snapshot can be read after a fresh adapter instance starts', async () => {
  const store = memory(); const api = new MockAdapter(store, 0); await api.selectHousehold(2); await api.trigger('plan');
  const plan = await api.getCurrentPlan(); await store.set('queries:mock:', [{ key: ['plan'], data: plan, at: Date.now() }]);
  const snapshot = await store.get<{ data: unknown }[]>('queries:mock:'); assert(planSchema.safeParse(snapshot?.[0]?.data).success);
  const restored = new MockAdapter(store, 0); assert.deepEqual(await restored.getCurrentPlan(), plan);
});
test('a delayed old response cannot roll back a newer cached plan', async () => {
  const api = new MockAdapter(undefined, 0); await api.selectHousehold(0);
  const previous = (await api.getCurrentPlan())!; await api.trigger('plan');
  const latest = (await api.getCurrentPlan())!;
  assert.equal(newestPlan(latest, previous)?.version, latest.version);
  assert.equal(newestPlan(previous, latest)?.version, latest.version);
  assert.equal(newestPlan(latest, null), null);
});
test('HTTP client handles authorization, malformed payloads, failures, and timeout', async () => {
  const originalFetch = globalThis.fetch; const client = makeHttpClient('https://backend.example', async () => 'test-token', 15);
  try {
    globalThis.fetch = async (_url, options) => { assert.equal((options?.headers as Record<string, string>).Authorization, 'Bearer test-token'); assert.equal((options?.headers as Record<string, string>)['Idempotency-Key'], 'stable'); return new Response(JSON.stringify(households()[0])); };
    assert(householdSchema.safeParse(await client('/household', householdSchema, { idempotencyKey: 'stable' })).success);
    globalThis.fetch = async () => new Response('{}', { status: 401 }); await assert.rejects(client('/household', householdSchema), e => e instanceof ApiError && e.status === 401);
    globalThis.fetch = async () => new Response('{"invalid":true}'); await assert.rejects(client('/household', householdSchema), /API contract/);
    globalThis.fetch = async () => new Response('not json'); await assert.rejects(client('/household', householdSchema), /invalid JSON/);
    globalThis.fetch = async () => { throw new TypeError('Network failed'); }; await assert.rejects(client('/household', householdSchema), /Unable to reach/);
    globalThis.fetch = async (_url, options) => new Promise((_, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })); await assert.rejects(client('/household', householdSchema), /timed out/);
    const aborted = new AbortController(); aborted.abort(); globalThis.fetch = async (_url, options) => { if (options?.signal?.aborted) throw new Error('aborted'); return new Response('{}'); }; await assert.rejects(client('/household', householdSchema, { signal: aborted.signal }), /cancelled/);
  } finally { globalThis.fetch = originalFetch; }
});
