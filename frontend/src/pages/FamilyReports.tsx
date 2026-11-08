import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import type { ReportType } from '../api/types'
import { useData } from '../data'
import { REPORT_TYPES } from '../lib/constants'
import { fullTime, timeAgo } from '../lib/format'
import { REPORT_TONE } from '../lib/ops'
import { Empty, Head, Seg, type SegOption } from '../components/ui'

type Filter = 'all' | ReportType

export default function FamilyReports() {
  const d = useData()
  const [type, setType] = useState<Filter>('all')
  const reports = [...d.reports].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
  const shown = type === 'all' ? reports : reports.filter((r) => r.type === type)
  const options: SegOption<Filter>[] = [
    ['all', 'All', '', reports.length],
    ...(Object.entries(REPORT_TYPES) as [ReportType, string][]).map(([k, label]): SegOption<Filter> => [k, label, '', reports.filter((r) => r.type === k).length]),
  ]

  return (
    <div className="hx-page">
      <Head title="Family reports" sub="What families have sent from the Haven app in this disaster, newest first.">
        <Seg label="Filter by report type" value={type} onChange={setType} options={options} />
      </Head>
      {d.errors.reports ? <p className="notice notice-error" role="alert">Reports could not be loaded: {d.errors.reports}</p>
        : !d.loaded ? <Empty>Loading reports…</Empty>
          : shown.length === 0 ? (
            <section className="hx-panel"><Empty>{reports.length ? 'No reports of this type.' : 'No reports from families yet. They appear here as soon as a family sends one from the app.'}</Empty></section>
          ) : (
            <div className="hx-reports">
              {shown.map((r) => (
                <article key={r.id} className={`hx-panel hx-report ty-${r.type}`}>
                  <div className="r1">
                    <span className={`badge ${REPORT_TONE[r.type] || 't-muted'}`}>{REPORT_TYPES[r.type] || r.type}</span>
                    <span className="small muted" title={fullTime(r.created_at)}>{timeAgo(r.created_at)}</span>
                  </div>
                  <p>{r.message}</p>
                  <div className="r3">
                    <Link to={`/families/${encodeURIComponent(r.family_id)}`}>Family {r.family_id}</Link>
                    {r.location ? <Link className="btn btn-sm" to={`/map?report=${encodeURIComponent(r.id)}`}><MapPin size={13} /> Show on map</Link> : <span>No location</span>}
                  </div>
                </article>
              ))}
            </div>
          )}
    </div>
  )
}
