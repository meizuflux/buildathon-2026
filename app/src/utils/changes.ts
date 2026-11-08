import type { Changes } from '../types/models';
export function affectedQueries(batch: Changes, seen: Set<string>) {
  const entities = new Set<string>();
  for (const event of batch.events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id); entities.add(event.entity);
    if (event.entity === 'plan') entities.add('history');
  }
  if (seen.size > 1000) { const recent = [...seen].slice(-500); seen.clear(); recent.forEach(id => seen.add(id)); }
  return entities;
}
