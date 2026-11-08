// Preparation steps chosen by household profile. Practical preparation only: no medical treatment advice.
import type { Household } from './types';
import type { ApiHurricane } from './api';

/** Remember the last phase on disk so a reset also clears ticks after reopening the app. */
export function checklistAfterSync(checked: string[], previous: ApiHurricane | undefined, current: ApiHurricane): string[] {
  if (current.phase === 'peace' && previous?.phase !== 'peace') return [];
  // A new active cycle means a reset happened while this device was away.
  if (current.phase === 'active' && previous?.phase === 'active' && previous.started_at !== current.started_at) return [];
  return checked;
}

export interface Step {
  id: string;
  title: string;
  detail?: string;
}

export function preparationSteps(h: Household): Step[] {
  const steps: Step[] = [
    { id: 'medication', title: 'Medication and care instructions', detail: 'Enough for several days, plus any instructions you already have from a provider.' },
  ];
  if (h.wheelchairEntrance === 'yes' || h.wheelchairEntrance === 'unknown') {
    steps.push({ id: 'mobility', title: 'Mobility equipment and chargers', detail: 'Check the wheelchair and everyone fit in the vehicle.' });
  }
  if (h.poweredEquipment === 'yes' || h.poweredEquipment === 'unknown') {
    steps.push({ id: 'power', title: 'Chargers and spare batteries for powered equipment' });
  }
  if (h.pets) steps.push({ id: 'pets', title: 'Pet carrier, food, leash, vaccination records' });
  if (h.children > 0) steps.push({ id: 'children', title: 'Snacks and comfort items for the kids' });
  steps.push(h.vehicle === 'yes'
    ? { id: 'transport', title: 'Fuel or charge the car' }
    : { id: 'transport', title: 'Arrange transport', detail: 'Message the coordination desk if you need help getting there.' });
  steps.push({ id: 'documents', title: 'ID, documents, phone chargers' });
  return steps;
}
