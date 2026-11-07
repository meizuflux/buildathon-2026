import { Link } from 'react-router-dom'
import { useState } from 'react'
import { AlertTriangle, ArrowRight, Info, Siren } from 'lucide-react'
import { useData } from '../data.jsx'
import { PageHeader, Empty } from '../components/ui.jsx'
import { attentionItems, coverageByResource, isLate } from '../lib/logistics.js'
import { cap, fullTime, timeAgo } from '../lib/format.js'

const LEVEL_ICON = { critical: Siren, warning: AlertTriangle, info: Info }
const REF_LINK = {
  shelter: (id) => `/map?shelter=${id}`,
  organization: (id) => `/organizations/${id}`,
  need: (id) => `/logistics/needs?focus=${id}`,
  shipment: () => '/logistics/dispatch',
  update: () => '/comms/broadcasts',
  conversation: (id) => `/comms/messages/${id}`,
  report: (id) => `/map?report=${id}`,
  assistance: (id) => `/citizens?request=${id}`,
}

export default function CommandCenter() {
  const d = useData()
  const [showAllAlerts, setShowAllAlerts] = useState(false)
  const sheltersActive = d.shelters.filter((s) => s.status !== 'closed')
  const total = sheltersActive.reduce((n, s) => n + (s.capacity.total_people || 0), 0)
  const free = sheltersActive.reduce((n, s) => n + Math.max(0, s.capacity.available_people || 0), 0)
  const openNeeds = d.needs.filter((n) => n.status === 'open')
  const inTransit = d.shipments.filter((s) => s.status === 'in_transit')
  const late = d.shipments.filter(isLate).length
  const help = d.reports.filter((r) => r.type === 'need_help' && r.status === 'received').length

  const attention = attentionItems({ ...d, rt: d.rt })
  const coverage = coverageByResource(d).filter((r) => r.needed > 0).sort((a, b) => b.uncovered / (b.needed || 1) - a.uncovered / (a.needed || 1))
  const recentBroadcasts = d.updates.filter((u) => u.status !== 'scheduled').sort((a, b) => (b.published_at || '').localeCompare(a.published_at || '')).slice(0, 3)

  return (
    <div className="page">
      <PageHeader title="Command Center" subtitle={d.disaster ? `${d.disaster.name} · ${d.disaster.affected_area}` : 'Loading…'}>
        <Link to="/comms/broadcasts" className="btn btn-primary">Send broadcast</Link>
        <Link to="/logistics/needs" className="btn">Dispatch resources</Link>
      </PageHeader>

      <section className="kpis" aria-label="Key figures">
        <Kpi label="People sheltered" value={(total - free).toLocaleString()} sub={`${sheltersActive.length} active sites`} to="/map" />
        <Kpi label="Spaces free" value={free.toLocaleString()} sub={total ? `${Math.round(((total - free) / total) * 100)}% occupied` : '—'} meter={total ? (total - free) / total : 0} to="/map" />
        <Kpi label="Open help requests" value={help} tone={help ? 'alert' : ''} sub={`${d.reports.length} reports total`} to="/map?tab=reports" />
        <Kpi label="Open needs" value={openNeeds.length} tone={openNeeds.some((n) => n.priority === 'critical') ? 'alert' : ''}
          sub={`${openNeeds.filter((n) => n.priority === 'critical').length} critical`} to="/logistics/needs" />
        <Kpi label="Shipments in transit" value={inTransit.length} tone={late ? 'warn' : ''} sub={late ? `${late} running late` : 'all on time'} to="/logistics/dispatch" />
        <Kpi label="Unread messages" value="—" sub="Unavailable" to="/comms/messages" />
      </section>

      <section className="card-panel operational-alerts">
        <div className="panel-title">
          <h2>Operational alerts</h2>
          <span className="muted">{d.alerts ? `${d.alerts.total} current` : '—'}</span>
        </div>
        {d.errors.alerts ? <p className="muted">Alerts could not be loaded.</p> : !d.alerts ? <p className="muted">Loading alerts…</p> : (
          <>
            <ul className="attention">
              {d.alerts.alerts.length === 0 && <Empty>No current operational alerts.</Empty>}
              {d.alerts.alerts.slice(0, showAllAlerts ? undefined : 10).map((alert) => {
                const Icon = LEVEL_ICON[alert.severity] || Info
                return <li key={alert.id} className={`att att-${alert.severity}`}>
                  <Icon size={16} className="att-icon" aria-hidden="true" />
                  <div className="att-body"><div className="att-title">{alert.message}</div><span className="muted small">{cap(alert.severity)}{alert.family_id ? ` · Family ${alert.family_id}` : ''}</span></div>
                  <span className="muted small nowrap" title={fullTime(alert.updated_at)}>{timeAgo(alert.updated_at)}</span>
                  {alert.shelter_id && <Link className="btn btn-sm" to={`/map?shelter=${encodeURIComponent(alert.shelter_id)}`}>View shelter</Link>}
                </li>
              })}
            </ul>
            {d.alerts.alerts.length > 10 && <button className="btn btn-sm" onClick={() => setShowAllAlerts((v) => !v)}>{showAllAlerts ? 'Show fewer' : `Show all ${d.alerts.alerts.length} loaded alerts`}</button>}
            {d.alerts.total > d.alerts.alerts.length && <p className="muted small">Showing the first {d.alerts.alerts.length} of {d.alerts.total} alerts, ordered by severity and recency.</p>}
          </>
        )}
      </section>

      <div className="cc-grid">
        <section className="card-panel">
          <div className="panel-title">
            <h2>Needs attention</h2>
            <span className="muted">{attention.length} items</span>
          </div>
          <ul className="attention">
            {attention.length === 0 && <Empty>Nothing needs attention right now.</Empty>}
            {attention.slice(0, 14).map((a) => {
              const Icon = LEVEL_ICON[a.level]
              return (
                <li key={`${a.id}-${a.title}`} className={`att att-${a.level}`}>
                  <Icon size={16} className="att-icon" aria-hidden="true" />
                  <div className="att-body">
                    <div className="att-title">{a.title}</div>
                    <div className="att-detail muted">{a.detail}</div>
                  </div>
                  <span className="muted small nowrap">{timeAgo(a.at)}</span>
                  <Link to={a.to} className="btn btn-sm">{a.action}</Link>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="card-panel">
          <div className="panel-title"><h2>Activity</h2><span className="muted">live</span></div>
          <ol className="timeline">
            {d.activity.length === 0 && <Empty>No activity yet.</Empty>}
            {d.activity.slice(0, 18).map((a) => (
              <li key={a.id} className={`tl tl-${a.type.split('_')[0]}`}>
                <span className="tl-dot" aria-hidden="true" />
                <div>
                  {REF_LINK[a.ref?.kind] ? <Link to={REF_LINK[a.ref.kind](a.ref.id)}>{a.summary}</Link> : a.summary}
                  <div className="muted small" title={fullTime(a.created_at)}>{timeAgo(a.created_at)} · {a.actor?.name || 'System'}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="cc-grid cc-grid-even">
        <section className="card-panel">
          <div className="panel-title">
            <h2>Supply coverage</h2>
            <Link to="/logistics/inventory" className="link-sm">Inventory <ArrowRight size={13} /></Link>
          </div>
          {coverage.length === 0 && <Empty>No open resource needs.</Empty>}
          <div className="table-scroll"><table className="table compact">
            <thead><tr><th>Resource</th><th className="num">Still needed</th><th className="num">On the way</th><th className="num">Spare stock</th><th>Status</th></tr></thead>
            <tbody>
              {coverage.map((c) => {
                const r = d.rt(c.resource_type_id)
                const gap = c.uncovered - c.available
                return (
                  <tr key={c.resource_type_id}>
                    <td>{r.name}<div className="muted small">{c.needCount} open need{c.needCount === 1 ? '' : 's'}</div></td>
                    <td className="num">{c.needed} <span className="muted small">{r.unit}</span></td>
                    <td className="num">{c.inTransit}</td>
                    <td className="num">{c.available}</td>
                    <td>
                      {c.uncovered === 0 ? <span className="badge lvl-ok">Covered</span>
                        : gap > 0 ? <span className="badge lvl-full">Short {gap}</span>
                        : <span className="badge lvl-low">Needs dispatch</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        </section>

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

function Kpi({ label, value, sub, tone, meter, to }) {
  return (
    <Link to={to} className={`kpi ${tone ? `kpi-${tone}` : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {meter !== undefined && <div className="meter" aria-hidden="true"><span style={{ width: `${Math.min(100, meter * 100)}%` }} /></div>}
      <div className="kpi-sub">{sub}</div>
    </Link>
  )
}
