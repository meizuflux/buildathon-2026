import type { ApiAdapter } from '../api/types';
import type { CacheStore } from '../../storage/cache';
import type { Household, ResponsePlan, AssistanceRequest, SituationReport, Update, DisasterAlert, Changes } from '../../types/models';
import { households, makePlan, initialAlerts, initialUpdates, demoSource, reliefSource, now } from '../../mocks/fixtures';
import { requestId } from '../../utils/id';
export const scenarios = { warning: 'New disaster warning', transport: 'Transportation accepted', shelter: 'Shelter unavailable', plan: 'New plan version', request: 'Request status changed', report: 'Situation report received' } as const;
type MockState = { household: Household | null; plan: ResponsePlan | null; history: ResponsePlan[]; requests: AssistanceRequest[]; reports: SituationReport[]; alerts: DisasterAlert[]; updates: Update[]; sequence: number; events: (Changes['events'][number] & { sequence: number })[] };
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export class MockAdapter implements ApiAdapter {
  private state: MockState = { household: null, plan: null, history: [], requests: [], reports: [], alerts: initialAlerts(), updates: initialUpdates(), sequence: 0, events: [] };
  private ready: Promise<void>;
  private listeners = new Set<() => void>();
  constructor(private store?: CacheStore, private latency = 180) { this.ready = this.restore(); }
  private async restore() { try { const saved = await this.store?.get<MockState>('mock-state'); if (saved) {
    this.state = saved;
    // Add map metadata to the original demo fixtures without replacing saved reports or assignments.
    const sample = households().find(h => h.id === saved.household?.id && h.location.label === saved.household.location.label);
    if (sample && saved.household && saved.household.location.latitude === undefined) saved.household.location = { ...sample.location };
    const sampleShelter = makePlan(households()[0]!).shelterAssignment!;
    for (const plan of [saved.plan, ...saved.history]) {
      const shelter = plan?.shelterAssignment;
      if (shelter && !shelter.coordinates && shelter.name === sampleShelter.name && shelter.address === sampleShelter.address) shelter.coordinates = sampleShelter.coordinates;
    }
  } } catch { /* The sync provider displays storage failures. Demo can still run in memory. */ } }
  private async read<T>(getter: () => T): Promise<T> { await this.ready; if (this.latency) await new Promise(r => setTimeout(r, this.latency)); return clone(getter()); }
  private async emit(...entities: Changes['events'][number]['entity'][]) {
    for (const entity of entities) { this.state.sequence++; this.state.events.push({ id: `event-${this.state.sequence}`, entity, sequence: this.state.sequence }); }
    this.state.events = this.state.events.slice(-200);
    await this.store?.set('mock-state', this.state).catch(() => {});
    this.listeners.forEach(fn => fn());
  }
  getDisasters = async () => [];
  getMessages = async () => [];
  sendMessage: ApiAdapter['sendMessage'] = async () => { throw new Error('The support service is not connected. Your message has not been sent.'); };
  getHousehold = () => this.read(() => this.state.household);
  createHousehold: ApiAdapter['createHousehold'] = async input => { await this.ready; this.state.household = { ...clone(input), id: this.state.household?.id ?? `household-${Date.now()}`, updatedAt: now() }; if (!this.state.plan) this.state.plan = makePlan(this.state.household); await this.emit('household', 'plan'); return clone(this.state.household); };
  updateHousehold = this.createHousehold;
  getCurrentPlan = () => this.read(() => this.state.plan);
  getPlanHistory = () => this.read(() => [...(this.state.plan ? [this.state.plan] : []), ...this.state.history]);
  getDisasterAlerts = () => this.read(() => this.state.alerts);
  getUpdates = () => this.read(() => [...this.state.updates].sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
  getAssistanceRequests = () => this.read(() => this.state.requests);
  createAssistanceRequest: ApiAdapter['createAssistanceRequest'] = async input => {
    await this.ready;
    const duplicate = this.state.requests.find(r => r.idempotencyKey === input.idempotencyKey); if (duplicate) return clone(duplicate);
    const request: AssistanceRequest = { ...clone(input), id: `request-${requestId()}`, status: 'submitted', createdAt: now(), updatedAt: now(), organization: null, timeline: [{ status: 'submitted', timestamp: now(), message: 'Received by the demo coordination service. Awaiting review.' }] };
    this.state.requests.unshift(request); await this.emit('requests'); return clone(request);
  };
  getAssistanceRequestDetails: ApiAdapter['getAssistanceRequestDetails'] = async id => { const requests = await this.getAssistanceRequests(); const found = requests.find(r => r.id === id); if (!found) throw new Error('Request not found.'); return found; };
  submitSituationReport: ApiAdapter['submitSituationReport'] = async input => { await this.ready; const duplicate = this.state.reports.find(r => r.idempotencyKey === input.idempotencyKey); if (duplicate) return clone(duplicate); const report: SituationReport = { ...clone(input), id: `report-${requestId()}`, createdAt: now(), acknowledgment: null }; this.state.reports.unshift(report); await this.emit('reports'); return clone(report); };
  getSituationReports = () => this.read(() => this.state.reports);
  watchForChanges: ApiAdapter['watchForChanges'] = async (cursor, signal) => {
    await this.ready;
    const after = Number(cursor ?? 0);
    if (signal.aborted) throw new Error('Cancelled');
    if (this.state.sequence <= after) await new Promise<void>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); this.listeners.delete(done); signal.removeEventListener('abort', abort); };
      const done = () => { cleanup(); resolve(); };
      const abort = () => { cleanup(); reject(new Error('Cancelled')); };
      const timer = setTimeout(done, 20000); this.listeners.add(done); signal.addEventListener('abort', abort, { once: true });
    });
    return { cursor: String(this.state.sequence), events: this.state.events.filter(e => e.sequence > after).map(({ id, entity }) => ({ id, entity })) };
  };
  async selectHousehold(index: number) { await this.ready; const household = households()[index]; if (!household) return; this.state.household = household; this.state.plan = makePlan(household); this.state.history = []; this.state.requests = []; this.state.reports = []; await this.emit('household', 'plan', 'requests', 'reports'); }
  async trigger(scenario: keyof typeof scenarios) {
    await this.ready;
    if (scenario === 'report') { await this.submitSituationReport({ kind: 'I am safe', description: 'Demo control submission.', idempotencyKey: `scenario-${Date.now()}` }); return; }
    const plan = this.state.plan;
    if (scenario === 'warning') { this.state.alerts.unshift({ id: `alert-${Date.now()}`, disasterType: 'Hurricane', title: 'Hurricane warning · demo', message: 'The fictional scenario has escalated. This is not a real warning.', severity: 'warning', area: 'Demo region · New Hanover County', source: demoSource, updatedAt: now() }); }
    if (scenario === 'transport' || scenario === 'request') {
      let req = this.state.requests.find(r => scenario === 'transport' ? r.category === 'transportation' : !['fulfilled', 'cancelled'].includes(r.status));
      if (!req) req = await this.createAssistanceRequest({ category: 'transportation', people: (this.state.household?.adults ?? 1) + (this.state.household?.children ?? 0), requirements: this.state.household?.needs ?? [], description: 'Demo scenario request.', idempotencyKey: `demo-${Date.now()}` });
      const saved = this.state.requests.find(r => r.id === req.id)!; saved.status = scenario === 'transport' ? 'accepted' : saved.status === 'in_progress' ? 'fulfilled' : 'in_progress'; saved.updatedAt = now(); saved.organization = reliefSource.name; saved.timeline.push({ status: saved.status, timestamp: now(), message: 'Status updated by the simulated relief organization.' });
    }
    if (plan && ['plan', 'shelter', 'transport'].includes(scenario)) {
      this.state.history.unshift(clone(plan)); plan.version++; plan.updatedAt = now(); plan.changes = [scenario === 'shelter' ? 'The demo shelter is unavailable. A replacement has not been assigned.' : scenario === 'transport' ? 'Demo transportation has been accepted by the relief partner.' : 'The coordination team refreshed your sample household plan.'];
      if (scenario === 'shelter' && plan.shelterAssignment) { plan.shelterAssignment.status = 'unavailable'; plan.unmetNeeds = [...new Set([...plan.unmetNeeds, 'Replacement shelter'])]; }
      if (scenario === 'transport') { plan.transportationAssignment = { name: 'Accessible household pickup', description: 'Simulated partner acceptance. Pickup time remains unconfirmed.', organization: reliefSource.name, status: 'confirmed', source: reliefSource }; plan.unmetNeeds = plan.unmetNeeds.filter(n => n !== 'Transportation confirmation'); }
    }
    this.state.updates.unshift({ id: `update-${requestId()}`, category: scenario === 'warning' ? 'warning' : scenario === 'request' ? 'request' : 'plan', title: scenarios[scenario], message: scenario === 'warning' ? 'The fictional hurricane scenario has escalated to a warning. This is not an active warning.' : scenario === 'request' ? 'A sample assistance request was updated by the simulated relief organization. Review its latest status in Assistance.' : plan?.changes[0] ?? 'A demonstration event was received by the coordination service.', source: scenario === 'warning' ? demoSource : reliefSource, timestamp: now(), ...(plan && scenario !== 'warning' && scenario !== 'request' ? { planId: plan.id } : {}) });
    await this.emit('alerts', 'plan', 'requests', 'updates');
  }
}
