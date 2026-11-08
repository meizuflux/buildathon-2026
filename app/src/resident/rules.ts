// Plain-language checks of a household's needs against a shelter. No scores: hard blockers exclude a
// site, and anything that could not be confirmed is listed. The backend plan chooses the destination;
// these rules explain it and the other shelters.
import type { Household, Recommendation, Requirement, RequirementCheck, Shelter, ShelterAssessment } from './types';

/** Shelter data older than this (minutes) is shown as possibly out of date. */
export const STALE_AFTER_MINUTES = 60;

const LABELS: Record<Requirement, { needed: string; met: string; unmet: string; unknown: string }> = {
  wheelchairEntrance: {
    needed: 'Wheelchair-accessible entrance required',
    met: 'Wheelchair-accessible entrance confirmed',
    unmet: 'Entrance is not wheelchair accessible',
    unknown: 'Wheelchair access not confirmed',
  },
  pets: {
    needed: 'Space for pets',
    met: 'Pets accepted',
    unmet: 'Pets not accepted',
    unknown: 'Pet policy not confirmed',
  },
  children: {
    needed: 'Families with children',
    met: 'Families with children accepted',
    unmet: 'Not set up for children',
    unknown: 'Child facilities not confirmed',
  },
  poweredEquipment: {
    needed: 'Power for essential equipment',
    met: 'Backup power for essential equipment confirmed',
    unmet: 'No backup power for essential equipment',
    unknown: 'Backup power not confirmed',
  },
};

/** Requirements this household has, with "possibly" for answers of "Not sure". */
export function householdNeeds(h: Household): { requirement: Requirement; need: 'required' | 'possibly' }[] {
  const out: { requirement: Requirement; need: 'required' | 'possibly' }[] = [];
  if (h.wheelchairEntrance === 'yes') out.push({ requirement: 'wheelchairEntrance', need: 'required' });
  if (h.wheelchairEntrance === 'unknown') out.push({ requirement: 'wheelchairEntrance', need: 'possibly' });
  if (h.pets) out.push({ requirement: 'pets', need: 'required' });
  if (h.children > 0) out.push({ requirement: 'children', need: 'required' });
  if (h.poweredEquipment === 'yes') out.push({ requirement: 'poweredEquipment', need: 'required' });
  if (h.poweredEquipment === 'unknown') out.push({ requirement: 'poweredEquipment', need: 'possibly' });
  return out;
}

export function householdSize(h: Household) {
  return h.adults + h.children;
}

/** Household-side answers of "Not sure" that affect which shelters fit. */
export function householdUnknowns(h: Household): string[] {
  const out: string[] = [];
  if (h.wheelchairEntrance === 'unknown') out.push('Whether anyone needs a wheelchair-accessible entrance');
  if (h.poweredEquipment === 'unknown') out.push('Whether anyone needs power for essential equipment');
  return out;
}

export function assess(h: Household, shelter: Shelter): ShelterAssessment {
  const checks: RequirementCheck[] = householdNeeds(h).map(({ requirement, need }) => {
    const capability = shelter.capabilities[requirement];
    const words = LABELS[requirement];
    const label = capability.state === 'confirmed' ? words.met : capability.state === 'not_available' ? words.unmet : words.unknown;
    return { requirement, need, state: capability.state, label, detail: capability.detail };
  });

  const blockers: string[] = [];
  const unresolved: string[] = [];
  for (const check of checks) {
    if (check.state === 'not_available' && check.need === 'required') blockers.push(check.label);
    if (check.state === 'unknown') unresolved.push(check.label);
  }
  if (shelter.status !== 'open') blockers.push('Shelter is closed');

  let spacesOk: boolean | null = null;
  if (shelter.spaces === null) unresolved.push('Available space not reported');
  else {
    spacesOk = shelter.spaces >= householdSize(h);
    if (!spacesOk) blockers.push(shelter.spaces === 0 ? 'Reported full' : `Only ${shelter.spaces} spaces reported`);
  }

  const eligible = blockers.length === 0;
  return { shelter, checks, spacesOk, blockers, unresolved, eligible, verified: eligible && unresolved.length === 0 };
}

/** Why a shelter was not the destination, in one sentence. */
export function whyNot(alt: ShelterAssessment): string {
  if (alt.blockers.length) return alt.blockers.join('. ') + '.';
  const softUnmet = alt.checks.filter((c) => c.need === 'possibly' && c.state === 'not_available');
  if (softUnmet.length) return `${softUnmet.map((c) => c.label).join('. ')}. This may matter for your household.`;
  if (alt.unresolved.length) return `Could not confirm: ${alt.unresolved.join(', ').toLowerCase()}.`;
  return 'Not chosen by the coordinators’ allocation plan.';
}

/** Plain-language differences between two recommendations, for the "What changed" notice. */
export function describeChange(before: Recommendation | null, after: Recommendation): string[] {
  if (!before) return [];
  const lines: string[] = [];
  const b = before.destination;
  const a = after.destination;
  if (b?.shelter.id !== a?.shelter.id) {
    if (a && b) {
      lines.push(after.status === 'recommended'
        ? `Recommended destination changed from ${b.shelter.name} to ${a.shelter.name}.`
        : `${b.shelter.name} can no longer be recommended. ${a.shelter.name} is a possible option but is not verified.`);
    } else if (a) lines.push(`${a.shelter.name} is now the best available option.`);
    else if (b) lines.push(`${b.shelter.name} can no longer be recommended.`);
  } else if (a && b && a.shelter.spaces !== b.shelter.spaces) {
    lines.push(`${a.shelter.name} now reports ${a.shelter.spaces === 0 ? 'no' : a.shelter.spaces ?? 'no'} spaces available (was ${b.shelter.spaces ?? 'not reported'}).`);
  }
  if (before.status !== after.status) {
    if (after.status === 'unverified') lines.push('No destination can be fully confirmed for your household right now.');
    if (after.status === 'none') lines.push('No suitable destination is currently available.');
    if (after.status === 'recommended' && before.status !== 'recommended') lines.push('A destination that meets your listed requirements is available.');
  }
  for (const u of after.householdUnknowns.filter((x) => !before.householdUnknowns.includes(x))) lines.push(`Not yet known: ${u.toLowerCase()}.`);
  if (after.advisory && after.advisory !== before.advisory) lines.push(after.advisory);
  return lines;
}
