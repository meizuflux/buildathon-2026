import { useState } from 'react'
import { useData } from '../data.jsx'
import { Modal, Segmented } from './ui.jsx'
import { ORG_SERVICES, ORG_STATUSES, ORG_TYPES, emptyOrganization } from '../lib/constants.js'
import { cap } from '../lib/format.js'

export default function OrgDialog({ org, onClose, onSaved }) {
  const d = useData()
  const [draft, setDraft] = useState(() => {
    if (!org) return emptyOrganization(d.disasterId)
    const { id, updated_at, ...rest } = org // eslint-disable-line no-unused-vars
    return structuredClone(rest)
  })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const set = (k, v) => setDraft((x) => ({ ...x, [k]: v }))
  const setNested = (k, sub, v) => setDraft((x) => ({ ...x, [k]: { ...x[k], [sub]: v } }))
  const toggleService = (s) => set('services', draft.services.includes(s) ? draft.services.filter((x) => x !== s) : [...draft.services, s])

  async function submit(e) {
    e.preventDefault()
    if (!draft.name.trim()) return setError('Name is required.')
    setBusy(true)
    try {
      const saved = await d.mutate((api) => (org ? api.updateOrganization(org.id, draft) : api.createOrganization(draft)))
      onSaved?.(saved)
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={org ? `Edit ${org.name}` : 'Add organization'} onClose={onClose} wide>
      <form onSubmit={submit} className="form">
        <div className="row">
          <label className="field">
            <span>Name</span>
            <input value={draft.name} onChange={(e) => set('name', e.target.value)} required placeholder="Bayside Food Bank" />
          </label>
          <label className="field">
            <span>Type</span>
            <select value={draft.type} onChange={(e) => set('type', e.target.value)}>
              {Object.entries(ORG_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>
        <div className="field">
          <span>Services</span>
          <div className="filters">
            {Object.entries(ORG_SERVICES).map(([k, v]) => (
              <button type="button" key={k} className={`filter ${draft.services.includes(k) ? 'on' : ''}`} aria-pressed={draft.services.includes(k)} onClick={() => toggleService(k)}>{v}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Status</span>
          <Segmented size="sm" value={draft.status} onChange={(v) => set('status', v)} label="Status" options={ORG_STATUSES.map((s) => [s, cap(s)])} />
        </div>
        <label className="field">
          <span>Address</span>
          <input value={draft.address} onChange={(e) => set('address', e.target.value)} />
        </label>
        <div className="row row-3">
          <label className="field">
            <span>Latitude</span>
            <input type="number" step="any" value={draft.location.latitude} onChange={(e) => setNested('location', 'latitude', Number(e.target.value))} />
          </label>
          <label className="field">
            <span>Longitude</span>
            <input type="number" step="any" value={draft.location.longitude} onChange={(e) => setNested('location', 'longitude', Number(e.target.value))} />
          </label>
          <label className="field">
            <span>Coverage radius (km)</span>
            <input type="number" min="0" value={draft.coverage_radius_km} onChange={(e) => set('coverage_radius_km', Number(e.target.value))} />
          </label>
        </div>
        <fieldset>
          <legend>Primary contact</legend>
          <div className="row row-3">
            <label className="field"><span>Name</span><input value={draft.contact.name} onChange={(e) => setNested('contact', 'name', e.target.value)} /></label>
            <label className="field"><span>Phone</span><input type="tel" value={draft.contact.phone} onChange={(e) => setNested('contact', 'phone', e.target.value)} /></label>
            <label className="field"><span>Email</span><input type="email" value={draft.contact.email} onChange={(e) => setNested('contact', 'email', e.target.value)} /></label>
          </div>
        </fieldset>
        <label className="field">
          <span>Notes</span>
          <textarea rows={2} value={draft.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Vehicles, hours, special capabilities" />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : org ? 'Save changes' : 'Add organization'}</button>
        </div>
      </form>
    </Modal>
  )
}
