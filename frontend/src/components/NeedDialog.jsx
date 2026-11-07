import { useState } from 'react'
import { useData } from '../data.jsx'
import { Modal, Segmented, SiteSelect } from './ui.jsx'
import { CATEGORIES, PRIORITIES } from '../lib/constants.js'
import { cap } from '../lib/format.js'

export default function NeedDialog({ initial = {}, onClose }) {
  const d = useData()
  const [requester, setRequester] = useState(initial.requester || null)
  const [rtId, setRtId] = useState(initial.resource_type_id || '')
  const [qty, setQty] = useState(initial.quantity_needed || 10)
  const [priority, setPriority] = useState(initial.priority || 'high')
  const [neededIn, setNeededIn] = useState('')
  const [notes, setNotes] = useState(initial.notes || '')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const grouped = Object.entries(CATEGORIES)
    .map(([cat, label]) => [label, d.resourceTypes.filter((r) => r.category === cat)])
    .filter(([, list]) => list.length)

  async function submit(e) {
    e.preventDefault()
    if (!requester || !rtId || !(qty > 0)) return setError('Choose who needs it, the resource, and a quantity.')
    setBusy(true)
    try {
      await d.mutate((api, disasterId) => api.createNeed({
        disaster_id: disasterId, requester, resource_type_id: rtId, quantity_needed: qty, priority, notes: notes.trim() || null,
        needed_by: neededIn ? new Date(Date.now() + Number(neededIn) * 3600_000).toISOString() : null,
      }))
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title="Log a resource need" onClose={onClose}>
      <form onSubmit={submit} className="form">
        <label className="field">
          <span>Who needs it</span>
          <SiteSelect value={requester} onChange={setRequester} shelters={d.shelters} organizations={d.organizations} required />
        </label>
        <div className="row">
          <label className="field">
            <span>Resource</span>
            <select value={rtId} onChange={(e) => setRtId(e.target.value)} required>
              <option value="">Choose…</option>
              {grouped.map(([label, list]) => (
                <optgroup key={label} label={label}>
                  {list.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Quantity {rtId && <span className="muted">({d.rt(rtId).unit})</span>}</span>
            <input type="number" min="1" value={qty} onChange={(e) => setQty(Number(e.target.value))} required />
          </label>
        </div>
        <div className="row">
          <div className="field">
            <span>Priority</span>
            <Segmented size="sm" value={priority} onChange={setPriority} label="Priority" options={PRIORITIES.map((p) => [p, cap(p), `pri-on-${p}`])} />
          </div>
          <label className="field">
            <span>Needed within (hours, optional)</span>
            <input type="number" min="1" value={neededIn} onChange={(e) => setNeededIn(e.target.value)} placeholder="e.g. 4" />
          </label>
        </div>
        <label className="field">
          <span>Notes</span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Context for dispatchers" />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Log need'}</button>
        </div>
      </form>
    </Modal>
  )
}
