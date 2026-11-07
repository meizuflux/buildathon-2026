import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useData } from '../data.jsx'
import { Modal, SiteSelect, Segmented } from './ui.jsx'
import { PRIORITIES } from '../lib/constants.js'
import { available, km } from '../lib/logistics.js'
import { cap } from '../lib/format.js'

// initial: { from?: {kind,id}, to?: {kind,id}, items?: [{resource_type_id, quantity}], need_ids?, priority? }
export default function ShipmentDialog({ initial = {}, onClose, onCreated }) {
  const d = useData()
  const [from, setFrom] = useState(initial.from || null)
  const [to, setTo] = useState(initial.to || null)
  const [items, setItems] = useState(initial.items?.length ? initial.items : [{ resource_type_id: '', quantity: 1 }])
  const [priority, setPriority] = useState(initial.priority || 'medium')
  const [etaMin, setEtaMin] = useState(60)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const stock = useMemo(() => {
    const m = {}
    for (const r of d.inventory) if (r.holder.id === from?.id) m[r.resource_type_id] = available(r)
    return m
  }, [d.inventory, from])

  const sources = d.organizations.filter((o) => o.status !== 'inactive' && d.inventory.some((r) => r.holder.id === o.id && available(r) > 0))
  const dest = d.site(to)
  const src = d.site(from)
  const distance = km(src?.location, dest?.location)

  const setItem = (i, patch) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  async function submit(e) {
    e.preventDefault()
    setError(null)
    const clean = items.filter((i) => i.resource_type_id && i.quantity > 0)
    if (!from || !to) return setError('Choose where the shipment comes from and where it goes.')
    if (!clean.length) return setError('Add at least one item.')
    const short = clean.find((i) => i.quantity > (stock[i.resource_type_id] || 0))
    if (short) return setError(`${src.name} only has ${stock[short.resource_type_id] || 0} ${d.rt(short.resource_type_id).name} available.`)
    setBusy(true)
    try {
      const created = await d.mutate((api, disasterId) => api.createShipment({
        disaster_id: disasterId, from, to, items: clean, need_ids: initial.need_ids || [], priority,
        eta: new Date(Date.now() + etaMin * 60_000).toISOString(), notes,
      }))
      onCreated?.(created)
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title="Dispatch resources" onClose={onClose} wide>
      <form onSubmit={submit} className="form">
        <div className="row">
          <label className="field">
            <span>From (source)</span>
            <select value={from?.id || ''} onChange={(e) => setFrom(e.target.value ? { kind: 'organization', id: e.target.value } : null)} required>
              <option value="">Choose an organization…</option>
              {sources.map((o) => <option key={o.id} value={o.id}>{o.name}{o.status === 'limited' ? ' (limited)' : ''}</option>)}
            </select>
          </label>
          <label className="field">
            <span>To (destination)</span>
            <SiteSelect value={to} onChange={setTo} shelters={d.shelters.filter((s) => s.status !== 'closed')} organizations={d.organizations} required />
          </label>
        </div>
        {distance != null && <p className="hint">≈ {distance.toFixed(1)} km straight-line distance</p>}

        <fieldset>
          <legend>Items</legend>
          <div className="item-rows">
            {items.map((it, i) => {
              const avail = stock[it.resource_type_id]
              const over = it.resource_type_id && it.quantity > (avail || 0)
              return (
                <div key={i} className="item-row">
                  <select value={it.resource_type_id} onChange={(e) => setItem(i, { resource_type_id: e.target.value })} aria-label="Resource">
                    <option value="">Resource…</option>
                    {d.resourceTypes.map((r) => (
                      <option key={r.id} value={r.id} disabled={from && !stock[r.id]}>
                        {r.name}{from ? ` — ${stock[r.id] || 0} ${r.unit} free` : ''}
                      </option>
                    ))}
                  </select>
                  <input type="number" min="1" value={it.quantity} className={over ? 'invalid' : ''} aria-label="Quantity"
                    onChange={(e) => setItem(i, { quantity: e.target.value === '' ? '' : Number(e.target.value) })} />
                  <span className="unit muted">{it.resource_type_id ? d.rt(it.resource_type_id).unit : ''}</span>
                  <button type="button" className="icon-btn" aria-label="Remove item" disabled={items.length === 1}
                    onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
                </div>
              )
            })}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setItems((xs) => [...xs, { resource_type_id: '', quantity: 1 }])}>
            <Plus size={14} /> Add item
          </button>
        </fieldset>

        <div className="row">
          <div className="field">
            <span>Priority</span>
            <Segmented size="sm" value={priority} onChange={setPriority} label="Priority"
              options={PRIORITIES.map((p) => [p, cap(p), `pri-on-${p}`])} />
          </div>
          <label className="field">
            <span>ETA (minutes from now)</span>
            <input type="number" min="5" step="5" value={etaMin} onChange={(e) => setEtaMin(Number(e.target.value))} />
          </label>
        </div>
        <label className="field">
          <span>Notes for driver / recipient</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Use loading dock B, ask for Dana" />
        </label>
        {initial.need_ids?.length > 0 && <p className="hint">Linked to {initial.need_ids.length} need. Delivery will count toward it.</p>}

        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Dispatching…' : 'Approve & dispatch'}</button>
        </div>
      </form>
    </Modal>
  )
}
