import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth'
import { errorMessage } from '../lib/ops'

export default function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email, password)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="hx hx-login">
      <form className="hx-panel" onSubmit={submit}>
        <div className="hx-brand">
          <img src="/haven-mark.svg" alt="" />
          <div><b>Haven</b><span>Operations</span></div>
        </div>
        <p className="muted">Sign in with your operator account to manage shelters, families and hurricane evacuation broadcasts.</p>
        <label className="hx-field"><span>Email</span><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="hx-field"><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  )
}
