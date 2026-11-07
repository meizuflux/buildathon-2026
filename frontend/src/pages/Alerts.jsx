import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Info, Siren } from 'lucide-react'
import { useData } from '../data.jsx'
import { Empty, PageHeader } from '../components/ui.jsx'
import { cap, fullTime, timeAgo } from '../lib/format.js'

const ICONS = { critical: Siren, warning: AlertTriangle, info: Info }
const PAGE_SIZE = 50

export default function Alerts() {
  const d = useData()
  const [severity, setSeverity] = useState('all')
  const [page, setPage] = useState(0)
  useEffect(() => { setPage(0) }, [severity, d.disasterId])
  const alerts = (d.alerts?.alerts || []).filter((a) => severity === 'all' || a.severity === severity)
  const lastPage = Math.max(0, Math.ceil(alerts.length / PAGE_SIZE) - 1)
  const currentPage = Math.min(page, lastPage)

  return <div className="page">
    <PageHeader title="Operational alerts" subtitle="Current conditions reported by the backend. Resolved alerts disappear on refresh." />
    <section className="card-panel">
      <div className="panel-title">
        <span className="muted">{d.alerts ? `${d.alerts.total} current alerts` : '—'}</span>
        <select className="select-sm" aria-label="Filter alerts by severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="all">All severities</option><option value="critical">Critical</option><option value="warning">Warning</option><option value="info">Info</option>
        </select>
      </div>
      {d.errors.alerts ? <p className="muted">Alerts could not be loaded.</p> : !d.alerts ? <p className="muted">Loading alerts…</p> : <>
        <ul className="attention">
          {alerts.length === 0 && <Empty>No alerts match this filter.</Empty>}
          {alerts.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((alert) => {
            const Icon = ICONS[alert.severity] || Info
            return <li key={alert.id} className={`att att-${alert.severity}`}>
              <Icon size={16} className="att-icon" aria-hidden="true" />
              <div className="att-body"><div className="att-title">{alert.message}</div><span className="muted small">{cap(alert.severity)}{alert.family_id ? ` · Family ${alert.family_id}` : ''}</span></div>
              <span className="muted small nowrap" title={fullTime(alert.updated_at)}>{timeAgo(alert.updated_at)}</span>
              {alert.shelter_id && <Link className="btn btn-sm" to={`/map?shelter=${encodeURIComponent(alert.shelter_id)}`}>View shelter</Link>}
            </li>
          })}
        </ul>
        {d.alerts.total > d.alerts.alerts.length && <p className="muted small">Filters apply to the first {d.alerts.alerts.length} of {d.alerts.total} alerts, ordered by severity and recency.</p>}
        {alerts.length > PAGE_SIZE && <div className="alerts-pagination"><button className="btn btn-sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span className="muted small">Page {currentPage + 1} of {lastPage + 1}</span><button className="btn btn-sm" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>Next</button></div>}
      </>}
    </section>
  </div>
}
