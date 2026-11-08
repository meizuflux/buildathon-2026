import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Info, Siren } from 'lucide-react'
import { useData } from '../data'
import { fullTime, timeAgo } from '../lib/format'
import { SEV_TONE } from '../lib/ops'
import { Empty, Head, Seg } from '../components/ui'

const ICONS = { critical: Siren, warning: AlertTriangle, info: Info }
const PAGE_SIZE = 50
type Filter = 'all' | 'critical' | 'warning' | 'info'

export default function Alerts() {
  const d = useData()
  const [severity, setSeverity] = useState<Filter>('all')
  const [page, setPage] = useState(0)
  useEffect(() => { setPage(0) }, [severity, d.disasterId])
  const all = d.alerts?.alerts ?? []
  const count = (s: Filter) => all.filter((a) => a.severity === s).length
  const alerts = all.filter((a) => severity === 'all' || a.severity === severity)
  const lastPage = Math.max(0, Math.ceil(alerts.length / PAGE_SIZE) - 1)
  const current = Math.min(page, lastPage)
  const shelterName = (id: string | null) => d.shelters.find((s) => s.id === id)?.name

  return (
    <div className="hx-page">
      <Head title="Operational alerts" sub="Current conditions reported by the backend, most severe first. Resolved alerts disappear on the next sync.">
        <Seg<Filter> label="Filter alerts by severity" value={severity} onChange={setSeverity} options={[
          ['all', 'All', '', all.length], ['critical', 'Critical', '', count('critical')], ['warning', 'Warning', '', count('warning')], ['info', 'Info', '', count('info')],
        ]} />
      </Head>
      <section className="hx-panel">
        {d.errors.alerts ? <p className="notice notice-error" style={{ margin: 16 }}>Alerts could not be loaded.</p>
          : !d.alerts ? <Empty>Loading alerts…</Empty>
            : <>
              <ul className="hx-alerts">
                {alerts.length === 0 && <Empty>No alerts match this filter.</Empty>}
                {alerts.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map((a) => {
                  const Icon = ICONS[a.severity] || Info
                  const where = shelterName(a.shelter_id)
                  return (
                    <li key={a.id}>
                      <span className={`ic ${SEV_TONE[a.severity] || 't-muted'}`}><Icon size={16} aria-hidden="true" /></span>
                      <div>
                        <div className="t">{a.message}</div>
                        <div className="m" title={fullTime(a.updated_at)}>
                          {a.severity === 'critical' ? 'Critical' : a.severity === 'warning' ? 'Warning' : 'Info'}
                          {where ? `, ${where}` : ''}{a.family_id ? `, family ${a.family_id}` : ''}, {timeAgo(a.updated_at)}
                        </div>
                      </div>
                      <div className="acts">
                        {a.family_id && <Link className="btn btn-sm" to={`/families/${encodeURIComponent(a.family_id)}`}>View family</Link>}
                        {a.shelter_id && <Link className="btn btn-sm" to={`/map?shelter=${encodeURIComponent(a.shelter_id)}`}>View shelter</Link>}
                        {a.shelter_id && <Link className="btn btn-sm" to={`/comms/broadcasts?to=${encodeURIComponent(a.shelter_id)}`}>Message families</Link>}
                      </div>
                    </li>
                  )
                })}
              </ul>
              {(d.alerts.total > all.length || alerts.length > PAGE_SIZE) && (
                <div className="hx-pager">
                  <span>{d.alerts.total > all.length ? `Filters apply to the first ${all.length} of ${d.alerts.total} alerts, ordered by severity and recency.` : `${alerts.length} alerts`}</span>
                  {alerts.length > PAGE_SIZE && (
                    <div className="btns">
                      <button className="btn btn-sm" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button>
                      <span>Page {current + 1} of {lastPage + 1}</span>
                      <button className="btn btn-sm" disabled={current === lastPage} onClick={() => setPage(current + 1)}>Next</button>
                    </div>
                  )}
                </div>
              )}
            </>}
      </section>
    </div>
  )
}
