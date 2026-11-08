import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Info, Siren, type LucideIcon } from 'lucide-react'
import { useData } from '../data'
import { PageHeader, Empty } from '../components/ui'
import { cap, fullTime, timeAgo } from '../lib/format'
import type { Severity } from '../api/types'

const LEVEL_ICON: Record<Severity, LucideIcon> = { critical: Siren, warning: AlertTriangle, info: Info }
const REF_LINK: Record<string, (id: string) => string> = {
  shelter: (id) => `/map?shelter=${id}`,
  update: () => '/comms/broadcasts',
  report: (id) => `/map?report=${id}`,
}

export default function CommandCenter() {
  const d = useData()
  const sheltersActive = d.shelters.filter((s) => s.status !== 'closed')
  const total = sheltersActive.reduce((n, s) => n + (s.capacity.total_people || 0), 0)
  const free = sheltersActive.reduce((n, s) => n + Math.max(0, s.capacity.available_people || 0), 0)
  const help = d.reports.filter((r) => r.type === 'need_help' && r.status === 'received').length

  const recentBroadcasts = d.updates.filter((u) => u.status !== 'scheduled').sort((a, b) => (b.published_at || '').localeCompare(a.published_at || '')).slice(0, 3)

  return (
    <div className="page">
      <PageHeader title="Command Center" subtitle={d.disaster ? `${d.disaster.name} · ${d.disaster.affected_area}` : 'Loading…'}>
        <Link to="/comms/broadcasts" className="btn btn-primary">Send broadcast</Link>
      </PageHeader>

      <section className="kpis" aria-label="Key figures">
        <Kpi label="People sheltered" value={(total - free).toLocaleString()} sub={`${sheltersActive.length} active sites`} to="/map" />
        <Kpi label="Spaces free" value={free.toLocaleString()} sub={total ? `${Math.round(((total - free) / total) * 100)}% occupied` : '—'} meter={total ? (total - free) / total : 0} to="/map" />
        <Kpi label="Open help requests" value={help} tone={help ? 'alert' : ''} sub={`${d.reports.length} reports total`} to="/comms/reports" />
      </section>

      <section className="card-panel operational-alerts">
        <div className="panel-title">
          <h2>Operational alerts</h2>
          <Link to="/alerts" className="link-sm">View all <ArrowRight size={13} /></Link>
        </div>
        {d.errors.alerts ? <p className="muted">Alerts could not be loaded.</p> : !d.alerts ? <p className="muted">Loading alerts…</p> : d.alerts.total === 0 ? <p className="muted">No current operational alerts.</p> : (
          <>
            <p className="muted small">{d.alerts.total} current alerts · Showing the highest priority</p>
            <ul className="attention">
              {d.alerts.alerts.slice(0, 3).map((alert) => {
                const Icon = LEVEL_ICON[alert.severity] || Info
                return <li key={alert.id} className={`att att-${alert.severity}`}>
                  <Icon size={16} className="att-icon" aria-hidden="true" />
                  <div className="att-body"><div className="att-title">{alert.message}</div><span className="muted small">{cap(alert.severity)}</span></div>
                  <span className="muted small nowrap" title={fullTime(alert.updated_at)}>{timeAgo(alert.updated_at)}</span>
                </li>
              })}
            </ul>
          </>
        )}
      </section>

      <div className="operational-alerts">
        <section className="card-panel">
          <div className="panel-title"><h2>Activity</h2><span className="muted">live</span></div>
          <ol className="timeline">
            {d.activity.length === 0 && <Empty>No activity yet.</Empty>}
            {d.activity.slice(0, 18).map((a) => {
              const ref = a.ref
              const link = ref ? REF_LINK[ref.kind] : undefined
              return (
                <li key={a.id} className={`tl tl-${a.type.split('_')[0]}`}>
                  <span className="tl-dot" aria-hidden="true" />
                  <div>
                    {ref && link ? <Link to={link(ref.id)}>{a.summary}</Link> : a.summary}
                    <div className="muted small" title={fullTime(a.created_at)}>{timeAgo(a.created_at)} · {a.actor?.name || 'System'}</div>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      </div>

      <div className="cc-grid cc-grid-even">
        <section className="card-panel">
          <div className="panel-title">
            <h2>Recent broadcasts</h2>
            <Link to="/comms/broadcasts" className="link-sm">All broadcasts <ArrowRight size={13} /></Link>
          </div>
          {recentBroadcasts.length === 0 && <Empty>No broadcasts sent yet.</Empty>}
          <ul className="list">
            {recentBroadcasts.map((u) => (
              <li key={u.id} className="mini-broadcast">
                <div className="row-between">
                  <span><span className={`badge sev-${u.severity}`}>{cap(u.severity)}</span> <strong>{u.title}</strong></span>
                  <span className="muted small">{timeAgo(u.published_at)}</span>
                </div>
                <div className="reach">
                  {u.read_count != null && <div className="meter meter-sm"><span style={{ width: `${u.recipient_count ? (u.read_count / u.recipient_count) * 100 : 0}%` }} /></div>}
                  <span className="muted small">{u.read_count == null ? 'Read count unavailable' : `${u.read_count}/${u.recipient_count} read`}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

function Kpi({ label, value, sub, tone, meter, to }: { label: string; value: string | number; sub: string; tone?: string; meter?: number; to: string }) {
  return (
    <Link to={to} className={`kpi ${tone ? `kpi-${tone}` : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {meter !== undefined && <div className="meter" aria-hidden="true"><span style={{ width: `${Math.min(100, meter * 100)}%` }} /></div>}
      <div className="kpi-sub">{sub}</div>
    </Link>
  )
}
