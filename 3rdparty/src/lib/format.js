const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function timeAgo(iso) {
  if (!iso) return '—'
  const secs = (new Date(iso).getTime() - Date.now()) / 1000
  const abs = Math.abs(secs)
  if (abs < 45) return 'just now'
  if (abs < 3600) return rtf.format(Math.round(secs / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(secs / 3600), 'hour')
  return rtf.format(Math.round(secs / 86400), 'day')
}
export const fullTime = (iso) => (iso ? new Date(iso).toLocaleString() : '')
export const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—')
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')

export function km(a, b) {
  if (!a || !b) return null
  const R = 6371
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export const available = (row) => Math.max(0, row.quantity - row.reserved)
export const isLate = (s) => s.status === 'in_transit' && s.eta && new Date(s.eta) < new Date()

// Progress of one of *my* needs, from the shipments I can see (those to me).
export function needProgress(need, shipments) {
  const active = shipments.filter((s) => ['requested', 'approved', 'in_transit'].includes(s.status) && s.need_ids?.includes(need.id))
  const onTheWay = active.reduce((n, s) => n + s.items.filter((i) => i.resource_type_id === need.resource_type_id).reduce((a, i) => a + i.quantity, 0), 0)
  const remaining = Math.max(0, need.quantity_needed - need.quantity_fulfilled)
  return { remaining, onTheWay: Math.min(onTheWay, remaining), uncovered: Math.max(0, remaining - onTheWay), shipments: active }
}
