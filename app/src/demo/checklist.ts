// Preparation steps from reviewed templates, chosen by household profile. Practical preparation only:
// no medical treatment instructions.
import type { DemoHousehold, OfficialInstruction } from './types';
import { clock } from './time';

export interface Step {
  id: string;
  title: string;
  detail?: string;
}

export function preparationSteps(h: DemoHousehold, instruction: OfficialInstruction | null): Step[] {
  const steps: Step[] = [
    { id: 'medication', title: 'Medication and care instructions', detail: 'Enough for several days, plus any instructions you already have from a provider.' },
  ];
  if (h.wheelchairEntrance === 'yes' || h.wheelchairEntrance === 'unknown') {
    steps.push({ id: 'mobility', title: 'Mobility equipment and chargers', detail: 'Check the wheelchair and everyone fit in the vehicle.' });
  }
  if (h.dogs > 0) steps.push({ id: 'pets', title: 'Dog crate, food, leash, vaccination records' });
  if (h.children > 0) steps.push({ id: 'children', title: 'Snacks and comfort items for the kids' });
  steps.push(h.vehicle === 'yes'
    ? { id: 'transport', title: 'Fuel or charge the car' }
    : { id: 'transport', title: 'Arrange transport', detail: 'Message a coordinator if you need help getting there.' });
  steps.push({ id: 'documents', title: 'ID, documents, phone chargers' });
  const leaveBy = instruction?.leaveBy;
  if (instruction && leaveBy !== undefined) steps.push({ id: 'leave', title: `Leave by ${clock(leaveBy)}`, detail: `Official instruction from ${instruction.authority}.` });
  return steps;
}
