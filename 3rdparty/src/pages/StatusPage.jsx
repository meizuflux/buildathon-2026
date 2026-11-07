import { useEffect, useState } from 'react'
import { useData } from '../data.jsx'
import { Empty, PageHead, Segmented } from '../components/ui.jsx'
import { AVAILABILITY, MEDICAL_STAFF, RESOURCE_KEYS, SHELTER_STATUSES } from '../lib/constants.js'
import { cap, timeAgo } from '../lib/format.js'

// Shelter-only: status, capacity, supplies and what the site can support.
export default function StatusPage() {
  const d = useData()
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (d.me && !draft) setDraft(structuredClone({ status: d.me.status, capacity: d.me.capacity, resources: d.me.resources, capabilities: d.me.capabilities }))
  }, [d.me, draft])

  if (!d.me || !draft) return <div className="page"><Empty>Loading…</Empty></div>
  const set = (path, v) => setDraft((x) => {
    const n = structuredClone(x)
    let o = n
    for (const k of path.slice(0, -1)) o = o[k]
    o[path.at(-1)] = v
    return n
  })
  const dirty = JSON.stringify(draft) !== JSON.stringify({ status: d.me.status, capacity: d.me.capacity, resources: d.me.resources, capabilities: d.me.capabilities })

  async function save() {
    const { total_people: t, available_people: a } = draft.capacity
    if (a > t) return setMsg({ error: 'Spaces free cannot be more than total capacity.' })
    setBusy(true)
    setMsg(null)
    try {
      await d.mutate((api) => api.updateShelter(d.me.id, draft))
      setDraft(null)
      setMsg({ ok: 'Saved. Operations can see your update now.' })
    } catch (e) {
      setMsg({ error: e.message })
    } finally {
      setBusy(false)
    }
  }

  const staff = draft.capabilities.medical_staff || []
  return (
    <div className="page narrow">
      <PageHead title="Status & capacity" subtitle={`Last updated ${timeAgo(d.me.updated_at)}. Keep this current — it drives where families are sent.`}>
        {dirty && <button className="btn" onClick={() => setDraft(null)}>Discard</button>}
        <button className="btn btn-primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button>
      </PageHead>
      {msg?.error && <p className="error">{msg.error}</p>}
      {msg?.ok && <p className="success">{msg.ok}</p>}

      <section className="card-panel">
        <h2>Status</h2>
        <Segmented value={draft.status} onChange={(v) => set(['status'], v)} label="Status" options={SHELTER_STATUSES.map((s) => [s, cap(s), `st-on-${s}`])} />
        <div className="row mt">
          <label className="field"><span>Total capacity (people)</span>
            <input type="number" min="0" value={draft.capacity.total_people} onChange={(e) => set(['capacity', 'total_people'], Number(e.target.value))} />
          </label>
          <label className="field"><span>Spaces free right now</span>
            <input type="number" min="0" value={draft.capacity.available_people} onChange={(e) => set(['capacity', 'available_people'], Number(e.target.value))} />
          </label>
        </div>
      </section>

      <section className="card-panel">
        <h2>Supplies on site</h2>
        <p className="hint">Rough levels. To ask for a specific quantity, use <strong>Requests</strong>.</p>
        <div className="res-grid">
          {RESOURCE_KEYS.map((k) => (
            <div key={k} className="res-row">
              <span className="res-name">{cap(k)}</span>
              <Segmented size="sm" label={cap(k)} value={draft.resources[k]} onChange={(v) => set(['resources', k], v)}
                options={AVAILABILITY.map((a) => [a, cap(a), `res-${a}`])} />
            </div>
          ))}
        </div>
      </section>

      <section className="card-panel">
        <h2>What you can support</h2>
        <div className="checks">
          {[['pets_allowed', 'Pets allowed'], ['child_friendly', 'Child friendly'], ['wheelchair_accessible', 'Wheelchair accessible']].map(([k, label]) => (
            <label key={k} className="check"><input type="checkbox" checked={!!draft.capabilities[k]} onChange={(e) => set(['capabilities', k], e.target.checked)} />{label}</label>
          ))}
        </div>
        <div className="field"><span>Medical staff on site now</span>
          <div className="filters">
            {MEDICAL_STAFF.map((r) => (
              <button type="button" key={r} className={`filter ${staff.includes(r) ? 'on' : ''}`} aria-pressed={staff.includes(r)}
                onClick={() => set(['capabilities', 'medical_staff'], staff.includes(r) ? staff.filter((x) => x !== r) : [...staff, r])}>{cap(r)}</button>
            ))}
          </div>
        </div>
        <label className="field"><span>Special care notes</span>
          <textarea rows={2} value={draft.capabilities.special_care_notes || ''} onChange={(e) => set(['capabilities', 'special_care_notes'], e.target.value)} placeholder="e.g. Can refrigerate insulin" />
        </label>
      </section>
    </div>
  )
}
