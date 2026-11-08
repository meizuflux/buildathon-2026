// Deterministic recommendation rules for the demo. No scoring model: hard blockers exclude a site,
// unconfirmed items are listed, and remaining sites are ranked by unresolved count, then travel time.
import type {
  Closure, DemoHousehold, DemoShelter, Recommendation, Requirement, RequirementCheck, ShelterAssessment,
} from './types';

const LABELS: Record<Requirement, { needed: string; met: string; unmet: string; unknown: string }> = {
  wheelchairEntrance: {
    needed: 'Wheelchair-accessible entrance required',
    met: 'Wheelchair-accessible entrance confirmed',
    unmet: 'Entrance is not wheelchair accessible',
    unknown: 'Wheelchair access not confirmed',
  },
  dogs: {
    needed: 'Space for a dog',
    met: 'Dogs accepted',
    unmet: 'Dogs not accepted',
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

export const requirementLabel = (r: Requirement) => LABELS[r].needed;

/** Requirements this household has, with "possibly" for answers of "Not sure". */
export function householdNeeds(h: DemoHousehold): { requirement: Requirement; need: 'required' | 'possibly' }[] {
  const out: { requirement: Requirement; need: 'required' | 'possibly' }[] = [];
  if (h.wheelchairEntrance === 'yes') out.push({ requirement: 'wheelchairEntrance', need: 'required' });
  if (h.wheelchairEntrance === 'unknown') out.push({ requirement: 'wheelchairEntrance', need: 'possibly' });
  if (h.dogs > 0) out.push({ requirement: 'dogs', need: 'required' });
  if (h.children > 0) out.push({ requirement: 'children', need: 'required' });
  if (h.poweredEquipment === 'yes') out.push({ requirement: 'poweredEquipment', need: 'required' });
  if (h.poweredEquipment === 'unknown') out.push({ requirement: 'poweredEquipment', need: 'possibly' });
  return out;
}

export function householdSize(h: DemoHousehold) {
  return h.adults + h.children;
}

export function assess(h: DemoHousehold, shelter: DemoShelter, closures: Closure[]): ShelterAssessment {
  const closed = new Set(closures.map((c) => c.road));
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

  const route = shelter.routes.find((r) => !r.roads.some((road) => closed.has(road))) ?? null;
  if (!route) {
    const names = closures.filter((c) => shelter.routes.some((r) => r.roads.includes(c.road))).map((c) => c.label);
    blockers.push(`No route available: ${names.join(' and ')} closed`);
  }
  const rerouted = !!route && route.id !== shelter.routes[0]?.id;

  const eligible = blockers.length === 0;
  return { shelter, checks, route, rerouted, spacesOk, blockers, unresolved, eligible, verified: eligible && unresolved.length === 0 };
}

function rank(a: ShelterAssessment, b: ShelterAssessment) {
  // Confirmed matches for "possibly" needs beat unknown or unmet ones, then fewer unresolved, then time.
  const soft = (x: ShelterAssessment) => x.checks.filter((c) => c.need === 'possibly' && c.state !== 'confirmed').length;
  return (
    Number(b.verified) - Number(a.verified) ||
    soft(a) - soft(b) ||
    a.unresolved.length - b.unresolved.length ||
    (a.route?.minutes ?? Infinity) - (b.route?.minutes ?? Infinity) ||
    a.shelter.id.localeCompare(b.shelter.id)
  );
}

function whyNot(alt: ShelterAssessment, chosen: ShelterAssessment | null): string {
  if (alt.blockers.length) return alt.blockers.join('. ') + '.';
  const softUnmet = alt.checks.filter((c) => c.need === 'possibly' && c.state === 'not_available');
  if (softUnmet.length) return `${softUnmet.map((c) => c.label).join('. ')}. This may matter for your household.`;
  if (alt.unresolved.length) return `Could not confirm: ${alt.unresolved.join(', ').toLowerCase()}.`;
  if (chosen?.route && alt.route) {
    const diff = alt.route.minutes - chosen.route.minutes;
    if (diff > 0) return `Meets the same requirements but the journey is about ${diff} minutes longer.`;
  }
  return 'Meets your requirements; ranked lower on journey time.';
}

/**
 * Pick a destination. If the household has already left (`travellingTo`), keep that destination and
 * explain any change instead of silently switching.
 */
export function recommend(
  h: DemoHousehold,
  shelters: DemoShelter[],
  closures: Closure[],
  travellingTo: string | null = null,
): Recommendation {
  const assessments = shelters.map((s) => assess(h, s, closures));
  const householdUnknowns: string[] = [];
  if (h.wheelchairEntrance === 'unknown') householdUnknowns.push('Whether anyone needs a wheelchair-accessible entrance');
  if (h.poweredEquipment === 'unknown') householdUnknowns.push('Whether anyone needs power for essential equipment');

  if (travellingTo) {
    const current = assessments.find((a) => a.shelter.id === travellingTo) ?? null;
    if (current) {
      const others = assessments.filter((a) => a !== current).sort(rank);
      const advisory = current.eligible
        ? null
        : `${current.shelter.name} changed after you left: ${current.blockers.join('. ').toLowerCase()}. ` +
          'Your destination has not been changed. Message a coordinator before changing plans.';
      return {
        status: current.verified ? 'recommended' : 'unverified',
        destination: current,
        alternatives: others.map((a) => ({ assessment: a, whyNot: whyNot(a, current) })),
        householdUnknowns,
        keptBecauseTravelling: true,
        advisory,
      };
    }
  }

  const eligible = assessments.filter((a) => a.eligible).sort(rank);
  const best = eligible[0] ?? null;
  const status = !best ? 'none' : best.verified ? 'recommended' : 'unverified';
  const rest = assessments.filter((a) => a !== best).sort((a, b) => Number(b.eligible) - Number(a.eligible) || rank(a, b));
  return {
    status,
    destination: best,
    alternatives: rest.map((a) => ({ assessment: a, whyNot: whyNot(a, best) })),
    householdUnknowns,
    keptBecauseTravelling: false,
    advisory: null,
  };
}

/** Plain-language differences between two recommendations, for the "What changed" notice. */
export function describeChange(before: Recommendation | null, after: Recommendation): string[] {
  if (!before) return [];
  const lines: string[] = [];
  const b = before.destination;
  const a = after.destination;
  if (b?.shelter.id !== a?.shelter.id) {
    if (a && b) lines.push(`Recommended destination changed from ${b.shelter.name} to ${a.shelter.name}.`);
    else if (a) lines.push(`${a.shelter.name} is now the best available option.`);
    else if (b) lines.push(`${b.shelter.name} can no longer be recommended.`);
  } else if (a && b) {
    if (a.route?.id !== b.route?.id) {
      lines.push(
        a.route
          ? `Journey now goes via ${a.route.via}: about ${a.route.minutes} minutes (was ${b.route?.minutes ?? '–'}).`
          : `No route to ${a.shelter.name} is currently available.`,
      );
    }
    if (a.shelter.spaces !== b.shelter.spaces) {
      lines.push(`${a.shelter.name} now reports ${a.shelter.spaces === 0 ? 'no' : a.shelter.spaces} spaces available (was ${b.shelter.spaces ?? 'not reported'}).`);
    }
  }
  if (before.status !== after.status) {
    if (after.status === 'unverified') lines.push('No destination can be fully confirmed for your household right now.');
    if (after.status === 'none') lines.push('No suitable destination is currently available.');
    if (after.status === 'recommended' && before.status !== 'recommended') lines.push('A destination that meets your listed requirements is available.');
  }
  const newUnknowns = after.householdUnknowns.filter((u) => !before.householdUnknowns.includes(u));
  for (const u of newUnknowns) lines.push(`Not yet known: ${u.toLowerCase()}.`);
  if (after.advisory && after.advisory !== before.advisory) lines.push(after.advisory);
  return lines;
}
