import { useState, type FormEvent } from 'react'
import type { ResourceAvailability, ResourceKey, ShelterInput } from '../api/types'
import { AVAILABILITY, MEDICAL_STAFF, RESOURCE_KEYS, SHELTER_STATUSES } from '../lib/constants'
import { cap } from '../lib/format'
import { errorMessage } from '../lib/ops'
import { Seg } from './ui'

type Capabilities = ShelterInput['capabilities']
const shown = (n: number) => (Number.isFinite(n) ? n : '')

// Create and edit share this form. The draft lives in the map page so a click on
// the map can move the shelter while the form is open.
export default function ShelterEditor({ draft, setDraft, isNew, onCancel, onSave }: {
  draft: ShelterInput
  setDraft: (fn: (draft: ShelterInput) => ShelterInput) => void
  isNew: boolean
  onCancel: () => void
  onSave: (draft: ShelterInput) => Promise<void>
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const setField = <K extends keyof ShelterInput>(k: K, v: ShelterInput[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const setLocation = (k: 'latitude' | 'longitude', v: number) => setDraft((d) => ({ ...d, location: { ...d.location, [k]: v } }))
  const setCapacity = (k: 'total_people' | 'available_people', v: number) => setDraft((d) => ({ ...d, capacity: { ...d.capacity, [k]: v } }))
  const setCapability = <K extends keyof Capabilities>(k: K, v: Capabilities[K]) => setDraft((d) => ({ ...d, capabilities: { ...d.capabilities, [k]: v } }))
  const setResource = (k: ResourceKey, v: ResourceAvailability) => setDraft((d) => ({ ...d, resources: { ...d.resources, [k]: v } }))
  const staff = draft.capabilities.medical_staff ?? []
  const toggleStaff = (role: string) => setCapability('medical_staff', staff.includes(role) ? staff.filter((r) => r !== role) : [...staff, role])

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const { total_people: total, available_people: avail } = draft.capacity
    if (!draft.name.trim() || !draft.address.trim()) return setError('Add a name and an address.')
    if (!(total >= 0) || !(avail >= 0)) return setError('Capacity must be zero or more.')
    if (avail > total) return setError('Spaces free cannot be more than total capacity.')
    setBusy(true)
    setError(null)
    try {
      await onSave(draft)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <form className="hx-form" onSubmit={submit}>
      <div className="hd">
        <h2>{isNew ? 'Add shelter' : `Edit ${draft.name || 'shelter'}`}</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>

      <fieldset className="hx-fieldset">
        <legend>Location</legend>
        <label className="hx-field"><span>Name</span><input value={draft.name} onChange={(e) => setField('name', e.target.value)} placeholder="Central Community Center" required /></label>
        <label className="hx-field"><span>Address</span><input value={draft.address} onChange={(e) => setField('address', e.target.value)} placeholder="100 Main Street, Example City" required /></label>
        <div className="hx-row">
          <label className="hx-field"><span>Latitude</span><input type="number" step="any" min="-90" max="90" value={shown(draft.location.latitude)} onChange={(e) => setLocation('latitude', e.target.valueAsNumber)} required /></label>
          <label className="hx-field"><span>Longitude</span><input type="number" step="any" min="-180" max="180" value={shown(draft.location.longitude)} onChange={(e) => setLocation('longitude', e.target.valueAsNumber)} required /></label>
        </div>
        <p className="small muted">Or click the map to place it.</p>
      </fieldset>

      <fieldset className="hx-fieldset">
        <legend>Status and capacity</legend>
        <Seg label="Status" className="seg-block" value={draft.status} onChange={(v) => setField('status', v)} options={SHELTER_STATUSES.map((s) => [s, cap(s)] as const)} />
        <div className="hx-row">
          <label className="hx-field"><span>Total capacity</span><input type="number" min="0" value={shown(draft.capacity.total_people)} onChange={(e) => setCapacity('total_people', e.target.valueAsNumber)} required /></label>
          <label className="hx-field"><span>Spaces free</span>
            <div className="hx-stepper">
              <button type="button" aria-label="Decrease spaces free" onClick={() => setCapacity('available_people', Math.max(0, (draft.capacity.available_people || 0) - 1))}>−</button>
              <input type="number" min="0" value={shown(draft.capacity.available_people)} onChange={(e) => setCapacity('available_people', e.target.valueAsNumber)} required />
              <button type="button" aria-label="Increase spaces free" onClick={() => setCapacity('available_people', (draft.capacity.available_people || 0) + 1)}>+</button>
            </div>
          </label>
        </div>
      </fieldset>

      <fieldset className="hx-fieldset">
        <legend>Can support</legend>
        <div className="hx-checks">
          <label><input type="checkbox" checked={!!draft.capabilities.pets_allowed} onChange={(e) => setCapability('pets_allowed', e.target.checked)} />Pets allowed</label>
          <label><input type="checkbox" checked={!!draft.capabilities.child_friendly} onChange={(e) => setCapability('child_friendly', e.target.checked)} />Child friendly</label>
          <label><input type="checkbox" checked={!!draft.capabilities.wheelchair_accessible} onChange={(e) => setCapability('wheelchair_accessible', e.target.checked)} />Wheelchair accessible</label>
        </div>
        <div className="hx-field"><span>Medical staff on site</span>
          <div className="chips">
            {MEDICAL_STAFF.map((r) => <button type="button" key={r} className="chip" aria-pressed={staff.includes(r)} onClick={() => toggleStaff(r)}>{cap(r)}</button>)}
          </div>
        </div>
        <label className="hx-field"><span>Special care notes</span><textarea rows={2} value={draft.capabilities.special_care_notes || ''} onChange={(e) => setCapability('special_care_notes', e.target.value)} placeholder="For example, can refrigerate insulin" /></label>
      </fieldset>

      <fieldset className="hx-fieldset">
        <legend>Supplies</legend>
        <div className="hx-resgrid">
          {RESOURCE_KEYS.map((k) => (
            <div key={k} className="r">
              <span>{cap(k)}</span>
              <Seg label={cap(k)} value={draft.resources[k] ?? 'unknown'} onChange={(v) => setResource(k, v)} options={AVAILABILITY.map((a) => [a, cap(a), `a-${a}`] as const)} />
            </div>
          ))}
        </div>
      </fieldset>

      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <div className="hx-form-actions">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : isNew ? 'Add shelter' : 'Save changes'}</button>
      </div>
    </form>
  )
}
