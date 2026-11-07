import { NavLink, Outlet } from 'react-router-dom'
import { Bell, Building2, KeyRound, LayoutDashboard, Map, Megaphone, PackageSearch, RefreshCw, Truck, Users, Warehouse } from 'lucide-react'
import { useAuth } from '../auth.jsx'
import { useData } from '../data.jsx'
import { DISASTER_TYPES } from '../lib/constants.js'
import { timeAgo } from '../lib/format.js'
import { isLate, needProgress } from '../lib/logistics.js'

export default function Layout() {
  const { user, logout } = useAuth()
  const d = useData()

  const criticalNeeds = d.needs.filter((n) => n.status === 'open' && n.priority === 'critical' && needProgress(n, d.shipments).uncovered > 0).length
  const late = d.shipments.filter(isLate).length
  const pendingApproval = d.shipments.filter((s) => s.status === 'requested').length
  const helpOpen = d.reports.filter((r) => r.type === 'need_help' && r.status === 'received').length

  const nav = [
    { section: null, items: [
      { to: '/', label: 'Command Center', icon: LayoutDashboard, end: true },
      { to: '/alerts', label: 'Alerts', icon: Bell, badge: d.alerts?.total, tone: 'alert' },
      { to: '/map', label: 'Operations Map', icon: Map, badge: helpOpen, tone: 'alert' },
      { to: '/families', label: 'Families', icon: Users },
    ] },
    { section: 'Communications', items: [
      { to: '/comms/broadcasts', label: 'Broadcasts', icon: Megaphone },
    ] },
    { section: 'Logistics', items: [
      { to: '/logistics/needs', label: 'Needs', icon: PackageSearch, badge: criticalNeeds, tone: 'alert' },
      { to: '/logistics/dispatch', label: 'Dispatch', icon: Truck, badge: late + pendingApproval, tone: 'warn' },
      { to: '/logistics/inventory', label: 'Inventory', icon: Warehouse },
    ] },
    { section: 'Network', items: [
      { to: '/organizations', label: 'Organizations', icon: Building2 },
      { to: '/partners', label: 'Portal access', icon: KeyRound },
    ] },
  ]

  const errs = Object.entries(d.errors).filter(([, v]) => v)

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span>Haven <span className="brand-sub">Operations</span></span>
        </div>
        <nav aria-label="Main">
          {nav.map((g, i) => (
            <div key={i} className="nav-group">
              {g.section && <div className="nav-section">{g.section}</div>}
              {g.items.map(({ to, label, icon: Icon, end, badge, tone }) => (
                <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <Icon size={17} aria-hidden="true" />
                  <span>{label}</span>
                  {badge > 0 && <span className={`nav-badge tone-${tone}`}>{badge}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="muted small">Signed in as <strong className="cap">{user.role}</strong></div>
          <button className="btn btn-sm btn-block" onClick={logout}>Sign out</button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="disaster-pick">
            <label htmlFor="disaster" className="sr-only">Disaster</label>
            <select id="disaster" value={d.disasterId || ''} onChange={(e) => d.setDisasterId(e.target.value)}>
              {d.disasters.map((x) => <option key={x.id} value={x.id}>{x.name} — {x.affected_area}</option>)}
            </select>
            {d.disaster && <span className="badge dtype">{DISASTER_TYPES[d.disaster.type] || d.disaster.type}</span>}
            {d.disaster?.status === 'active' && <span className="live-dot" title="Active incident">Active</span>}
          </div>
          <div className="topbar-right">
            <button className="sync" onClick={d.refresh} title="Refresh now">
              <RefreshCw size={13} aria-hidden="true" /> Synced {d.lastSync ? timeAgo(d.lastSync) : '…'}
            </button>
          </div>
        </header>

        {errs.length > 0 && (
          <div className="error-bar" role="alert">
            {errs.map(([k, v]) => <div key={k}><strong>{k}:</strong> {v}</div>)}
          </div>
        )}

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
