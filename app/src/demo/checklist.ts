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
    {
      id: 'medication',
      title: 'Gather essential medication and existing care instructions',
      detail: 'Include enough for several days, and any instructions you already have from a provider.',
    },
  ];
  if (h.wheelchairEntrance === 'yes' || h.wheelchairEntrance === 'unknown') {
    steps.push({
      id: 'mobility',
      title: 'Pack mobility equipment and chargers',
      detail: 'Check that the wheelchair and everyone fit in the vehicle before you leave.',
    });
  }
  if (h.dogs > 0) {
    steps.push({ id: 'pets', title: 'Prepare the dog’s crate, food, leash, and vaccination records' });
  }
  if (h.children > 0) {
    steps.push({ id: 'children', title: 'Pack comfort items and snacks for the children' });
  }
  if (h.vehicle === 'yes') {
    steps.push({ id: 'transport', title: 'Confirm your vehicle has fuel or charge for the journey' });
  } else {
    steps.push({ id: 'transport', title: 'Confirm transport arrangements', detail: 'Message a coordinator if you need help getting there.' });
  }
  steps.push({ id: 'documents', title: 'Bring identification, documents, and phone chargers' });
  if (instruction) {
    steps.push({ id: 'leave', title: `Leave before ${clock(18 * 60)}`, detail: `Official instruction from ${instruction.authority}.` });
  }
  return steps;
}
