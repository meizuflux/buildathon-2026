// Pure hurricane-phase logic for the resident app: what the Plan tab shows, transition detection,
// and the "needs on file" list. Peace never exposes a shelter; active shows the backend's plan.
import type { HurricaneView } from './live';
import type { DemoHousehold, Recommendation, SystemNotice } from './types';

export type PlanMode = 'all-clear' | 'evacuation';

/** Mock mode has no hurricane status; treat missing as active so the simulated scenario is unchanged. */
export function planMode(h: HurricaneView | undefined): PlanMode {
  return h && h.phase === 'peace' ? 'all-clear' : 'evacuation';
}

export type Transition = 'none' | 'evacuation' | 'reset';

/** `prev` is null on first load: a household that opens the app mid-hurricane gets no "new order" jump. */
export function transition(prev: HurricaneView | null, next: HurricaneView): Transition {
  if (!prev) return 'none';
  if (prev.phase === 'peace' && next.phase === 'active') return 'evacuation';
  if (prev.phase === 'active' && next.phase === 'peace') return 'reset';
  return 'none';
}

/** "Hurricane Delia · Category 4" (category omitted if unknown). */
export function hurricaneTitle(h: Pick<HurricaneView, 'name' | 'category'>): string {
  const name = h.name ?? 'Hurricane';
  return h.category != null ? `${name} · Category ${h.category}` : name;
}

export function evacuationNotice(id: string, at: number, h: HurricaneView, rec: Recommendation): SystemNotice {
  const lines = [`${hurricaneTitle(h).replace(' · ', ', ')}. Mandatory evacuation order in effect.`];
  const shelter = rec.destination?.shelter;
  lines.push(shelter ? `Your assigned shelter: ${shelter.name}${shelter.address ? `, ${shelter.address}` : ''}.` : 'No shelter could be assigned yet. Message a coordinator for help.');
  return { id, at, title: 'Evacuation order issued', lines };
}

/** The needs Haven has on file, only those that apply. */
export function needsOnFile(h: DemoHousehold): string[] {
  const people = h.adults + h.children;
  const out = [`${people} ${people === 1 ? 'person' : 'people'} in your household`];
  if (h.medication) out.push('Immediate medication');
  if (h.poweredEquipment !== 'no') out.push(h.poweredEquipment === 'yes' ? 'Powered medical equipment' : 'Possible powered equipment (to confirm)');
  if (h.wheelchairEntrance !== 'no') out.push(h.wheelchairEntrance === 'yes' ? 'Wheelchair-accessible entrance' : 'Wheelchair entrance (to confirm)');
  if (h.dogs > 0) out.push('Pets');
  if (h.vehicle !== 'yes') out.push('No car');
  if (h.transportHelp === 'yes') out.push('Help with transport');
  return out;
}
