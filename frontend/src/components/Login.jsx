import { useState } from 'react'
import { useAuth } from '../auth.jsx'
import { USE_MOCK, SHARED_MOCK } from '../api/index.js'

export default function Login() {
  const { login } = useAuth()
  const demo = USE_MOCK || SHARED_MOCK
  const [email, setEmail] = useState(demo ? 'government@demo.example' : '')
  const [password, setPassword] = useState(demo ? 'haven-demo' : '')
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
        <div className="brand brand-lg">
          <span className="brand-mark" aria-hidden="true" />
          Haven <span className="brand-sub">Operations</span>
        </div>
        <p className="muted">Sign in with your operator account to manage relief locations, communications and logistics.</p>
        {USE_MOCK && <p className="notice">Browser demo mode: any email and password work.</p>}
        {SHARED_MOCK && <p className="notice">Shared demo API: sign in as <strong>government@demo.example</strong> / <strong>haven-demo</strong>. Partners use the portal with their own logins.</p>}
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
