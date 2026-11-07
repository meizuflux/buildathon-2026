import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Clock, Plus } from 'lucide-react'
import { useData } from '../data.jsx'
import { Empty, PageHeader, PriorityBadge } from '../components/ui.jsx'
import ShipmentDialog from '../components/ShipmentDialog.jsx'
import { SHIPMENT_FLOW, SHIPMENT_LABEL, SHIPMENT_NEXT } from '../lib/constants.js'
import { byPriority, isLate, km } from '../lib/logistics.js'
import { fullTime, timeAgo } from '../lib/format.js'

const linkFor = (ref) => (ref.kind === 'organization' ? `/organizations/${ref.id}` : `/map?shelter=${ref.id}`)

export default function Dispatch() {
  const d = useData()
  const [dialog, setDialog] = useState(false)
  const [query, setQuery] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [busy, setBusy] = useState(null)

  const match = (s) => !query || [s.from.name, s.to.name, ...s.items.map((i) => d.rt(i.resource_type_id).name)].join(' ').toLowerCase().includes(query.toLowerCase())
  const shipments = d.shipments.filter(match)
  const cancelled = shipments.filter((s) => s.status === 'cancelled')

  async function move(s, status) {
    if (status === 'cancelled' && !confirm('Cancel this shipment? Reserved stock will be released.')) return
    setBusy(s.id)
    await d.mutate((api) => api.updateShipment(s.id, { status })).catch((e) => alert(e.message))
    setBusy(null)
  }

  return (
    <div className="page">
      <PageHeader title="Dispatch" subtitle="Every shipment from approval to delivery. Delivering a linked shipment updates the need automatically.">
        <button className="btn btn-primary" onClick={() => setDialog(true)}><Plus size={15} /> New shipment</button>
      </PageHeader>

      <div className="toolbar">
        <input type="search" placeholder="Search by place or resource" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search shipments" />
        <label className="check"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show all delivered</label>
      </div>

      <div className="kanban">
        {SHIPMENT_FLOW.map((col) => {
          let items = shipments.filter((s) => s.status === col)
          items = col === 'delivered'
            ? items.sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, showDone ? undefined : 6)
            : items.sort((a, b) => (isLate(b) ? 1 : 0) - (isLate(a) ? 1 : 0) || byPriority(a, b))
          const count = shipments.filter((s) => s.status === col).length
          return (
            <section key={col} className={`kan-col kan-${col}`}>
              <header className="kan-head"><span>{SHIPMENT_LABEL[col]}</span><span className="kan-count">{count}</span></header>
              <div className="kan-body">
                {items.length === 0 && <Empty>None</Empty>}
                {items.map((s) => {
                  const late = isLate(s)
                  const next = SHIPMENT_NEXT[s.status]
                  const dist = km(d.site(s.from)?.location, d.site(s.to)?.location)
                  return (
                    <article key={s.id} className={`ship ${late ? 'late' : ''}`}>
                      <div className="row-between">
                        <PriorityBadge priority={s.priority} />
                        {late ? <span className="badge lvl-full"><Clock size={11} /> Late {timeAgo(s.eta).replace(' ago', '')}</span>
                          : s.status === 'delivered' ? <span className="muted small">{timeAgo(s.updated_at)}</span>
                          : s.eta && <span className="muted small" title={fullTime(s.eta)}>ETA {new Date(s.eta).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
                      </div>
                      <div className="ship-route">
                        <Link to={linkFor(s.from)}>{s.from.name}</Link>
                        <ArrowRight size={13} className="muted" />
                        <Link to={linkFor(s.to)}>{s.to.name}</Link>
                      </div>
                      <ul className="ship-items">
                        {s.items.map((i) => <li key={i.resource_type_id}><strong>{i.quantity}</strong> {d.rt(i.resource_type_id).unit} · {d.rt(i.resource_type_id).name}</li>)}
                      </ul>
                      {s.notes && <div className="muted small ship-notes">{s.notes}</div>}
                      <div className="muted small">
                        {dist != null && `${dist.toFixed(1)} km · `}
                        {s.need_ids?.length ? `fills ${s.need_ids.length} need` : 'not linked to a need'}
                      </div>
                      {(next || ['requested', 'approved'].includes(s.status)) && (
                        <div className="ship-actions">
                          {['requested', 'approved'].includes(s.status) && (
                            <button className="btn btn-ghost btn-sm danger" disabled={busy === s.id} onClick={() => move(s, 'cancelled')}>{s.status === 'requested' ? 'Decline' : 'Cancel'}</button>
                          )}
                          {next && <button className="btn btn-sm btn-primary" disabled={busy === s.id} onClick={() => move(s, next.status)}>{next.label}</button>}
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      {cancelled.length > 0 && (
        <details className="cancelled">
          <summary>{cancelled.length} cancelled shipment{cancelled.length === 1 ? '' : 's'}</summary>
          <ul className="plain">
            {cancelled.map((s) => <li key={s.id} className="small muted">{s.from.name} → {s.to.name}: {s.items.map((i) => `${i.quantity} ${d.rt(i.resource_type_id).name}`).join(', ')} · {timeAgo(s.updated_at)}</li>)}
          </ul>
        </details>
      )}

      {dialog && <ShipmentDialog onClose={() => setDialog(false)} />}
    </div>
  )
}
