import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import {
  Bell, ChevronDown, CloudLightning, FileText, LayoutDashboard, LogOut, Map, Megaphone, PackageSearch, RefreshCw, RotateCcw, Route, Send, Truck, Users, Warehouse,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../auth'
import { useData } from '../data'
import { DISASTER_TYPES } from '../lib/constants'
import { cap, timeAgo } from '../lib/format'
import { isOpenHelp } from '../lib/ops'
import { InitiateHurricaneDialog, ResetHurricaneDialog, useHurricanePhase } from './HurricaneDialogs'

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean; count?: number; preview?: boolean }
type NavGroup = { group?: string; items: NavItem[] }

export default function Layout() {
  const { user, logout } = useAuth()
  const d = useData()
  const phase = useHurricanePhase()
  const [dialog, setDialog] = useState<'initiate' | 'reset' | null>(null)
  const hurricane = d.hurricane?.hurricane
  const helpOpen = d.reports.filter(isOpenHelp).length
  const nav: NavGroup[] = [
    { items: [
      { to: '/', label: 'Command center', icon: LayoutDashboard, end: true },
      { to: '/evacuation-preview', label: 'Evacuation preview', icon: Route },
      { to: '/alerts', label: 'Alerts', icon: Bell, count: phase === 'active' ? d.alerts?.total : 0 },
      { to: '/map', label: 'Operations map', icon: Map },
      { to: '/families', label: 'Families', icon: Users },
    ] },
    { group: 'Communications', items: [
      { to: '/comms/broadcasts', label: 'Broadcasts', icon: Megaphone },
      { to: '/comms/reports', label: 'Family reports', icon: FileText, count: helpOpen },
    ] },
    { group: 'Logistics', items: [
      { to: '/logistics/needs', label: 'Needs', icon: PackageSearch, preview: true },
      { to: '/logistics/dispatch', label: 'Dispatch', icon: Truck, preview: true },
      { to: '/logistics/inventory', label: 'Inventory', icon: Warehouse, preview: true },
    ] },
  ]
  const errs = Object.entries(d.errors).filter(([, v]) => v)
  const role = user?.role ?? 'operator'

  return (
    <div className="hx">
      <aside className="hx-rail">
        <Link to="/" className="hx-brand" style={{ color: 'inherit' }}>
          <img src="/haven-mark.svg" alt="" />
          <div><b>Haven</b><span>Operations</span></div>
        </Link>
        <nav className="hx-nav" aria-label="Main">
          {nav.map((g, i) => (
            <div key={i} style={{ display: 'contents' }}>
              {g.group && <div className="hx-nav-group">{g.group}</div>}
              {g.items.map(({ to, label, icon: Icon, end, count = 0, preview }) => (
                <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
                  <Icon size={17} aria-hidden="true" />
                  <span className="label">{label}</span>
                  {preview && <span className="preview">Preview</span>}
                  {count > 0 && <span className="count" aria-label={`${count} open`}>{count}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="hx-rail-foot">
          <div className="who">
            <span className="avatar" aria-hidden="true">{role.slice(0, 2).toUpperCase()}</span>
            <div><b>{cap(role)}</b>Signed in</div>
          </div>
          <button className="btn btn-sm btn-block" onClick={logout}><LogOut size={13} /> Sign out</button>
        </div>
      </aside>

      <div className="hx-main">
        <header className="hx-top">
          <div className="hx-incident">
            <label htmlFor="hx-disaster" className="sr-only">Hurricane</label>
            <select id="hx-disaster" value={d.disasterId || ''} onChange={(e) => d.setDisasterId(e.target.value)}>
              {d.disasters.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <ChevronDown size={16} />
          </div>
          {d.disaster && d.disaster.type !== 'hurricane' && <span className="badge t-muted">{DISASTER_TYPES[d.disaster.type] || d.disaster.type}</span>}
          {phase === 'peace' && <span className="hx-status is-peace"><i aria-hidden="true" />All clear<span className="sub"> · No active hurricane</span></span>}
          {phase === 'active' && (
            <span className="hx-status is-active" role="status">
              <i aria-hidden="true" />
              {hurricane ? `${hurricane.name} · Cat ${hurricane.category}` : 'Hurricane'} · Evacuation active
            </span>
          )}
          <span className="spacer" />
          <button className="hx-sync" onClick={() => d.refresh()} title="Refresh now"><RefreshCw size={13} /> Synced {d.lastSync ? timeAgo(d.lastSync) : '…'}</button>
          {phase === 'peace' && <button className="btn btn-danger" onClick={() => setDialog('initiate')}><CloudLightning size={14} /> Initiate hurricane</button>}
          {phase === 'active' && <button className="btn" onClick={() => setDialog('reset')}><RotateCcw size={14} /> Reset to peace</button>}
          <Link className="btn btn-primary" to="/comms/broadcasts"><Send size={14} /> Send broadcast</Link>
        </header>
        {errs.length > 0 ? (
          <div className="hx-errors" role="alert">{errs.map(([k, v]) => <div key={k}><strong>{k}:</strong> {v}</div>)}</div>
        ) : <div />}
        <main className="hx-content"><Outlet /></main>
      </div>
      {dialog === 'initiate' && <InitiateHurricaneDialog onClose={() => setDialog(null)} />}
      {dialog === 'reset' && <ResetHurricaneDialog onClose={() => setDialog(null)} />}
    </div>
  )
}
