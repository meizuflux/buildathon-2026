import { useEffect, useState } from 'react'
import { useAuth } from '../auth.jsx'
import { useData } from '../data.jsx'
import { PageHead } from '../components/ui.jsx'
import { ChangePasswordForm } from './Login.jsx'
import { ORG_SERVICES, ORG_TYPES } from '../lib/constants.js'

export default function Account() {
  const { user } = useAuth()
  const d = useData()
  return (
    <div className="page narrow">
      <PageHead title={d.isOrg ? 'Organization profile' : 'Account'} subtitle={`Signed in as ${user.email}`} />
      {d.isOrg && d.me && <OrgProfile />}
      {!d.isOrg && d.me && (
        <section className="card-panel">
          <h2>{d.me.name}</h2>
          <p className="muted small">{d.me.address}</p>
          <p className="hint">Your shelter's name and address are managed by the operations center. Message them if something is wrong.</p>
        </section>
      )}
      <section className="card-panel">
        <h2>Change password</h2>
        <ChangePasswordForm />
      </section>
    </div>
  )
}

function OrgProfile() {
  const d = useData()
  const pick = (o) => ({ contact: { ...o.contact }, notes: o.notes || '', services: [...o.services], coverage_radius_km: o.coverage_radius_km, address: o.address })
  const [draft, setDraft] = useState(() => pick(d.me))
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(pick(d.me))
  useEffect(() => { if (!dirty) setDraft(pick(d.me)) }, [d.me]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setDraft((x) => ({ ...x, [k]: v }))
  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      await d.mutate((api) => api.updateOrganization(d.me.id, draft))
      setMsg({ ok: 'Profile saved.' })
    } catch (err) {
      setMsg({ error: err.message })
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="card-panel form" onSubmit={save}>
      <h2>{d.me.name}</h2>
      <p className="muted small">{ORG_TYPES[d.me.type]}</p>
      <div className="field"><span>Services you provide</span>
        <div className="filters">
          {Object.entries(ORG_SERVICES).map(([k, v]) => (
            <button type="button" key={k} className={`filter ${draft.services.includes(k) ? 'on' : ''}`} aria-pressed={draft.services.includes(k)}
              onClick={() => set('services', draft.services.includes(k) ? draft.services.filter((x) => x !== k) : [...draft.services, k])}>{v}</button>
          ))}
        </div>
      </div>
      <label className="field"><span>Address</span><input value={draft.address} onChange={(e) => set('address', e.target.value)} /></label>
      <div className="row">
        <label className="field"><span>Contact name</span><input value={draft.contact.name} onChange={(e) => set('contact', { ...draft.contact, name: e.target.value })} /></label>
        <label className="field"><span>Phone</span><input type="tel" value={draft.contact.phone} onChange={(e) => set('contact', { ...draft.contact, phone: e.target.value })} /></label>
      </div>
      <div className="row">
        <label className="field"><span>Email</span><input type="email" value={draft.contact.email} onChange={(e) => set('contact', { ...draft.contact, email: e.target.value })} /></label>
        <label className="field"><span>Coverage radius (km)</span><input type="number" min="0" value={draft.coverage_radius_km} onChange={(e) => set('coverage_radius_km', Number(e.target.value))} /></label>
      </div>
      <label className="field"><span>Notes for operations</span><textarea rows={3} value={draft.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Vehicles, hours, capacity, special capabilities" /></label>
      {msg?.error && <p className="error">{msg.error}</p>}
      {msg?.ok && <p className="success">{msg.ok}</p>}
      <div className="form-actions"><button className="btn btn-primary" disabled={!dirty || busy}>{busy ? 'Saving…' : 'Save profile'}</button></div>
    </form>
  )
}
