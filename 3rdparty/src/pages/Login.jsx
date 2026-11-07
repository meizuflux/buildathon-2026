import { useState } from 'react'
import { useAuth } from '../auth.jsx'
import { api } from '../api.js'

export function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email, password)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand brand-lg"><span className="brand-mark" aria-hidden="true" />Haven <span className="brand-sub">Partner Portal</span></div>
        <p className="muted">For shelters and relief organizations working with the operations center. Use the login your coordinator gave you.</p>
        {import.meta.env.DEV && (
          <p className="notice">Demo logins (password <strong>haven-demo</strong>):<br />
            <button type="button" className="linkish" onClick={() => { setEmail('bayside@demo.example'); setPassword('haven-demo') }}>bayside@demo.example</button> — Bayside Food Bank<br />
            <button type="button" className="linkish" onClick={() => { setEmail('stluke@demo.example'); setPassword('haven-demo') }}>stluke@demo.example</button> — St. Luke Medical Annex (shelter)
          </p>
        )}
        <label className="field"><span>Email</span><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="field"><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="muted small center">Lost access? Ask your operations center to reset your password.</p>
      </form>
    </div>
  )
}

export function ChangePasswordForm({ onDone, firstTime }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError(null)
    if (next.length < 8) return setError('Use at least 8 characters.')
    if (next !== confirm) return setError("New passwords don't match.")
    if (next === current) return setError('Choose a password different from the temporary one.')
    setBusy(true)
    try {
      await api.changePassword(current, next)
      setOk(true)
      setCurrent(''); setNext(''); setConfirm('')
      onDone?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label className="field"><span>{firstTime ? 'Temporary password' : 'Current password'}</span><input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required /></label>
      <label className="field"><span>New password</span><input type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required /></label>
      <label className="field"><span>Confirm new password</span><input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></label>
      {error && <p className="error" role="alert">{error}</p>}
      {ok && !firstTime && <p className="success" role="status">Password updated.</p>}
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : firstTime ? 'Set password & continue' : 'Change password'}</button>
    </form>
  )
}

export function FirstLogin() {
  const { user, passwordChanged, logout } = useAuth()
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand brand-lg"><span className="brand-mark" aria-hidden="true" />Haven <span className="brand-sub">Partner Portal</span></div>
        <h2>Welcome, {user.site.name}</h2>
        <p className="muted">You signed in with a temporary password. Choose your own to continue.</p>
        <ChangePasswordForm firstTime onDone={passwordChanged} />
        <button className="btn btn-ghost btn-block" onClick={logout}>Sign out</button>
      </div>
    </div>
  )
}
