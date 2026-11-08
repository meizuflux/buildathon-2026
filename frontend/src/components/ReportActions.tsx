import { useState } from 'react'
import { Check, RotateCcw } from 'lucide-react'
import type { Report, ReportStatus } from '../api/types'
import { useData } from '../data'
import { errorMessage } from '../lib/ops'

// Resolve or reopen a family report. Resolved reports drop out of
// the open help-request counts and the "Needs action" list.
export default function ReportActions({ report }: { report: Report; compact?: boolean }) {
  const d = useData()
  const [busy, setBusy] = useState<ReportStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const set = async (status: ReportStatus) => {
    setBusy(status)
    setError(null)
    try {
      await d.mutate((client) => client.updateReport(report.id, { status }))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      {report.status !== 'resolved' ? (
        <button className="btn btn-sm btn-resolve" disabled={!!busy} onClick={() => set('resolved')}>
          <Check size={13} aria-hidden="true" /> {busy === 'resolved' ? 'Saving…' : 'Resolve'}
        </button>
      ) : (
        <button className="btn btn-sm" disabled={!!busy} onClick={() => set('received')}>
          <RotateCcw size={13} aria-hidden="true" /> {busy === 'received' ? 'Saving…' : 'Reopen'}
        </button>
      )}
      {error && <span className="small" style={{ color: 'var(--red)' }} role="alert">{error}</span>}
    </>
  )
}
