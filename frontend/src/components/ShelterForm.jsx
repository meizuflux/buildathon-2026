import { useState } from 'react'
import { AVAILABILITY, MEDICAL_STAFF, RESOURCE_KEYS, SHELTER_STATUSES } from '../lib/constants.js'
import { cap } from '../lib/format.js'

// Used for both create and edit. The draft lives in the parent (App) so map
// clicks can update its location while the form is open.
export default function ShelterForm({ draft, setDraft, isNew, onCancel, onSave }) {
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const set = (path, value) =>
    setDraft((d) => {
      const next = structuredClone(d)
      let o = next
      for (const k of path.slice(0, -1)) o = o[k]
      o[path.at(-1)] = value
      return next
    })

  const toggleStaff = (role) => {
    const staff = draft.capabilities.medical_staff || []
    set(['capabilities', 'medical_staff'], staff.includes(role) ? staff.filter((r) => r !== role) : [...staff, role])
  }

  async function submit(e) {
    e.preventDefault()
    const { total_people: total, available_people: avail } = draft.capacity
    if (!draft.name.trim() || !draft.address.trim()) return setError('Name and address are required.')
    if (!(total >= 0) || !(avail >= 0)) return setError('Capacity must be zero or more.')
    if (avail > total) return setError('Available spaces cannot exceed total capacity.')
    setBusy(true)
    setError(null)
    try {
      await onSave(draft)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const num = (v) => (v === '' ? '' : Number(v))

  return (
    <form className="panel-body form" onSubmit={submit}>
      <div className="form-head">
        <h2>{isNew ? 'Add relief location' : 'Edit relief location'}</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>

      <fieldset>
        <legend>Location</legend>
        <label className="field">
          <span>Name</span>
          <input value={draft.name} onChange={(e) => set(['name'], e.target.value)} placeholder="Central Community Center" required />
        </label>
        <label className="field">
          <span>Address</span>
          <input value={draft.address} onChange={(e) => set(['address'], e.target.value)} placeholder="100 Main Street, Example City" required />
        </label>
        <div className="row">
          <label className="field">
            <span>Latitude</span>
            <input type="number" step="any" min="-90" max="90" value={draft.location.latitude}
              onChange={(e) => set(['location', 'latitude'], num(e.target.value))} required />
          </label>
          <label className="field">
            <span>Longitude</span>
            <input type="number" step="any" min="-180" max="180" value={draft.location.longitude}
              onChange={(e) => set(['location', 'longitude'], num(e.target.value))} required />
          </label>
        </div>
        <p className="hint">Or click the map to place it.</p>
      </fieldset>

      <fieldset>
        <legend>Status &amp; capacity</legend>
        <div className="segmented" role="radiogroup" aria-label="Status">
          {SHELTER_STATUSES.map((s) => (
            <button type="button" key={s} role="radio" aria-checked={draft.status === s}
              className={draft.status === s ? 'on' : ''} onClick={() => set(['status'], s)}>
              {cap(s)}
            </button>
          ))}
        </div>
        <div className="row">
          <label className="field">
            <span>Total capacity (people)</span>
            <input type="number" min="0" value={draft.capacity.total_people}
              onChange={(e) => set(['capacity', 'total_people'], num(e.target.value))} required />
          </label>
          <label className="field">
            <span>Spaces available</span>
            <div className="stepper">
              <button type="button" aria-label="Decrease available spaces"
                onClick={() => set(['capacity', 'available_people'], Math.max(0, (draft.capacity.available_people || 0) - 1))}>−</button>
              <input type="number" min="0" value={draft.capacity.available_people}
                onChange={(e) => set(['capacity', 'available_people'], num(e.target.value))} required />
              <button type="button" aria-label="Increase available spaces"
                onClick={() => set(['capacity', 'available_people'], (draft.capacity.available_people || 0) + 1)}>+</button>
            </div>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Can support</legend>
        <div className="checks">
          {[
            ['pets_allowed', 'Pets allowed'],
            ['child_friendly', 'Child friendly'],
            ['wheelchair_accessible', 'Wheelchair accessible'],
          ].map(([k, label]) => (
            <label key={k} className="check">
              <input type="checkbox" checked={!!draft.capabilities[k]} onChange={(e) => set(['capabilities', k], e.target.checked)} />
              {label}
            </label>
          ))}
        </div>
        <div className="field">
          <span>Medical staff on site</span>
          <div className="filters">
            {MEDICAL_STAFF.map((r) => (
              <button type="button" key={r} className={`filter ${draft.capabilities.medical_staff?.includes(r) ? 'on' : ''}`}
                aria-pressed={draft.capabilities.medical_staff?.includes(r)} onClick={() => toggleStaff(r)}>
                {cap(r)}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Special care notes</span>
          <textarea rows={2} value={draft.capabilities.special_care_notes || ''}
            onChange={(e) => set(['capabilities', 'special_care_notes'], e.target.value)} placeholder="e.g. Can refrigerate insulin" />
        </label>
      </fieldset>

      <fieldset>
        <legend>Supplies</legend>
        <div className="res-grid">
          {RESOURCE_KEYS.map((k) => (
            <div key={k} className="res-row">
              <span className="res-name">{cap(k)}</span>
              <div className="segmented segmented-sm" role="radiogroup" aria-label={cap(k)}>
                {AVAILABILITY.map((a) => (
                  <button type="button" key={a} role="radio" aria-checked={draft.resources[k] === a}
                    className={draft.resources[k] === a ? `on res-${a}` : ''} onClick={() => set(['resources', k], a)}>
                    {cap(a)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : isNew ? 'Add shelter' : 'Save changes'}</button>
      </div>
    </form>
  )
}
