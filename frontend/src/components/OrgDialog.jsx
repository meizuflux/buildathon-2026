import { useState } from 'react'
import { useData } from '../data.jsx'
import { Modal, Segmented } from './ui.jsx'
import { ORG_SERVICES, ORG_STATUSES, ORG_TYPES, emptyOrganization } from '../lib/constants.js'
import { cap } from '../lib/format.js'
import { CredentialsDialog, createLogin } from './PortalAccess.jsx'

export default function OrgDialog({ org, onClose, onSaved }) {
  const d = useData()
  const [draft, setDraft] = useState(() => {
    if (!org) return emptyOrganization(d.disasterId)
    const { id, updated_at, ...rest } = org // eslint-disable-line no-unused-vars
    return structuredClone(rest)
  })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [portal, setPortal] = useState({ enabled: false, email: '' })
  const [creds, setCreds] = useState(null)

  const set = (k, v) => setDraft((x) => ({ ...x, [k]: v }))
  const setNested = (k, sub, v) => setDraft((x) => ({ ...x, [k]: { ...x[k], [sub]: v } }))
  const toggleService = (s) => set('services', draft.services.includes(s) ? draft.services.filter((x) => x !== s) : [...draft.services, s])

  async function submit(e) {
    e.preventDefault()
    if (!draft.name.trim()) return setError('Name is required.')
    setBusy(true)
    try {
      const { disaster_id, ...patch } = draft
      const saved = await d.mutate((api) => (org ? api.updateOrganization(org.id, patch) : api.createOrganization({ ...patch, disaster_id })))
      onSaved?.(saved)
      const loginEmail = (portal.email || draft.contact.email).trim()
      if (!org && portal.enabled && loginEmail) {
        try {
          setCreds(await createLogin(d, { kind: 'organization', id: saved.id }, loginEmail, draft.contact.name))
          return
        } catch (err) {
          alert(`Organization added, but the portal login failed: ${err.message}`)
        }
      }
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (creds) return <CredentialsDialog creds={creds} onClose={onClose} />

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
          <input value={draft.address} onChange={(e) => set('address', e.target.value)} required />
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
        {!org && (
          <fieldset className="portal-opt">
            <label className="check">
              <input type="checkbox" disabled checked={portal.enabled} onChange={(e) => setPortal((p) => ({ ...p, enabled: e.target.checked }))} />
              Create a partner portal login for this organization (unavailable)
            </label>
            {portal.enabled && (
              <label className="field" style={{ marginTop: 8 }}>
                <span>Login email</span>
                <input type="email" value={portal.email} placeholder={draft.contact.email || 'ops@partner.example'}
                  onChange={(e) => setPortal((p) => ({ ...p, email: e.target.value }))} required={!draft.contact.email} />
              </label>
            )}
            <p className="hint">They can then update their own status and stock, confirm deliveries, offer supplies and message you.</p>
          </fieldset>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : org ? 'Save changes' : portal.enabled ? 'Add & create login' : 'Add organization'}</button>
        </div>
      </form>
    </Modal>
  )
}
