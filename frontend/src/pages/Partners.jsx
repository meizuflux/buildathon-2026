import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, KeyRound, UserPlus } from 'lucide-react'
import { useData } from '../data.jsx'
import { Empty, Modal, PageHeader, SiteSelect } from '../components/ui.jsx'
import { PORTAL_URL, createLogin, useAccountActions } from '../components/PortalAccess.jsx'
import { cap, timeAgo } from '../lib/format.js'

export default function Partners() {
  const d = useData()
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('all')
  const [adding, setAdding] = useState(false)
  const { reset, toggle, setCreds, dialog } = useAccountActions()

  const list = d.partnerAccounts
    .filter((a) => kind === 'all' || a.site.kind === kind)
    .filter((a) => !query || `${a.email} ${a.contact_name} ${a.site.name}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.site.name.localeCompare(b.site.name))
  const withLogin = new Set(d.partnerAccounts.filter((a) => a.status === 'active').map((a) => `${a.site.kind}:${a.site.id}`))
  const sitesWithout = [...d.organizations.map((o) => ({ kind: 'organization', ...o })), ...d.shelters.filter((s) => s.status !== 'closed').map((s) => ({ kind: 'shelter', ...s }))]
    .filter((s) => !withLogin.has(`${s.kind}:${s.id}`))

  return (
    <div className="page">
      <PageHeader title="Portal access" subtitle="Logins that let shelters and relief organizations manage their own data in the Haven partner portal.">
        <a className="btn" href={PORTAL_URL} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open partner portal</a>
        <button className="btn btn-primary" onClick={() => setAdding(true)}><UserPlus size={15} /> Create login</button>
      </PageHeader>

      <div className="summary-strip">
        <div><strong>{d.partnerAccounts.filter((a) => a.status === 'active').length}</strong> active logins</div>
        <div><strong>{d.partnerAccounts.filter((a) => a.last_login_at).length}</strong> have signed in</div>
        <div className={sitesWithout.length ? 'tone-alert' : ''}><strong>{sitesWithout.length}</strong> sites without a login</div>
      </div>

      <div className="toolbar">
        <input type="search" placeholder="Search email, contact or site" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search logins" />
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Site type">
          <option value="all">Shelters &amp; organizations</option>
          <option value="organization">Organizations</option>
          <option value="shelter">Shelters</option>
        </select>
      </div>

      <div className="card-panel flush table-scroll">
        <table className="table">
          <thead><tr><th>Site</th><th>Login email</th><th>Contact</th><th>Status</th><th>Last sign-in</th><th>Created</th><th /></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={7}><Empty>No portal logins yet.</Empty></td></tr>}
            {list.map((a) => (
              <tr key={a.id} className={a.status !== 'active' ? 'is-disabled' : ''}>
                <td>
                  <Link className="strong-link" to={a.site.kind === 'organization' ? `/organizations/${a.site.id}` : `/map?shelter=${a.site.id}`}>{a.site.name}</Link>
                  <div className="muted small">{cap(a.site.kind)}</div>
                </td>
                <td className="mono small">{a.email}</td>
                <td className="small">{a.contact_name || '—'}</td>
                <td><span className={`badge ${a.status === 'active' ? 'lvl-ok' : 'lvl-closed'}`}>{cap(a.status)}</span></td>
                <td className="muted small nowrap">{a.last_login_at ? timeAgo(a.last_login_at) : 'Never'}</td>
                <td className="muted small nowrap">{timeAgo(a.created_at)}</td>
                <td className="num nowrap">
                  <button className="btn btn-ghost btn-sm" onClick={() => reset(a)}><KeyRound size={13} /> Reset</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggle(a)}>{a.status === 'active' ? 'Disable' : 'Enable'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sitesWithout.length > 0 && (
        <section className="callout callout-info">
          <div className="callout-title">Sites without portal access</div>
          <div className="callout-items">
            {sitesWithout.map((s) => (
              <div key={`${s.kind}:${s.id}`} className="callout-item">
                <span className="tag">{cap(s.kind)}</span> {s.name}
                <button className="btn btn-ghost btn-sm" onClick={() => setAdding({ kind: s.kind, id: s.id, email: s.contact?.email || '', name: s.contact?.name || '' })}>Create login</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {adding && <NewLoginDialog initial={adding === true ? {} : adding} onClose={() => setAdding(false)} onCreated={setCreds} />}
      {dialog}
    </div>
  )
}

function NewLoginDialog({ initial, onClose, onCreated }) {
  const d = useData()
  const [site, setSite] = useState(initial.id ? { kind: initial.kind, id: initial.id } : null)
  const [email, setEmail] = useState(initial.email || '')
  const [name, setName] = useState(initial.name || '')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!site) return setError('Choose a shelter or organization.')
    setBusy(true)
    try {
      onCreated(await createLogin(d, site, email, name))
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <Modal title="Create portal login" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label className="field"><span>Shelter or organization</span>
          <SiteSelect value={site} required shelters={d.shelters} organizations={d.organizations} onChange={(v) => {
            setSite(v)
            const o = v?.kind === 'organization' && d.organizations.find((x) => x.id === v.id)
            if (o && !email) setEmail(o.contact?.email || '')
            if (o && !name) setName(o.contact?.name || '')
          }} />
        </label>
        <label className="field"><span>Login email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="field"><span>Contact name</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <p className="hint">A temporary password is generated and shown once. They choose their own on first sign-in.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create login'}</button>
        </div>
      </form>
    </Modal>
  )
}
