import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil } from 'lucide-react'
import { api } from '../api/index.js'
import { useData } from '../data.jsx'
import { Empty, Modal } from '../components/ui.jsx'
import { cap, fullTime } from '../lib/format.js'

export default function FamilyDetail() {
  const { id } = useParams()
  const d = useData()
  const [family, setFamily] = useState(null)
  const [plan, setPlan] = useState(null)
  const [error, setError] = useState(null)
  const [planError, setPlanError] = useState(null)
  const [editing, setEditing] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    setFamily(null); setPlan(null); setError(null); setPlanError(null)
    api.getFamily(id).then((value) => { if (active) setFamily(value) }).catch((err) => { if (active) setError(err.message) })
    api.getPlan(id).then((value) => { if (active) setPlan(value) }).catch((err) => { if (active) setPlanError(err.status === 404 ? 'No plan has been generated.' : err.message) })
    return () => { active = false }
  }, [id, revision])
  const close = useCallback(() => setEditing(false), [])
  return <div className="page">
    <Link className="back" to="/families"><ArrowLeft size={14} /> Families</Link>
    {error && <p className="error" role="alert">{error}</p>}
    {!family ? !error && <Empty>Loading family…</Empty> : <>
      <div className="page-head"><div><h1>Family profile</h1><p className="muted mono">{family.id}</p></div><button className="btn" onClick={() => setEditing(true)}><Pencil size={15} /> Edit profile</button></div>
      <div className="detail-grid">
        <section className="card-panel">
          <h2>Household</h2>
          <p>{family.adults} adults · {family.children} children</p>
          <p className="muted small">Location: {family.location.latitude}, {family.location.longitude}</p>
          <p>Car: {family.resources.has_car ? 'Yes' : 'No'} · Pets: {family.needs.pets ? 'Yes' : 'No'} · Immediate medication: {family.needs.immediate_medication ? 'Yes' : 'No'}</p>
          <h2>Care notes</h2>
          <p><strong>Medical:</strong> {family.needs.medical_notes || '—'}</p><p><strong>Accessibility:</strong> {family.needs.accessibility_notes || '—'}</p><p><strong>Other special care:</strong> {family.needs.other_special_care || '—'}</p>
        </section>
        <section className="card-panel">
          <h2>Current plan</h2>
          {planError ? <p className="muted">{planError}</p> : !plan ? <Empty>Loading plan…</Empty> : <>
            <p><strong>{plan.shelter ? <Link to={`/map?shelter=${encodeURIComponent(plan.shelter.id)}`}>{plan.shelter.name}</Link> : 'No shelter assigned'}</strong></p>
            {plan.shelter && <p className="muted">{plan.shelter.address} · {cap(plan.shelter.status)}</p>}
            <p>{plan.reason}</p><p className="muted small">Version {plan.version} · Updated {fullTime(plan.updated_at)} · Capacity {plan.capacity_reserved ? 'reserved' : 'not reserved'}</p>
            {plan.shelter && <details><summary>Shelter details in this plan</summary><p>Listed capacity: {plan.shelter.capacity.total_people} people</p><p>Pets: {plan.shelter.capabilities.pets_allowed ? 'Yes' : 'No'} · Child friendly: {plan.shelter.capabilities.child_friendly ? 'Yes' : 'No'} · Wheelchair accessible: {plan.shelter.capabilities.wheelchair_accessible ? 'Yes' : 'No'}</p><p>Medical staff: {plan.shelter.capabilities.medical_staff?.join(', ') || 'None listed'}</p><p>Special care: {plan.shelter.capabilities.special_care_notes || 'None listed'}</p><p>Supplies: {Object.entries(plan.shelter.resources).map(([name, value]) => `${cap(name)}: ${value}`).join(' · ')}</p></details>}
            {plan.instructions.length > 0 && <><h2>Instructions</h2><ul>{plan.instructions.map((item, i) => <li key={i}>{item}</li>)}</ul></>}
            <h2>Plan alerts</h2>{plan.alerts.length === 0 ? <p className="muted">No plan alerts.</p> : <ul>{plan.alerts.map((alert, i) => <li key={`${alert.code}-${i}`}><strong>{cap(alert.severity)}:</strong> {alert.message}</li>)}</ul>}
          </>}
        </section>
      </div>
      {editing && <EditFamily family={family} onClose={close} onSaved={() => { close(); setRevision((v) => v + 1); d.refresh() }} />}
    </>}
  </div>
}

function EditFamily({ family, onClose, onSaved }) {
  const [draft, setDraft] = useState(() => structuredClone({ adults: family.adults, children: family.children, location: family.location, needs: family.needs, resources: family.resources }))
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (key, value) => setDraft((v) => ({ ...v, [key]: value }))
  const nested = (key, field, value) => setDraft((v) => ({ ...v, [key]: { ...v[key], [field]: value } }))
  async function save(e) {
    e.preventDefault(); setError(null)
    if (draft.adults + draft.children < 1) return setError('A household must include at least one person.')
    setBusy(true)
    try { await api.updateFamily(family.id, draft); onSaved() } catch (err) { setError(err.message); setBusy(false) }
  }
  return <Modal title="Edit family profile" onClose={onClose} wide><form className="form" onSubmit={save}>
    <div className="row"><label className="field"><span>Adults</span><input type="number" min="0" step="1" required value={draft.adults} onChange={(e) => set('adults', e.target.valueAsNumber)} /></label><label className="field"><span>Children</span><input type="number" min="0" step="1" required value={draft.children} onChange={(e) => set('children', e.target.valueAsNumber)} /></label></div>
    <div className="row"><label className="field"><span>Latitude</span><input type="number" min="-90" max="90" step="any" required value={draft.location.latitude} onChange={(e) => nested('location', 'latitude', e.target.valueAsNumber)} /></label><label className="field"><span>Longitude</span><input type="number" min="-180" max="180" step="any" required value={draft.location.longitude} onChange={(e) => nested('location', 'longitude', e.target.valueAsNumber)} /></label></div>
    <div className="checks"><label className="check"><input type="checkbox" checked={draft.resources.has_car} onChange={(e) => nested('resources', 'has_car', e.target.checked)} /> Has a car</label><label className="check"><input type="checkbox" checked={draft.needs.pets} onChange={(e) => nested('needs', 'pets', e.target.checked)} /> Has pets</label><label className="check"><input type="checkbox" checked={draft.needs.immediate_medication} onChange={(e) => nested('needs', 'immediate_medication', e.target.checked)} /> Immediate medication</label></div>
    {[['medical_notes', 'Medical notes'], ['accessibility_notes', 'Accessibility notes'], ['other_special_care', 'Other special care']].map(([key, label]) => <label className="field" key={key}><span>{label}</span><textarea rows={2} value={draft.needs[key] || ''} onChange={(e) => nested('needs', key, e.target.value || null)} /></label>)}
    <p className="muted small">Saving relevant changes automatically recomputes plans for the disaster.</p>
    {error && <p className="error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
  </form></Modal>
}
