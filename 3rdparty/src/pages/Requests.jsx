import { useState } from 'react'
import { PackagePlus, Truck } from 'lucide-react'
import { useData } from '../data.jsx'
import { Empty, Modal, PageHead, PriorityBadge, Progress, Segmented } from '../components/ui.jsx'
import { CATEGORIES, PRIORITIES, PRIORITY_RANK } from '../lib/constants.js'
import { cap, needProgress, timeAgo } from '../lib/format.js'

export default function Requests() {
  const d = useData()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState('open')
  const list = d.myNeeds
    .filter((n) => (view === 'open' ? n.status === 'open' : n.status !== 'open'))
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.created_at.localeCompare(a.created_at))

  const cancel = (n) => confirm('Cancel this request?') && d.mutate((api) => api.updateNeed(n.id, { status: 'cancelled' })).catch((e) => alert(e.message))

  return (
    <div className="page narrow">
      <PageHead title="Supply requests" subtitle="Ask the operations center for specific quantities. You'll see shipments appear as they're dispatched.">
        <button className="btn btn-primary" onClick={() => setOpen(true)}><PackagePlus size={15} /> Request supplies</button>
      </PageHead>
      <Segmented value={view} onChange={setView} label="Show" options={[['open', `Open (${d.myNeeds.filter((n) => n.status === 'open').length})`], ['closed', 'Fulfilled & cancelled']]} />

      <div className="stack mt">
        {list.length === 0 && <Empty>{view === 'open' ? 'No open requests.' : 'Nothing here yet.'}</Empty>}
        {list.map((n) => {
          const r = d.rt(n.resource_type_id)
          const p = needProgress(n, d.inbound)
          return (
            <article key={n.id} className={`card-panel req pri-edge-${n.priority}`}>
              <div className="row-between">
                <div><PriorityBadge priority={n.priority} /> <strong>{n.quantity_needed} {r.unit}</strong> {r.name}</div>
                {n.status !== 'open' ? <span className={`badge st-${n.status}`}>{cap(n.status)}</span> : <span className="muted small">requested {timeAgo(n.created_at)}</span>}
              </div>
              {n.notes && <p className="small">{n.notes}</p>}
              <Progress total={n.quantity_needed} done={n.quantity_fulfilled} pending={p.onTheWay} />
              <div className="row-between small">
                <span className="muted">{n.quantity_fulfilled} received · {p.onTheWay} on the way · {p.uncovered} still needed</span>
                {n.status === 'open' && <button className="btn btn-ghost btn-sm danger" onClick={() => cancel(n)}>Cancel</button>}
              </div>
              {p.shipments.length > 0 && (
                <ul className="plain-list small">
                  {p.shipments.map((s) => <li key={s.id}><Truck size={12} /> {s.from.name}: {s.items.find((i) => i.resource_type_id === n.resource_type_id)?.quantity} {r.unit} · {s.status === 'in_transit' ? 'on the way' : s.status === 'approved' ? 'approved, leaving soon' : 'offered'}</li>)}
                </ul>
              )}
            </article>
          )
        })}
      </div>
      {open && <RequestDialog onClose={() => setOpen(false)} />}
    </div>
  )
}

function RequestDialog({ onClose }) {
  const d = useData()
  const [rtId, setRtId] = useState('')
  const [qty, setQty] = useState(10)
  const [priority, setPriority] = useState('high')
  const [hours, setHours] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const grouped = Object.entries(CATEGORIES).map(([c, label]) => [label, d.resourceTypes.filter((r) => r.category === c)]).filter(([, l]) => l.length)

  async function submit(e) {
    e.preventDefault()
    if (!rtId || !(qty > 0)) return setError('Choose a resource and quantity.')
    setBusy(true)
    try {
      await d.mutate((api, disasterId) => api.createNeed({
        disaster_id: disasterId, requester: { kind: d.site.kind, id: d.site.id }, resource_type_id: rtId, quantity_needed: qty, priority, notes,
        needed_by: hours ? new Date(Date.now() + Number(hours) * 3600_000).toISOString() : null,
      }))
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <Modal title="Request supplies" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="row">
          <label className="field"><span>What you need</span>
            <select value={rtId} onChange={(e) => setRtId(e.target.value)} required>
              <option value="">Choose…</option>
              {grouped.map(([label, l]) => <optgroup key={label} label={label}>{l.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>)}
            </select>
          </label>
          <label className="field"><span>How many {rtId && `(${d.rt(rtId).unit})`}</span><input type="number" min="1" value={qty} onChange={(e) => setQty(Number(e.target.value))} required /></label>
        </div>
        <div className="field"><span>How urgent</span>
          <Segmented size="sm" value={priority} onChange={setPriority} label="Priority" options={PRIORITIES.map((p) => [p, cap(p), `pri-on-${p}`])} />
        </div>
        <label className="field"><span>Needed within (hours, optional)</span><input type="number" min="1" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="e.g. 4" /></label>
        <label className="field"><span>Notes for operations</span><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Who it's for, delivery instructions…" /></label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
        </div>
      </form>
    </Modal>
  )
}
