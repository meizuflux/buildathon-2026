import { z } from 'zod';
import type { ApiAdapter } from '../api/types';
import type { CacheStore } from '../../storage/cache';
import type { HouseholdInput, Household, ResponsePlan, SituationReport, SupportMessage, Source } from '../../types/models';
import { userSchema, familySchema, disasterSchema, masterPlanSchema, masterUpdateSchema, masterReportSchema, type MasterFamily, type MasterPlan } from '../api/masterSchemas';
import { ApiError, type makeHttpClient } from '../api/http';
import { coordinate } from '../../utils/shelter';
const source: Source = { name: 'Haven coordination service', kind: 'organization', verified: true };
export function familyPayload(input: HouseholdInput) {
  const location = coordinate(input.location);
  if (!location) throw new ApiError('Add map coordinates for your address or use current location before saving.');
  if (!input.disasterId) throw new ApiError('Select the disaster you are registering for.');
  return {
    disaster_id: input.disasterId, adults: input.adults, children: input.children, location,
    needs: { pets: input.pets > 0, immediate_medication: input.needs.includes('Medication needed immediately'), medical_notes: input.needs.filter(need => /medication|medical/i.test(need)).join('; ') || null, accessibility_notes: input.needs.filter(need => /mobility|transportation/i.test(need)).join('; ') || null, other_special_care: input.otherNeeds.trim() || null },
    resources: { has_car: input.hasCar },
  };
}
export function mapPlan(plan: MasterPlan, disasterType: string): ResponsePlan {
  const shelter = plan.shelter;
  return {
    id: 'plan-' + plan.family_id, householdId: plan.family_id, disasterId: plan.disaster_id, disasterType, version: plan.version, status: plan.status === 'recommended' ? 'active' : 'pending', createdAt: plan.updated_at, updatedAt: plan.updated_at,
    summary: plan.reason, changes: [], warnings: plan.alerts.map(alert => ({ severity: alert.severity, message: alert.message })), officialInstructions: plan.instructions.map(text => ({ text, source })), actionSteps: [],
    shelterAssignment: shelter ? { name: shelter.name, address: shelter.address, coordinates: shelter.location, description: plan.reason, organization: source.name, status: shelter.status === 'closed' ? 'unavailable' : plan.capacity_reserved ? 'confirmed' : 'pending', source } : null,
    transportationAssignment: null, additionalResources: [], unmetNeeds: plan.alerts.map(alert => alert.message), sources: [source],
  };
}
export function createMasterAdapter(http: ReturnType<typeof makeHttpClient>, store: CacheStore, origin: string): ApiAdapter {
  async function user() { return http('/api/me', userSchema); }
  async function family() { const me = await user(); return me.family_id ? http('/api/families/' + encodeURIComponent(me.family_id), familySchema) : null; }
  async function requiredFamily() { const result = await family(); if (!result) throw new ApiError('Add your household first.'); return result; }
  function metadataKey(id: string) { return 'master-profile:' + origin + ':' + id; }
  async function mapFamily(raw: MasterFamily): Promise<Household> {
    const local = await store.get<HouseholdInput>(metadataKey(raw.id));
    const inferredNeeds = [...new Set([raw.needs.immediate_medication ? 'Medication needed immediately' : '', ...(raw.needs.medical_notes?.split('; ') ?? []), ...(raw.needs.accessibility_notes?.split('; ') ?? [])].filter(Boolean))];
    const sameCoordinates = local?.location.latitude === raw.location.latitude && local.location.longitude === raw.location.longitude;
    const petDetails = raw.needs.pets ? local?.petDetails : [];
    return { name: 'My household', adults: raw.adults, children: raw.children, pets: raw.needs.pets ? local?.pets || 1 : 0, petTypes: raw.needs.pets ? local?.petTypes || 'Pets in household' : '', ...(petDetails ? { petDetails } : {}),
      needs: inferredNeeds, otherNeeds: raw.needs.other_special_care ?? '', hasCar: raw.resources.has_car, canDrive: false, seats: 0, needsTransport: local?.needsTransport ?? false, needsShelter: false, needsFood: false,
      location: { label: sameCoordinates && local ? local.location.label : `${raw.location.latitude.toFixed(5)}, ${raw.location.longitude.toFixed(5)}`, ...raw.location }, locationMode: local?.locationMode ?? 'home', ...(local?.homeLocation ? { homeLocation: local.homeLocation } : {}), id: raw.id, disasterId: raw.disaster_id, updatedAt: raw.updated_at };
  }
  const getDisasters: ApiAdapter['getDisasters'] = async () => (await http('/api/disasters', z.object({ disasters: z.array(disasterSchema) }))).disasters.map(d => ({ id: d.id, name: d.name, type: d.type, status: d.status, affectedArea: d.affected_area, updatedAt: d.updated_at }));
  async function disasterId() { const profile = await family(); return profile?.disaster_id ?? (await getDisasters())[0]?.id; }
  async function save(input: HouseholdInput, update: boolean) {
    const current = update ? await requiredFamily() : null;
    const payload = familyPayload(input);
    const saved = await http(current ? '/api/families/' + encodeURIComponent(current.id) : '/api/families', familySchema, { method: current ? 'PATCH' : 'POST', body: payload });
    try { await store.set(metadataKey(saved.id), input); } catch { throw new ApiError('The household was saved to the server, but address and pet details could not be cached. Refresh before retrying.'); }
    return mapFamily(saved);
  }
  const reportKey = (id: string) => 'master-reports:' + origin + ':' + id;
  const messageKey = (id: string) => 'master-messages:' + origin + ':' + id;
  async function append<T extends { id: string }>(key: string, value: T) { const existing = await store.get<T[]>(key) ?? []; await store.set(key, [...existing.filter(item => item.id !== value.id), value]); }
  async function sendReport(body: string, key: string, type: string) {
    const profile = await requiredFamily();
    const received = await http('/api/families/' + encodeURIComponent(profile.id) + '/reports', masterReportSchema, { method: 'POST', body: { type, message: body, location: profile.location, client_request_id: key } });
    if (received.client_request_id !== key || received.family_id !== profile.id || received.message !== body || received.status !== 'received') throw new ApiError('The service did not confirm receipt. Retry with the same message.');
    return received;
  }
  return {
    getDisasters,
    getHousehold: async () => { const profile = await family(); return profile ? mapFamily(profile) : null; },
    createHousehold: input => save(input, false), updateHousehold: input => save(input, true),
    getCurrentPlan: async () => { const profile = await family(); if (!profile) return null; const raw = await http('/api/families/' + encodeURIComponent(profile.id) + '/plan', masterPlanSchema); const disasters = await getDisasters(); return mapPlan(raw, disasters.find(d => d.id === raw.disaster_id)?.type ?? 'Disaster'); },
    getPlanHistory: async () => [],
    getDisasterAlerts: async () => { const profile = await family(); const disasters = await getDisasters(); return disasters.filter(d => !profile || d.id === profile.disaster_id).map(d => ({ id: d.id, disasterType: d.type, title: d.name, message: 'Active disaster recorded by the coordination service. Check official updates and your shelter assignment.', area: d.affectedArea, severity: 'info' as const, source, updatedAt: d.updatedAt })); },
    getUpdates: async () => { const id = await disasterId(); if (!id) return []; const result = await http('/api/disasters/' + encodeURIComponent(id) + '/updates', z.object({ updates: z.array(masterUpdateSchema) })); return result.updates.map(u => ({ id: u.id, category: u.severity === 'info' ? 'government' as const : 'warning' as const, title: u.title, message: u.message, source, timestamp: u.published_at })); },
    getAssistanceRequests: async () => [], createAssistanceRequest: async () => { throw new ApiError('Use Support to send a message.'); }, getAssistanceRequestDetails: async () => { throw new ApiError('Use Support to send a message.'); },
    submitSituationReport: async input => { const raw = await sendReport(input.description ? input.kind + '\n' + input.description : input.kind, input.idempotencyKey, input.kind === 'I need assistance' ? 'need_help' : 'status_update'); const result: SituationReport = { ...input, id: raw.id, createdAt: raw.created_at, acknowledgment: null }; try { await append(reportKey(raw.family_id), result); } catch {} return result; },
    getSituationReports: async () => { const profile = await family(); return profile ? await store.get<SituationReport[]>(reportKey(profile.id)) ?? [] : []; },
    sendMessage: async input => { const raw = await sendReport(input.body.trim(), input.idempotencyKey, 'need_help'); const message: SupportMessage = { id: raw.id, body: raw.message, sender: 'household', createdAt: raw.created_at, idempotencyKey: raw.client_request_id }; try { await append(messageKey(raw.family_id), message); } catch {} return message; },
    getMessages: async () => { const profile = await family(); return profile ? await store.get<SupportMessage[]>(messageKey(profile.id)) ?? [] : []; },
    watchForChanges: async (_cursor, signal) => { await new Promise<void>((resolve, reject) => { if (signal.aborted) { reject(new ApiError('Request cancelled.')); return; } const end = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); resolve(); }; const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new ApiError('Request cancelled.')); }; const timer = setTimeout(end, 10000); signal.addEventListener('abort', abort, { once: true }); }); return { cursor: String(Date.now()), events: ['household', 'plan', 'alerts', 'updates'].map(entity => ({ id: entity + '-' + Date.now(), entity: entity as 'household' | 'plan' | 'alerts' | 'updates' })) }; },
  };
}
