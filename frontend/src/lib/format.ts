import type { Shelter } from '../api/types'

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—'
  const secs = (new Date(iso).getTime() - Date.now()) / 1000
  const abs = Math.abs(secs)
  if (abs < 45) return 'just now'
  if (abs < 3600) return rtf.format(Math.round(secs / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(secs / 3600), 'hour')
  return rtf.format(Math.round(secs / 86400), 'day')
}

export function fullTime(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString() : ''
}

export type ShelterLevel = 'ok' | 'low' | 'full' | 'closed'

// One "level" per shelter drives its colour on the map and in lists.
export function shelterLevel(s: Pick<Shelter, 'status' | 'capacity'>): ShelterLevel {
  if (s.status === 'closed') return 'closed'
  const { total_people: total = 0, available_people: avail = 0 } = s.capacity
  if (s.status === 'full' || avail <= 0) return 'full'
  if (total > 0 && avail / total < 0.2) return 'low'
  return 'ok'
}

export const LEVEL_LABEL: Record<ShelterLevel, string> = {
  ok: 'Space available',
  low: 'Nearly full',
  full: 'Full',
  closed: 'Closed',
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
