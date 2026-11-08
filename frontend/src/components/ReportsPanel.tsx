import { useState } from 'react'
import { Link } from 'react-router-dom'
import { REPORT_TYPES } from '../lib/constants'
import { fullTime, timeAgo } from '../lib/format'
import type { Report } from '../api/types'

export default function ReportsPanel({ reports }: { reports: Report[] }) {
  const [type, setType] = useState('all')
  const shown = type === 'all' ? reports : reports.filter((r) => r.type === type)

  return (
    <div className="panel-body">
      <div className="panel-toolbar">
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by report type">
          <option value="all">All reports ({reports.length})</option>
          {Object.entries(REPORT_TYPES).map(([k, label]) => (
            <option key={k} value={k}>{label} ({reports.filter((r) => r.type === k).length})</option>
          ))}
        </select>
      </div>

      <ul className="list">
        {shown.length === 0 && <li className="empty">No reports from families yet.</li>}
        {shown.map((r) => (
          <li key={r.id} className={`card report type-${r.type}`}>
            <div className="card-head">
              <span className={`badge rtype-${r.type}`}>{REPORT_TYPES[r.type] || r.type}</span>
              <span className="muted" title={fullTime(r.created_at)}>{timeAgo(r.created_at)}</span>
            </div>
            <p className="report-msg">{r.message}</p>
            <div className="card-foot">
              <span className="muted mono">{r.family_id}</span>
              <span className="foot-actions">
                {r.location ? (
                  <Link className="btn btn-ghost btn-sm" to={`/map?report=${encodeURIComponent(r.id)}`}>Show on map</Link>
                ) : (
                  <span className="muted">No location</span>
                )}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
