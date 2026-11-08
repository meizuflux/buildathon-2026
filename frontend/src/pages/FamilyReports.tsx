import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import type { ReportType } from '../api/types'
import { useData } from '../data'
import { REPORT_TYPES } from '../lib/constants'
import { fullTime, timeAgo } from '../lib/format'
import { REPORT_STATUS_TEXT, REPORT_STATUS_TONE, REPORT_TONE, isOpen } from '../lib/ops'
import ReportActions from '../components/ReportActions'
import { Empty, Head, Seg } from '../components/ui'

type StatusFilter = 'open' | 'resolved' | 'all'
type TypeFilter = 'all' | ReportType

export default function FamilyReports() {
  const d = useData()
  const [status, setStatus] = useState<StatusFilter>('open')
  const [type, setType] = useState<TypeFilter>('all')
  const reports = [...d.reports].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
  const open = reports.filter(isOpen)
  const byStatus = status === 'open' ? open : status === 'resolved' ? reports.filter((r) => !isOpen(r)) : reports
  const shown = type === 'all' ? byStatus : byStatus.filter((r) => r.type === type)

  return (
    <div className="hx-page">
      <Head title="Family reports" sub="What families have sent from the Haven app, newest first. Resolve a report when it's handled.">
        <Seg<StatusFilter> label="Filter by status" value={status} onChange={setStatus} options={[
          ['open', 'Open', '', open.length],
          ['resolved', 'Resolved', '', reports.length - open.length],
          ['all', 'All', '', reports.length],
        ]} />
        <select style={{ width: 'auto' }} value={type} onChange={(e) => setType(e.target.value as TypeFilter)} aria-label="Filter by report type">
          <option value="all">All types</option>
          {(Object.entries(REPORT_TYPES) as [ReportType, string][]).map(([k, label]) => (
            <option key={k} value={k}>{label} ({byStatus.filter((r) => r.type === k).length})</option>
          ))}
        </select>
      </Head>
      {d.errors.reports ? <p className="notice notice-error" role="alert">Reports could not be loaded: {d.errors.reports}</p>
        : !d.loaded ? <Empty>Loading reports…</Empty>
          : shown.length === 0 ? (
            <section className="hx-panel">
              <Empty>{!reports.length ? 'No reports from families yet. They appear here as soon as a family sends one from the app.'
                : status === 'open' && type === 'all' ? 'No open reports. Everything families have sent is resolved.'
                  : 'No reports match these filters.'}</Empty>
            </section>
          ) : (
            <div className="hx-reports">
              {shown.map((r) => (
                <article key={r.id} className={`hx-panel hx-report ty-${r.type}${isOpen(r) ? '' : ' is-resolved'}`}>
                  <div className="r1">
                    <span className={`badge ${REPORT_TONE[r.type] || 't-muted'}`}>{REPORT_TYPES[r.type] || r.type}</span>
                    <span className="r1-meta">
                      <span className={`badge ${REPORT_STATUS_TONE[r.status]}`}>{REPORT_STATUS_TEXT[r.status]}</span>
                      <span className="small muted" title={fullTime(r.created_at)}>{timeAgo(r.created_at)}</span>
                    </span>
                  </div>
                  <p>{r.message}</p>
                  <div className="r3">
                    <Link to={`/families/${encodeURIComponent(r.family_id)}`}>Family {r.family_id}</Link>
                    {r.location ? <Link className="btn btn-sm" to={`/map?report=${encodeURIComponent(r.id)}`}><MapPin size={13} /> Show on map</Link> : <span>No location</span>}
                  </div>
                  <div className="hx-report-actions"><ReportActions report={r} /></div>
                </article>
              ))}
            </div>
          )}
    </div>
  )
}
