import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil } from 'lucide-react'
import { api, ApiError } from '../api'
import type { Family, Plan } from '../api/types'
import { useData } from '../data'
import { cap, fullTime } from '../lib/format'
import { SEV_TONE, errorMessage } from '../lib/ops'
import OpsMap from '../components/OpsMap'
import { Empty, Modal } from '../components/ui'

export default function FamilyDetail() {
  const { id = '' } = useParams()
  const d = useData()
  const [family, setFamily] = useState<Family | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    setFamily(null); setPlan(null); setError(null); setPlanError(null)
    api.getFamily(id).then((v) => { if (active) setFamily(v) }).catch((e) => { if (active) setError(errorMessage(e)) })
    api.getPlan(id)
      .then((v) => { if (active) v ? setPlan(v) : setPlanError('No plan has been generated yet.') })
      .catch((e) => { if (active) setPlanError(e instanceof ApiError && e.status === 404 ? 'No plan has been generated yet.' : errorMessage(e)) })
    return () => { active = false }
  }, [id, revision])
  const close = useCallback(() => setEditing(false), [])

  const shelter = plan?.shelter ?? null
  const liveShelter = shelter ? d.shelters.find((s) => s.id === shelter.id) : undefined
  const home = family?.location ?? null
  const line: [number, number][] | null = home && shelter
    ? [[home.latitude, home.longitude], [shelter.location.latitude, shelter.location.longitude]]
    : null

  return (
    <div className="hx-page">
      <Link className="hx-back" to="/families"><ArrowLeft size={14} /> Families</Link>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {!family ? !error && <Empty>Loading family…</Empty> : <>
        <div className="hx-head">
          <div>
            <h1>Family {family.id}</h1>
            <p>{family.adults} {family.adults === 1 ? 'adult' : 'adults'} and {family.children} {family.children === 1 ? 'child' : 'children'}{shelter ? `, assigned to ${shelter.name}` : ''}</p>
          </div>
          <div className="actions"><button className="btn" onClick={() => setEditing(true)}><Pencil size={14} /> Edit profile</button></div>
        </div>

        <div className="hx-family">
          <div style={{ display: 'grid', gap: 18 }}>
            <section className="hx-panel hx-panel-pad" style={{ display: 'grid', gap: 14 }}>
              <h2>Household</h2>
              <div className="hx-facts">
                <div className="hx-fact"><b>{family.adults}</b><span>Adults</span></div>
                <div className="hx-fact"><b>{family.children}</b><span>Children</span></div>
                <div className={`hx-fact ${family.resources.has_car ? '' : 'on'}`}><b>{family.resources.has_car ? 'Yes' : 'No'}</b><span>Has a car</span></div>
                <div className="hx-fact"><b>{family.needs.pets ? 'Yes' : 'No'}</b><span>Pets</span></div>
                <div className={`hx-fact ${family.needs.immediate_medication ? 'on' : ''}`}><b>{family.needs.immediate_medication ? 'Yes' : 'No'}</b><span>Needs medication now</span></div>
              </div>
              <dl className="hx-dl">
                <dt>Medical notes</dt><dd>{family.needs.medical_notes || <span className="muted">None</span>}</dd>
                <dt>Accessibility</dt><dd>{family.needs.accessibility_notes || <span className="muted">None</span>}</dd>
                <dt>Other special care</dt><dd>{family.needs.other_special_care || <span className="muted">None</span>}</dd>
                <dt>Location</dt><dd className="mono">{family.location.latitude}, {family.location.longitude}</dd>
              </dl>
            </section>
            <div className="hx-minimap">
              <OpsMap shelters={liveShelter ? [liveShelter] : []} home={home} line={line} fitKey={`${family.id}-${shelter?.id || 'none'}`} popups={false} zoomControl={false} />
            </div>
          </div>

          <section className="hx-panel hx-panel-pad" style={{ display: 'grid', gap: 14 }}>
            <div className="hx-panel-title" style={{ margin: 0 }}><h2>Current plan</h2>{plan && <span className={`badge ${plan.status === 'no_match' ? 't-red' : 't-blue'}`}>{plan.status === 'no_match' ? 'No match' : 'Recommended'}</span>}</div>
            {planError ? <p className="muted">{planError}</p> : !plan ? <Empty>Loading plan…</Empty> : <>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{shelter ? <Link to={`/map?shelter=${encodeURIComponent(shelter.id)}`}>{shelter.name}</Link> : 'No shelter assigned'}</div>
                {shelter && <div className="muted small">{shelter.address}, {cap(shelter.status)}</div>}
              </div>
              <p>{plan.reason}</p>
              <div className="small muted">Version {plan.version}, updated {fullTime(plan.updated_at)}. Capacity {plan.capacity_reserved ? 'reserved' : 'not reserved'}.</div>
              {plan.instructions.length > 0 && <div><h3 style={{ marginBottom: 6 }}>Instructions sent to the family</h3><ul className="hx-list">{plan.instructions.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
              <div>
                <h3 style={{ marginBottom: 6 }}>Plan alerts</h3>
                {plan.alerts.length === 0 ? <p className="muted">No plan alerts.</p> : (
                  <ul className="hx-list">{plan.alerts.map((a, i) => <li key={`${a.code}-${i}`}><span className={`badge ${SEV_TONE[a.severity] || 't-muted'}`}>{cap(a.severity)}</span> {a.message}</li>)}</ul>
                )}
              </div>
              {shelter && (
                <details>
                  <summary>Shelter details in this plan</summary>
                  <dl className="hx-dl">
                    <dt>Listed capacity</dt><dd>{shelter.capacity.total_people} people</dd>
                    <dt>Pets</dt><dd>{shelter.capabilities.pets_allowed ? 'Yes' : 'No'}</dd>
                    <dt>Child friendly</dt><dd>{shelter.capabilities.child_friendly ? 'Yes' : 'No'}</dd>
                    <dt>Wheelchair accessible</dt><dd>{shelter.capabilities.wheelchair_accessible ? 'Yes' : 'No'}</dd>
                    <dt>Medical staff</dt><dd>{shelter.capabilities.medical_staff.join(', ') || 'None listed'}</dd>
                    <dt>Special care</dt><dd>{shelter.capabilities.special_care_notes || 'None listed'}</dd>
                    <dt>Supplies</dt><dd>{Object.entries(shelter.resources).map(([k, v]) => `${cap(k)}: ${v}`).join(', ')}</dd>
                  </dl>
                </details>
              )}
            </>}
          </section>
        </div>
        {editing && <EditFamily family={family} onClose={close} onSaved={() => { close(); setRevision((v) => v + 1); d.refresh() }} />}
      </>}
    </div>
  )
}

type Draft = Pick<Family, 'adults' | 'children' | 'location' | 'needs' | 'resources'>
type NoteKey = 'medical_notes' | 'accessibility_notes' | 'other_special_care'
const NOTES: [NoteKey, string][] = [['medical_notes', 'Medical notes'], ['accessibility_notes', 'Accessibility notes'], ['other_special_care', 'Other special care']]

function EditFamily({ family, onClose, onSaved }: { family: Family; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => structuredClone({ adults: family.adults, children: family.children, location: family.location, needs: family.needs, resources: family.resources }))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const needs = (patch: Partial<Draft['needs']>) => setDraft((x) => ({ ...x, needs: { ...x.needs, ...patch } }))
  const location = (patch: Partial<Draft['location']>) => setDraft((x) => ({ ...x, location: { ...x.location, ...patch } }))

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (draft.adults + draft.children < 1) return setError('A household needs at least one person.')
    setBusy(true)
    try {
      await api.updateFamily(family.id, draft)
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal title="Edit family profile" onClose={onClose} wide>
      <form className="hx-form" onSubmit={save}>
        <div className="hx-row">
          <label className="hx-field"><span>Adults</span><input type="number" min="0" step="1" required value={draft.adults} onChange={(e) => setDraft((x) => ({ ...x, adults: e.target.valueAsNumber }))} /></label>
          <label className="hx-field"><span>Children</span><input type="number" min="0" step="1" required value={draft.children} onChange={(e) => setDraft((x) => ({ ...x, children: e.target.valueAsNumber }))} /></label>
        </div>
        <div className="hx-row">
          <label className="hx-field"><span>Latitude</span><input type="number" min="-90" max="90" step="any" required value={draft.location.latitude} onChange={(e) => location({ latitude: e.target.valueAsNumber })} /></label>
          <label className="hx-field"><span>Longitude</span><input type="number" min="-180" max="180" step="any" required value={draft.location.longitude} onChange={(e) => location({ longitude: e.target.valueAsNumber })} /></label>
        </div>
        <div className="hx-checks">
          <label><input type="checkbox" checked={draft.resources.has_car} onChange={(e) => setDraft((x) => ({ ...x, resources: { ...x.resources, has_car: e.target.checked } }))} /> Has a car</label>
          <label><input type="checkbox" checked={draft.needs.pets} onChange={(e) => needs({ pets: e.target.checked })} /> Has pets</label>
          <label><input type="checkbox" checked={draft.needs.immediate_medication} onChange={(e) => needs({ immediate_medication: e.target.checked })} /> Needs medication now</label>
        </div>
        {NOTES.map(([k, label]) => (
          <label className="hx-field" key={k}><span>{label}</span><textarea rows={2} value={draft.needs[k] || ''} onChange={(e) => needs({ [k]: e.target.value || null })} /></label>
        ))}
        <p className="small muted">Saving relevant changes recomputes plans for the hurricane.</p>
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        <div className="hx-form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>
    </Modal>
  )
}
