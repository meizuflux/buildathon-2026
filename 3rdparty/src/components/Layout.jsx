import { NavLink, Outlet } from 'react-router-dom'
import { Bell, Building2, HeartHandshake, ClipboardList, HandHeart, Home, LayoutDashboard, LogOut, MessagesSquare, Truck, UserCog, Warehouse } from 'lucide-react'
import { useAuth } from '../auth.jsx'
import { useData } from '../data.jsx'
import { cap, isLate, timeAgo } from '../lib/format.js'

export default function Layout() {
  const { user, logout } = useAuth()
  const d = useData()
  const unread = d.conversations.reduce((n, c) => n + (c.unread_count || 0), 0)
  const toAct = d.inbound.filter((s) => s.status === 'in_transit').length + d.outbound.filter((s) => s.status === 'approved').length
  const critical = d.updates.filter((u) => u.severity === 'critical').length

  const nav = [
    { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
    d.isOrg
      ? { to: '/inventory', label: 'Inventory', icon: Warehouse }
      : { to: '/status', label: 'Status & capacity', icon: Home },
    { to: '/shipments', label: 'Shipments', icon: Truck, badge: toAct, tone: 'warn' },
    { to: '/requests', label: 'Requests', icon: ClipboardList },
    d.citizenApproved && { to: '/citizens', label: 'Citizens', icon: HeartHandshake, badge: d.myCitizens.filter((a) => ['claimed', 'en_route'].includes(a.status)).length || d.nearbyCitizens.filter((a) => a.priority === 'critical').length, tone: 'alert' },
    d.isOrg && { to: '/help', label: 'Help nearby', icon: HandHeart },
    { to: '/messages', label: 'Messages', icon: MessagesSquare, badge: unread, tone: 'info' },
    { to: '/updates', label: 'Official updates', icon: Bell, badge: critical, tone: 'alert' },
    { to: '/account', label: d.isOrg ? 'Profile' : 'Account', icon: UserCog },
  ].filter(Boolean)

  const status = d.me?.status
  return (
    <div className="portal">
      <header className="ph">
        <div className="ph-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true" />
            <span>Haven <span className="brand-sub">Partner</span></span>
          </div>
          <div className="ph-site">
            {d.isOrg ? <Building2 size={16} aria-hidden="true" /> : <Home size={16} aria-hidden="true" />}
            <strong>{user.site.name}</strong>
            {status && <span className={`badge st-${status}`}>{cap(status)}</span>}
          </div>
          <div className="ph-right">
            <span className="sync" title={d.lastSync ? `Last synced ${timeAgo(d.lastSync)}` : 'Connecting…'}>
              <span className={`sync-dot ${d.error ? 'bad' : ''}`} aria-hidden="true" />
              {d.disaster ? d.disaster.name : 'Connecting…'}
            </span>
            <span className="muted small hide-sm">{user.email}</span>
            <button className="icon-btn on-dark" onClick={logout} aria-label="Sign out" title="Sign out"><LogOut size={17} /></button>
          </div>
        </div>
        <nav className="pnav" aria-label="Portal">
          <div className="pnav-inner">
            {nav.map(({ to, label, icon: Icon, end, badge, tone }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => `pnav-item ${isActive ? 'active' : ''}`}>
                <Icon size={16} aria-hidden="true" />
                <span>{label}</span>
                {badge > 0 && <span className={`nav-badge tone-${tone}`}>{badge}</span>}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>
      {d.error && <div className="error-bar" role="alert">{d.error}</div>}
      {d.inbound.some(isLate) && <div className="warn-bar">A delivery to you is running late. The operations center has been notified.</div>}
      <main className="pcontent">
        <Outlet />
      </main>
    </div>
  )
}
