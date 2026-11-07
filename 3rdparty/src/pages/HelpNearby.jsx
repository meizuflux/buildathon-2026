import { useMemo, useState } from 'react'
import { HandHeart, MapPin } from 'lucide-react'
import { useData } from '../data.jsx'
import { Empty, Modal, PageHead, PriorityBadge } from '../components/ui.jsx'
import { CATEGORIES, PRIORITY_RANK } from '../lib/constants.js'
import { available, km, timeAgo } from '../lib/format.js'

// Organization-only: open needs elsewhere that this org could fill from its own
// stock. Offers go to the operations center for approval (status "requested").
export default function HelpNearby() {
  const d = useData()
  const [onlyStocked, setOnlyStocked] = useState(true)
  const [category, setCategory] = useState('all')
  const [offer, setOffer] = useState(null)

  const stock = useMemo(() => Object.fromEntries(d.inventory.map((r) => [r.resource_type_id, available(r)])), [d.inventory])
  const offered = useMemo(() => new Set(d.outbound.filter((s) => ['requested', 'approved', 'in_transit'].includes(s.status)).flatMap((s) => s.need_ids || [])), [d.outbound])

  const rows = d.needs
    .filter((n) => n.status === 'open' && !d.mine(n.requester))
    .filter((n) => category === 'all' || d.rt(n.resource_type_id).category === category)
    .map((n) => ({ n, have: stock[n.resource_type_id] || 0, still: Math.max(0, n.quantity_needed - n.quantity_fulfilled), dist: km(d.me?.location, d.siteOf(n.requester)?.location) }))
    .filter((r) => !onlyStocked || r.have > 0)
    .sort((a, b) => (b.have > 0) - (a.have > 0) || PRIORITY_RANK[a.n.priority] - PRIORITY_RANK[b.n.priority] || (a.dist ?? 99) - (b.dist ?? 99))

  return (
    <div className="page">
      <PageHead title="Help nearby" subtitle="Open requests from shelters and other organizations. Offer what you have — operations approves offers and coordinates delivery." />
      <div className="toolbar">
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="all">All categories</option>
          {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={onlyStocked} onChange={(e) => setOnlyStocked(e.target.checked)} /> Only what I have in stock</label>
      </div>

      <div className="help-grid">
        {rows.length === 0 && <Empty>No open requests match. {onlyStocked && 'Try showing requests you don\'t stock.'}</Empty>}
        {rows.map(({ n, have, still, dist }) => {
          const r = d.rt(n.resource_type_id)
          const already = offered.has(n.id)
          return (
            <article key={n.id} className={`card-panel help pri-edge-${n.priority}`}>
              <div className="row-between"><PriorityBadge priority={n.priority} /><span className="muted small">{timeAgo(n.created_at)}</span></div>
              <div className="help-what"><strong>{still} {r.unit}</strong> {r.name}</div>
              <div className="muted small"><MapPin size={12} /> {n.requester.name}{dist != null && ` · ${dist.toFixed(1)} km away`}</div>
              {n.notes && <p className="small">{n.notes}</p>}
              <div className="row-between help-foot">
                <span className={`small ${have ? '' : 'muted'}`}>You have <strong>{have}</strong> free</span>
                {already ? <span className="badge dir-out">Offer sent</span>
                  : <button className="btn btn-primary btn-sm" disabled={!have} onClick={() => setOffer({ n, have, still })}><HandHeart size={14} /> Offer</button>}
              </div>
            </article>
          )
        })}
      </div>
      {offer && <OfferDialog {...offer} onClose={() => setOffer(null)} />}
    </div>
  )
}

function OfferDialog({ n, have, still, onClose }) {
  const d = useData()
  const r = d.rt(n.resource_type_id)
  const [qty, setQty] = useState(Math.min(have, still))
  const [eta, setEta] = useState(60)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!(qty > 0) || qty > have) return setError(`You can offer between 1 and ${have}.`)
    setBusy(true)
    try {
      await d.mutate((api, disasterId) => api.createShipment({
        disaster_id: disasterId, from: { kind: 'organization', id: d.site.id }, to: { kind: n.requester.kind, id: n.requester.id },
        items: [{ resource_type_id: n.resource_type_id, quantity: qty }], need_ids: [n.id], priority: n.priority,
        eta: new Date(Date.now() + eta * 60_000).toISOString(), notes,
      }))
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <Modal title={`Offer ${r.name.toLowerCase()} to ${n.requester.name}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="muted small">They still need {still} {r.unit}. You have {have} free. Operations will approve the offer and reserve your stock.</p>
        <div className="row">
          <label className="field"><span>Quantity ({r.unit})</span><input type="number" min="1" max={have} value={qty} onChange={(e) => setQty(Number(e.target.value))} /></label>
          <label className="field"><span>Can deliver within (minutes)</span><input type="number" min="5" step="5" value={eta} onChange={(e) => setEta(Number(e.target.value))} /></label>
        </div>
        <label className="field"><span>Notes</span><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Vehicle, driver, pickup details" /></label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send offer'}</button>
        </div>
      </form>
    </Modal>
  )
}
