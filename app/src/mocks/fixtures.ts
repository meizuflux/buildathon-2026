import type { Household, ResponsePlan, AssistanceRequest, DisasterAlert, Update, Source } from '../types/models';
export const now = () => new Date().toISOString();
export const demoSource: Source = { name: 'DEMO · County Emergency Management', kind: 'government', verified: true };
export const reliefSource: Source = { name: 'DEMO · Community Relief Network', kind: 'organization', verified: true };
export function households(): Household[] {
  const base = { petTypes: '', otherNeeds: '', updatedAt: now(), location: { label: 'Wilmington, NC \u00b7 Zone A', latitude: 34.2257, longitude: -77.9447 }, needsFood: true, seats: 0, canDrive: false, hasCar: false, needsTransport: true, needsShelter: true };
  return [
    { ...base, id: 'household-a', name: 'The Morgan household', adults: 2, children: 2, pets: 1, petTypes: 'Dog', needs: [], hasCar: true, canDrive: true, seats: 4, needsTransport: false },
    { ...base, id: 'household-b', name: 'The Rivera household', adults: 1, children: 2, pets: 0, needs: [] },
    { ...base, id: 'household-c', name: 'The Chen household', adults: 2, children: 0, pets: 0, needs: ['Wheelchair accessibility', 'Electric medical equipment', 'Accessible transportation'] },
  ];
}
export function makePlan(household: Household): ResponsePlan {
  return { id: `plan-${household.id}`, householdId: household.id, disasterId: 'demo-hurricane', disasterType: 'Hurricane', version: 1, status: 'active', createdAt: now(), updatedAt: now(), summary: 'Review your household’s shelter and support arrangements.', changes: ['Your first demonstration plan is ready.'],
    officialInstructions: [{ text: 'DEMONSTRATION ONLY. This fictional scenario is not an active warning. Consult your local emergency management office for current instructions.', source: demoSource }],
    actionSteps: [
      { id: 'review', title: 'Review the official update', detail: 'Read the attributed information above and check its timestamp.', personalTask: true },
      { id: 'essentials', title: 'Review your household essentials', detail: 'Demo preparation checklist supplied with this sample plan.', personalTask: true },
      { id: 'assignment', title: 'Check your support arrangements', detail: 'Review resource status below. Pending support is not confirmed.', personalTask: false },
    ],
    shelterAssignment: { name: 'Northside Community Center', description: 'Fictional demo shelter · family spaces and accessible facilities. Availability is simulated.', address: '120 Sample Avenue, Wilmington, NC (fictional)', coordinates: { latitude: 34.2525, longitude: -77.9215 }, organization: reliefSource.name, status: 'confirmed', source: reliefSource },
    transportationAssignment: household.needsTransport ? { name: 'Accessible household pickup', description: 'A transport request is under review. No pickup time has been confirmed.', organization: reliefSource.name, status: 'pending', source: reliefSource } : null,
    additionalResources: [{ name: 'Food & water support', description: 'Demo household supply package. Collection details are awaiting confirmation.', organization: reliefSource.name, status: 'pending', source: reliefSource }],
    unmetNeeds: household.needsTransport ? ['Transportation confirmation'] : [], sources: [demoSource, reliefSource],
  };
}
export function initialAlerts(): DisasterAlert[] { return [{ id: 'alert-1', disasterType: 'Hurricane', title: 'Hurricane watch', message: 'A fictional coastal storm is being monitored in this demonstration. Follow your local authorities for real conditions.', severity: 'watch', area: 'Demo region · New Hanover County, NC', source: demoSource, updatedAt: now() }]; }
export function initialUpdates(): Update[] { return [
  { id: 'update-1', category: 'government', title: 'Your local information, in one place', message: 'This demonstration brings official information and household support into a shared view. All names, warnings, and assignments shown are fictional.', source: demoSource, timestamp: now() },
  { id: 'update-2', category: 'organization', title: 'Community support is being coordinated', message: 'Sample relief partners are reviewing household needs. An assignment is only confirmed when its status says Confirmed.', source: reliefSource, timestamp: now() },
]; }
export function initialRequests(): AssistanceRequest[] { return []; }
