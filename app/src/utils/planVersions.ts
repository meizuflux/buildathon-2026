import type { ResponsePlan } from '../types/models';
// Slow or replayed server responses must not replace a newer cached revision.
export function newestPlan(cached: ResponsePlan | null | undefined, incoming: ResponsePlan | null): ResponsePlan | null {
  if (cached && incoming && cached.id === incoming.id && cached.householdId === incoming.householdId && cached.version > incoming.version) return cached;
  return incoming;
}
