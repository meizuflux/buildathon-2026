import { useState } from 'react'
import { Check, Copy, KeyRound, UserPlus } from 'lucide-react'
import { useData } from '../data.jsx'
import { Modal } from './ui.jsx'
import { cap, timeAgo } from '../lib/format.js'

export const PORTAL_URL = import.meta.env.VITE_PORTAL_URL || 'http://localhost:5174'

// Shown once after a login is created or its password reset.
export function CredentialsDialog({ creds, onClose }) {
  const [copied, setCopied] = useState(null)
  const invite = `You've been given access to the Haven partner portal for ${creds.siteName}.

Portal: ${PORTAL_URL}
Email: ${creds.email}
Temporary password: ${creds.password}

You'll be asked to choose a new password when you first sign in. Use the portal to keep your status, capacity and stock up to date, confirm deliveries, request supplies and message the operations center.`
  const copy = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      /* clipboard blocked; text is selectable */
    }
  }
  return (
    <Modal title="Portal login ready" onClose={onClose}>
      <p className="muted">Share these with {creds.siteName}. The temporary password is shown <strong>only once</strong>; they'll set their own on first sign-in.</p>
      <dl className="creds">
        <dt>Portal</dt><dd><a href={PORTAL_URL} target="_blank" rel="noreferrer">{PORTAL_URL}</a></dd>
        <dt>Email</dt><dd className="mono">{creds.email}</dd>
        <dt>Temporary password</dt>
        <dd className="mono creds-pw">
          {creds.password}
          <button className="icon-btn" onClick={() => copy('pw', creds.password)} aria-label="Copy password">{copied === 'pw' ? <Check size={15} /> : <Copy size={15} />}</button>
        </dd>
      </dl>
      <div className="form-actions">
        <button className="btn" onClick={() => copy('invite', invite)}>{copied === 'invite' ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy invite message</>}</button>
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </Modal>
  )
}

export async function createLogin(d, site, email, contactName) {
  const r = await d.mutate((api) => api.createPartnerAccount({ site, email, contact_name: contactName }))
  return { email: r.account.email, password: r.temporary_password, siteName: r.account.site.name }
}

export function useAccountActions() {
  const d = useData()
  const [creds, setCreds] = useState(null)
  const reset = async (a) => {
    if (!confirm(`Reset the portal password for ${a.email}? Their current sessions will be signed out.`)) return
    try {
      const r = await d.mutate((api) => api.resetPartnerPassword(a.id))
      setCreds({ email: a.email, password: r.temporary_password, siteName: a.site.name })
    } catch (e) {
      alert(e.message)
    }
  }
  const toggle = async (a) => {
    const disabling = a.status === 'active'
    if (disabling && !confirm(`Disable portal access for ${a.email}? They'll be signed out immediately.`)) return
    await d.mutate((api) => api.updatePartnerAccount(a.id, { status: disabling ? 'disabled' : 'active' })).catch((e) => alert(e.message))
  }
  const dialog = creds && <CredentialsDialog creds={creds} onClose={() => setCreds(null)} />
  return { reset, toggle, setCreds, dialog }
}

// Portal access card for one shelter or organization.
export default function PortalAccess({ site, defaultEmail = '', defaultName = '' }) {
  const d = useData()
  const accounts = d.partnerAccounts.filter((a) => a.site.kind === site.kind && a.site.id === site.id)
  const [adding, setAdding] = useState(false)
  const [email, setEmail] = useState(defaultEmail)
  const [name, setName] = useState(defaultName)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const { reset, toggle, setCreds, dialog } = useAccountActions()

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      setCreds(await createLogin(d, site, email, name))
      setAdding(false)
      setEmail('')
      setName('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card-panel">
      <div className="panel-title">
        <h2>Partner portal access</h2>
        {!adding && <button className="btn btn-sm" onClick={() => { setAdding(true); setEmail(email || defaultEmail); setName(name || defaultName) }}><UserPlus size={14} /> Create login</button>}
      </div>
      <p className="hint">Logins let this {site.kind} update its own status{site.kind === 'organization' ? ', stock' : ', capacity, supplies'} and deliveries, request supplies and message you. Changes appear here live.</p>
      {accounts.length === 0 && !adding && <p className="muted small">No portal logins yet.</p>}
      <ul className="accounts">
        {accounts.map((a) => (
          <li key={a.id} className={a.status !== 'active' ? 'is-disabled' : ''}>
            <div className="grow">
              <div className="mono small">{a.email}</div>
              <div className="muted small">{a.contact_name || '—'} · {a.last_login_at ? `last sign-in ${timeAgo(a.last_login_at)}` : 'never signed in'}</div>
            </div>
            <span className={`badge ${a.status === 'active' ? 'lvl-ok' : 'lvl-closed'}`}>{cap(a.status)}</span>
            <button className="icon-btn" title="Reset password" aria-label="Reset password" onClick={() => reset(a)}><KeyRound size={15} /></button>
            <button className="btn btn-ghost btn-sm" onClick={() => toggle(a)}>{a.status === 'active' ? 'Disable' : 'Enable'}</button>
          </li>
        ))}
      </ul>
      {adding && (
        <form className="form add-login" onSubmit={submit}>
          <label className="field"><span>Login email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="ops@partner.example" /></label>
          <label className="field"><span>Contact name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Who will use it" /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="form-actions">
            <button type="button" className="btn btn-sm" onClick={() => setAdding(false)}>Cancel</button>
            <button className="btn btn-sm btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create login'}</button>
          </div>
        </form>
      )}
      {dialog}
    </section>
  )
}
