// Derived views over needs, inventory and shipments. All client-side so the
// backend only has to store records (see Part 2 contract §5 "Matching").
import { PRIORITY_RANK } from './constants.js'

export function km(a, b) {
  if (!a || !b) return null
  const R = 6371
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export const ACTIVE_SHIPMENT = ['requested', 'approved', 'in_transit']

export function needProgress(need, shipments) {
  const inbound = shipments.filter((s) => ACTIVE_SHIPMENT.includes(s.status) && s.need_ids?.includes(need.id))
  const inTransit = inbound.reduce(
    (n, s) => n + s.items.filter((i) => i.resource_type_id === need.resource_type_id).reduce((a, i) => a + i.quantity, 0),
    0,
  )
  const remaining = Math.max(0, need.quantity_needed - need.quantity_fulfilled)
  return {
    fulfilled: need.quantity_fulfilled,
    inTransit: Math.min(inTransit, remaining),
    remaining,
    uncovered: Math.max(0, remaining - inTransit),
    shipments: inbound,
  }
}

export const available = (row) => Math.max(0, row.quantity - row.reserved)

// Rank organizations that could fill a need: how much of it their spare stock
// covers, weighted with how close they are to the requester.
export function suggestSources(need, { inventory, organizations }, destination, uncovered) {
  const want = uncovered || need.quantity_needed
  return inventory
    .filter((r) => r.resource_type_id === need.resource_type_id && r.holder.kind === 'organization' && r.holder.id !== need.requester.id)
    .map((r) => {
      const org = organizations.find((o) => o.id === r.holder.id)
      if (!org || org.status === 'inactive') return null
      const avail = available(r)
      if (avail <= 0) return null
      const distance = km(org.location, destination?.location)
      const coverage = Math.min(1, avail / want)
      const proximity = distance == null ? 0.5 : 1 / (1 + distance / 8)
      const score = 0.55 * coverage + 0.35 * proximity + (org.status === 'active' ? 0.1 : 0)
      return { org, available: avail, distance, coverage, score, sendable: Math.min(avail, want) }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
}

export const byPriority = (a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) || a.created_at.localeCompare(b.created_at)

export const isLate = (s) => s.status === 'in_transit' && s.eta && new Date(s.eta) < new Date()

// Per resource type: total spare stock vs. open demand.
export function coverageByResource({ needs, inventory, shipments }) {
  const rows = {}
  const get = (id) => (rows[id] ||= { resource_type_id: id, available: 0, needed: 0, inTransit: 0, uncovered: 0, needCount: 0 })
  for (const r of inventory) get(r.resource_type_id).available += available(r)
  for (const n of needs.filter((x) => x.status === 'open')) {
    const p = needProgress(n, shipments)
    const row = get(n.resource_type_id)
    row.needed += p.remaining
    row.inTransit += p.inTransit
    row.uncovered += p.uncovered
    row.needCount += 1
  }
  return Object.values(rows)
}

// The Command Center's "needs attention" queue.
export function attentionItems({ shelters, reports, needs, shipments, conversations, rt }) {
  const out = []
  const mins = (iso) => (Date.now() - new Date(iso).getTime()) / 60_000
  for (const r of reports) {
    if (r.type === 'need_help' && r.status === 'received' && mins(r.created_at) > 15) {
      out.push({ id: r.id, level: 'critical', title: `Unanswered help request from ${r.family_id}`, detail: r.message, at: r.created_at, to: `/map?report=${r.id}`, action: 'Locate' })
    }
  }
  for (const n of needs) {
    if (n.status !== 'open' || !['critical', 'high'].includes(n.priority)) continue
    const p = needProgress(n, shipments)
    if (p.uncovered > 0) {
      out.push({
        id: n.id, level: n.priority === 'critical' ? 'critical' : 'warning',
        title: `${n.requester.name} needs ${p.uncovered} ${rt(n.resource_type_id).unit} of ${rt(n.resource_type_id).name.toLowerCase()}`,
        detail: p.inTransit ? `${p.inTransit} already on the way` : 'No shipment assigned', at: n.created_at, to: `/logistics/needs?focus=${n.id}`, action: 'Dispatch',
      })
    }
  }
  for (const s of shipments) {
    if (isLate(s)) out.push({ id: s.id, level: 'warning', title: `Shipment to ${s.to.name} is late`, detail: `Expected ${Math.round(mins(s.eta))} min ago from ${s.from.name}`, at: s.eta, to: '/logistics/dispatch', action: 'View' })
    if (s.status === 'requested') out.push({ id: s.id, level: 'info', title: `${s.from.name} offered a shipment to ${s.to.name}`, detail: 'Waiting for approval', at: s.created_at, to: '/logistics/dispatch', action: 'Review' })
  }
  for (const s of shelters) {
    if (s.status === 'closed') continue
    const { total_people: t, available_people: a } = s.capacity
    if (s.status === 'open' && t > 0 && a / t <= 0.1) {
      out.push({ id: `${s.id}-cap`, level: 'warning', title: `${s.name} is ${a <= 0 ? 'full' : 'almost full'}`, detail: `${a} of ${t} spaces left`, at: s.updated_at, to: `/map?shelter=${s.id}`, action: 'Open' })
    }
    if (mins(s.updated_at) > 120) {
      out.push({ id: `${s.id}-stale`, level: 'info', title: `No update from ${s.name} in ${Math.round(mins(s.updated_at) / 60)}h`, detail: 'Status may be out of date', at: s.updated_at, to: `/map?shelter=${s.id}`, action: 'Open' })
    }
  }
  for (const c of conversations) {
    if (c.unread_count > 0) out.push({ id: c.id, level: 'info', title: `${c.unread_count} unread from ${c.participant.name}`, detail: c.last_message_preview, at: c.last_message_at, to: `/comms/messages/${c.id}`, action: 'Reply' })
  }
  const rank = { critical: 0, warning: 1, info: 2 }
  return out.sort((a, b) => rank[a.level] - rank[b.level] || a.at.localeCompare(b.at))
}
