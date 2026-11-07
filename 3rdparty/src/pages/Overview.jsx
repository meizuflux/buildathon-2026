import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Bell, ClipboardList, HeartHandshake, MessagesSquare, Minus, Plus, Truck } from 'lucide-react'
import { useData } from '../data.jsx'
import { Empty, PageHead, Segmented } from '../components/ui.jsx'
import ShipmentCard from '../components/ShipmentCard.jsx'
import { ORG_STATUSES, RESOURCE_KEYS, SHELTER_STATUSES } from '../lib/constants.js'
import { available, cap, needProgress, timeAgo } from '../lib/format.js'

export default function Overview() {
  const d = useData()
  if (!d.loaded || !d.me) return <div className="page"><Empty>Loading your site…</Empty></div>

  const actionShipments = [...d.inbound.filter((s) => s.status === 'in_transit'), ...d.outbound.filter((s) => s.status === 'approved')]
  const pendingOffers = d.outbound.filter((s) => s.status === 'requested')
  const openRequests = d.myNeeds.filter((n) => n.status === 'open')
  const unread = d.conversations.filter((c) => c.unread_count > 0)
  const citizenJobs = d.myCitizens.filter((a) => ['claimed', 'en_route'].includes(a.status))
  const citizenCritical = d.nearbyCitizens.filter((a) => a.priority === 'critical').length
  const latest = [...d.updates].sort((a, b) => (b.published_at || '').localeCompare(a.published_at || '')).slice(0, 3)
  const setStatus = (status) => d.mutate((api) => (d.isOrg ? api.updateOrganization(d.me.id, { status }) : api.updateShelter(d.me.id, { status }))).catch((e) => alert(e.message))

  return (
    <div className="page">
      <PageHead title={`Hello, ${d.me.name}`} subtitle={`${d.disaster?.name || ''} · Everything you update here is shared live with the operations center.`} />

      <div className="ov-grid">
        <section className="card-panel">
          <h2>Your status</h2>
          <p className="hint">Tell operations whether you can take on work right now.</p>
          <Segmented value={d.me.status} onChange={setStatus} label="Status"
            options={(d.isOrg ? ORG_STATUSES : SHELTER_STATUSES).map((s) => [s, cap(s), `st-on-${s}`])} />
          {d.isOrg ? <StockSummary /> : <CapacityQuick />}
        </section>

        <section className="card-panel">
          <h2>Needs your action</h2>
          {actionShipments.length === 0 && unread.length === 0 && citizenJobs.length === 0 && <Empty>You're all caught up.</Empty>}
          <div className="stack">
            {citizenJobs.map((a) => (
              <Link key={a.id} to="/citizens" className="todo todo-citizen">
                <HeartHandshake size={16} /> <span className="grow"><strong>{a.contact.name}</strong> · {a.kind.replace('_', ' ')} · {a.status === 'en_route' ? 'you are on the way' : 'accepted, not yet on the way'}</span><ArrowRight size={14} />
              </Link>
            ))}
            {d.citizenApproved && d.nearbyCitizens.length > 0 && (
              <Link to="/citizens" className="todo">
                <HeartHandshake size={16} /> <span className="grow"><strong>{d.nearbyCitizens.length} households nearby</strong> need help{citizenCritical ? ` (${citizenCritical} critical)` : ''}</span><ArrowRight size={14} />
              </Link>
            )}
            {actionShipments.map((s) => <ShipmentCard key={s.id} s={s} />)}
            {unread.map((c) => (
              <Link key={c.id} to={`/messages/${c.id}`} className="todo">
                <MessagesSquare size={16} /> <span className="grow"><strong>{c.unread_count} new message{c.unread_count > 1 ? 's' : ''}</strong> from operations · {c.subject}</span><ArrowRight size={14} />
              </Link>
            ))}
          </div>
        </section>
      </div>

      <div className="ov-grid">
        <section className="card-panel">
          <div className="panel-title"><h2><ClipboardList size={16} /> Your requests</h2><Link to="/requests" className="link-sm">Manage <ArrowRight size={13} /></Link></div>
          {openRequests.length === 0 ? <Empty>No open requests. <Link to="/requests">Request supplies</Link></Empty> : (
            <ul className="plain-list">
              {openRequests.map((n) => {
                const p = needProgress(n, d.inbound)
                const r = d.rt(n.resource_type_id)
                return (
                  <li key={n.id} className="row-between">
                    <span><span className={`badge pri-${n.priority}`}>{cap(n.priority)}</span> <strong>{n.quantity_needed} {r.unit}</strong> · {r.name}</span>
                    <span className="muted small">{p.onTheWay ? `${p.onTheWay} on the way` : n.quantity_fulfilled ? `${n.quantity_fulfilled} received` : 'waiting'}</span>
                  </li>
                )
              })}
            </ul>
          )}
          {pendingOffers.length > 0 && <p className="hint"><Truck size={13} /> {pendingOffers.length} of your offers {pendingOffers.length === 1 ? 'is' : 'are'} waiting for operations to approve.</p>}
        </section>

        <section className="card-panel">
          <div className="panel-title"><h2><Bell size={16} /> Official updates</h2><Link to="/updates" className="link-sm">All <ArrowRight size={13} /></Link></div>
          {latest.length === 0 ? <Empty>No updates yet.</Empty> : (
            <ul className="plain-list">
              {latest.map((u) => (
                <li key={u.id} className={`upd sev-border-${u.severity}`}>
                  <div><span className={`badge sev-${u.severity}`}>{cap(u.severity)}</span> <strong>{u.title}</strong></div>
                  <div className="muted small">{timeAgo(u.published_at)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function StockSummary() {
  const d = useData()
  const rows = d.inventory
  const free = rows.reduce((n, r) => n + available(r), 0)
  const reserved = rows.reduce((n, r) => n + r.reserved, 0)
  const low = rows.filter((r) => available(r) === 0).length
  return (
    <div className="mini-stats">
      <div><strong>{rows.length}</strong><span>items stocked</span></div>
      <div><strong>{free.toLocaleString()}</strong><span>units free</span></div>
      <div><strong>{reserved.toLocaleString()}</strong><span>reserved for shipments</span></div>
      {low > 0 && <div className="tone-alert"><strong>{low}</strong><span>out of stock</span></div>}
      <Link to="/inventory" className="btn btn-sm mini-stats-cta">Update stock</Link>
    </div>
  )
}

// Quick ±capacity for shelters — the single most frequent update.
function CapacityQuick() {
  const d = useData()
  const { total_people: total, available_people: serverAvail } = d.me.capacity
  const [avail, setAvail] = useState(null)
  const [busy, setBusy] = useState(false)
  const value = avail ?? serverAvail
  const dirty = avail !== null && avail !== serverAvail
  const bump = (n) => setAvail(Math.max(0, Math.min(total, value + n)))
  async function save() {
    setBusy(true)
    await d.mutate((api) => api.updateShelter(d.me.id, { capacity: { available_people: value }, ...(value === 0 && d.me.status === 'open' ? { status: 'full' } : {}) }))
      .then(() => setAvail(null)).catch((e) => alert(e.message))
    setBusy(false)
  }
  return (
    <div className="capq">
      <div className="capq-label">Spaces free right now</div>
      <div className="capq-row">
        <button className="capq-btn" onClick={() => bump(-5)} aria-label="Minus five">−5</button>
        <button className="capq-btn" onClick={() => bump(-1)} aria-label="Minus one"><Minus size={18} /></button>
        <div className="capq-value"><strong>{value}</strong><span>of {total}</span></div>
        <button className="capq-btn" onClick={() => bump(1)} aria-label="Plus one"><Plus size={18} /></button>
        <button className="capq-btn" onClick={() => bump(5)} aria-label="Plus five">+5</button>
      </div>
      <div className="meter"><span style={{ width: `${total ? ((total - value) / total) * 100 : 0}%` }} /></div>
      <div className="chips">
        {RESOURCE_KEYS.map((k) => <span key={k} className={`chip res-${d.me.resources[k] || 'unknown'}`}>{cap(k)}</span>)}
        <Link to="/status" className="link-sm">Update supplies</Link>
      </div>
      {dirty && <button className="btn btn-primary btn-block" disabled={busy} onClick={save}>{busy ? 'Saving…' : `Save: ${value} spaces free`}</button>}
    </div>
  )
}
