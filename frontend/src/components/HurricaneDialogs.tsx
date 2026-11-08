import { useState, type FormEvent } from 'react'
import { useData } from '../data'
import type { HurricanePhase } from '../api/types'
import { errorMessage } from '../lib/ops'
import { Modal } from './ui'

// null while the first load is in flight; peace if the server has no status.
export function useHurricanePhase(): HurricanePhase | null {
  const d = useData()
  if (d.hurricane) return d.hurricane.phase
  return d.loaded ? 'peace' : null
}

export function InitiateHurricaneDialog({ onClose }: { onClose: () => void }) {
  const d = useData()
  const [name, setName] = useState('Hurricane Delia')
  const [category, setCategory] = useState(4)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || trimmed.length > 60) return setError('Enter a hurricane name of 1 to 60 characters.')
    setPending(true)
    setError(null)
    try {
      await d.mutate((api, id) => api.initiateHurricane(id, { name: trimmed, category }))
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setPending(false)
    }
  }

  return (
    <Modal title="Initiate hurricane" onClose={() => !pending && onClose()}>
      <form className="hx-form" onSubmit={submit}>
        <div className="hx-row">
          <label className="hx-field">
            <span>Name</span>
            <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} disabled={pending} required />
          </label>
          <label className="hx-field">
            <span>Category</span>
            <select value={category} onChange={(e) => setCategory(Number(e.target.value))} disabled={pending}>
              {[1, 2, 3, 4, 5].map((c) => <option key={c} value={c}>Category {c}</option>)}
            </select>
          </label>
        </div>
        <p className="muted">Publishes a critical evacuation broadcast and every household's personalized shelter assignment.</p>
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        <div className="hx-form-actions">
          <button type="button" className="btn" onClick={onClose} disabled={pending}>Cancel</button>
          <button type="submit" className="btn btn-danger" disabled={pending}>{pending ? 'Initiating…' : 'Initiate'}</button>
        </div>
      </form>
    </Modal>
  )
}

export function ResetHurricaneDialog({ onClose }: { onClose: () => void }) {
  const d = useData()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setPending(true)
    setError(null)
    try {
      await d.mutate((api, id) => api.resetHurricane(id))
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setPending(false)
    }
  }

  return (
    <Modal title="Stop disaster" onClose={() => !pending && onClose()}>
      <div className="hx-form">
        <p>This ends the hurricane, removes the demo's evacuation broadcast and its activity, and returns the dashboard to peace. Household profiles and shelters are kept.</p>
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        <div className="hx-form-actions">
          <button type="button" className="btn" onClick={onClose} disabled={pending}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={confirm} disabled={pending}>{pending ? 'Stopping…' : 'Stop disaster'}</button>
        </div>
      </div>
    </Modal>
  )
}
