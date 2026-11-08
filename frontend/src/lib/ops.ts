import type { LiveApi } from '../api'
import type { AlertPage, Family, Report, Severity, Shelter } from '../api/types'
import { shelterLevel, type ShelterLevel } from './format'

export { shelterLevel }

export const LEVEL_TEXT: Record<ShelterLevel, string> = { ok: 'Open', low: 'Nearly full', full: 'Full', closed: 'Closed' }

export const REPORT_TONE: Record<Report['type'], string> = {
  need_help: 't-red',
  resource_request: 't-amber',
  status_update: 't-green',
  other: 't-violet',
}

export const SEV_TONE: Record<string, string> = { critical: 't-red', warning: 't-amber', info: 't-blue' }

export function shelterTotals(shelters: Shelter[]) {
  const active = shelters.filter((s) => s.status !== 'closed')
  const total = active.reduce((n, s) => n + (s.capacity.total_people || 0), 0)
  const free = active.reduce((n, s) => n + Math.max(0, s.capacity.available_people || 0), 0)
  return { active, total, free, sheltered: total - free, occupancy: total ? (total - free) / total : 0 }
}

export function occupancy(s: Pick<Shelter, 'capacity'>): number {
  const { total_people: total = 0, available_people: avail = 0 } = s.capacity
  return total ? Math.min(1, Math.max(0, (total - Math.max(0, avail)) / total)) : 0
}

export function capabilityTags(s: Shelter): string[] {
  const c = s.capabilities
  return [c.pets_allowed && 'Pets', c.child_friendly && 'Children', c.wheelchair_accessible && 'Wheelchair'].filter(
    (t): t is string => Boolean(t),
  )
}

export type QueueKind = Severity | 'help'

export type QueueItem = {
  key: string
  kind: QueueKind
  label: string
  title: string
  when: string | null
  shelterId?: string | null
  familyId?: string | null
  reportId?: string | null
}

// One "needs action" list: critical alerts, open help requests, then warnings.
export function needsAction(alerts: AlertPage | null, reports: Report[]): QueueItem[] {
  const list = alerts?.alerts ?? []
  const fromAlert = (a: AlertPage['alerts'][number]): QueueItem => ({
    key: `a-${a.id}`,
    kind: a.severity,
    label: a.severity === 'critical' ? 'Critical' : a.severity === 'warning' ? 'Warning' : 'Info',
    title: a.message,
    when: a.updated_at,
    shelterId: a.shelter_id,
    familyId: a.family_id,
  })
  const help = reports
    .filter((r) => r.status === 'received' && (r.type === 'need_help' || r.type === 'resource_request'))
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .map<QueueItem>((r) => ({
      key: `r-${r.id}`,
      kind: 'help',
      label: r.type === 'need_help' ? 'Needs help' : 'Resource request',
      title: r.message,
      when: r.created_at,
      reportId: r.location ? r.id : null,
      familyId: r.family_id,
    }))
  return [
    ...list.filter((a) => a.severity === 'critical').map(fromAlert),
    ...help,
    ...list.filter((a) => a.severity !== 'critical').map(fromAlert),
  ]
}

// Load every family in the disaster, 1000 at a time.
export async function loadAllFamilies(client: LiveApi, disasterId: string): Promise<Family[]> {
  const all: Family[] = []
  let offset = 0
  for (;;) {
    const page = await client.listFamilies(disasterId, 1000, offset)
    all.push(...page.families)
    offset += page.families.length
    if (!page.families.length || offset >= page.total) return all
  }
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Unknown error')
