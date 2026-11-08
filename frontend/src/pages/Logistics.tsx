import { useMemo } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { ArrowRight, Boxes, CircleHelp, ClipboardList, Plus, Truck, type LucideIcon } from 'lucide-react'
import { useData } from '../data'
import { buildLogisticsPreview, type LogisticsPriority } from '../lib/logisticsPreview'
import { Empty, Head } from '../components/ui'

export type LogisticsSection = 'needs' | 'dispatch' | 'inventory'

const SECTIONS: Record<LogisticsSection, { title: string; sub: string; icon: LucideIcon; action: string }> = {
  needs: { title: 'Needs', sub: 'Requests for supplies and support across the response.', icon: ClipboardList, action: 'Add need' },
  dispatch: { title: 'Dispatch', sub: 'How deliveries could move from request to arrival.', icon: Truck, action: 'Create dispatch' },
  inventory: { title: 'Inventory', sub: 'Supplies and quantities at local staging sites.', icon: Boxes, action: 'Add inventory' },
}
const SECTION_KEYS = Object.keys(SECTIONS) as LogisticsSection[]
const AVAIL_TONE: Record<string, string> = { available: 't-green', limited: 't-amber', unavailable: 't-red', unknown: 't-muted' }
const PRIORITY_TONE: Record<LogisticsPriority, string> = { Urgent: 't-red', High: 't-amber', Routine: 't-muted' }

export default function Logistics({ section = 'needs' }: { section?: LogisticsSection }) {
  const d = useData()
  const config = SECTIONS[section]
  const preview = useMemo(
    () => (!d.loaded || !d.disasterId || d.errors.shelters ? null : buildLogisticsPreview(d.shelters)),
    [d.loaded, d.disasterId, d.errors.shelters, d.shelters],
  )

  return (
    <div className="hx-page">
      <Head title={config.title} sub={config.sub}>
        <span className="badge t-amber">Work in progress</span>
        <button className="btn btn-primary" disabled><Plus size={14} /> {config.action}</button>
      </Head>
      <div className="hx-preview-note">
        <CircleHelp size={18} />
        <div><strong>Preview only.</strong> Shelter details are live. Requests, quantities and delivery steps are examples, and actions are not available yet.</div>
      </div>
      <nav className="hx-tabs" aria-label="Logistics sections">
        {SECTION_KEYS.map((key) => {
          const Icon = SECTIONS[key].icon
          return <NavLink key={key} to={`/logistics/${key}`} className={({ isActive }) => (isActive ? 'active' : '')}><Icon size={15} />{SECTIONS[key].title}</NavLink>
        })}
      </nav>

      {d.errors.shelters ? <p className="notice notice-error">Shelter details could not be loaded. Try refreshing.</p>
        : !preview ? <Empty>Loading shelter details…</Empty>
          : preview.shelterCount === 0 ? <Empty>No active shelters yet.</Empty>
            : <>
              <div className="hx-stats">
                <div className="hx-panel hx-stat"><b>{preview.shelterCount}</b><span>Live shelters</span></div>
                <div className="hx-panel hx-stat"><b>{preview.occupiedPeople.toLocaleString()}</b><span>Reserved spaces</span></div>
                <div className="hx-panel hx-stat"><b>{preview.needs.length}</b><span>Example requests</span></div>
                <div className="hx-panel hx-stat"><b>{preview.needs.filter((n) => n.priority === 'Urgent').length}</b><span>Urgent examples</span></div>
              </div>

              {section === 'needs' && (
                <section className="hx-panel"><div className="hx-table-wrap"><table className="hx-table">
                  <thead><tr><th>Request</th><th>Shelter</th><th>Priority</th><th>Status</th><th>Supply level</th></tr></thead>
                  <tbody>{preview.needs.map((n) => (
                    <tr key={n.id}>
                      <td><span className="strong">{n.request}</span><span className="sub">{n.reference}, {n.quantity}, example</span></td>
                      <td><Link to={`/map?shelter=${encodeURIComponent(n.shelterId)}`}>{n.site}</Link></td>
                      <td><span className={`badge ${PRIORITY_TONE[n.priority]}`}>{n.priority}</span></td>
                      <td className="muted">{n.status}</td>
                      <td><span className={`badge ${AVAIL_TONE[n.availability] || 't-muted'}`}>{n.availability}</span></td>
                    </tr>
                  ))}</tbody>
                </table></div></section>
              )}

              {section === 'dispatch' && (
                <div className="hx-board">
                  {preview.dispatchGroups.map((g) => (
                    <section key={g.key} className="hx-col">
                      <header><span>{g.label}</span><span className="badge t-muted">{g.rows.length}</span></header>
                      {g.rows.length === 0 && <span className="small muted">Nothing here</span>}
                      {g.rows.map((r) => (
                        <article key={r.id} className="hx-delivery">
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span className="mono">{r.id}</span><span className="badge t-muted">Example</span></div>
                          <strong>{r.item}</strong>
                          <div className="route"><span>{r.from}</span><ArrowRight size={12} /><span>{r.to}</span></div>
                          <span className="small muted">{r.eta}</span>
                        </article>
                      ))}
                    </section>
                  ))}
                </div>
              )}

              {section === 'inventory' && (
                <section className="hx-panel"><div className="hx-table-wrap"><table className="hx-table">
                  <thead><tr><th>Supply</th><th>Shelter</th><th>Availability</th><th className="num">Quantity</th><th className="num">Reserved</th><th>Updated</th></tr></thead>
                  <tbody>{preview.stock.map((s) => (
                    <tr key={s.id}>
                      <td><span className="strong">{s.item}</span><span className="sub">{s.category}</span></td>
                      <td>{s.location}</td>
                      <td><span className={`badge ${AVAIL_TONE[s.availability] || 't-muted'}`}>{s.availability}</span></td>
                      <td className="num muted">{s.quantity}</td>
                      <td className="num muted">{s.held}</td>
                      <td className="small muted">{s.updated}</td>
                    </tr>
                  ))}</tbody>
                </table></div></section>
              )}
            </>}
    </div>
  )
}
