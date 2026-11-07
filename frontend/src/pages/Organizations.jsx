import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useData } from '../data.jsx'
import { Empty, PageHeader } from '../components/ui.jsx'
import OrgDialog from '../components/OrgDialog.jsx'
import { ORG_SERVICES, ORG_TYPES } from '../lib/constants.js'
import { ACTIVE_SHIPMENT, available } from '../lib/logistics.js'
import { cap, timeAgo } from '../lib/format.js'

export default function Organizations() {
  const d = useData()
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const [service, setService] = useState('all')
  const [adding, setAdding] = useState(false)

  const list = d.organizations
    .filter((o) => type === 'all' || o.type === type)
    .filter((o) => service === 'all' || o.services.includes(service))
    .filter((o) => !query || `${o.name} ${o.address} ${o.contact?.name}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="page">
      <PageHeader title="Organizations" subtitle="Relief organizations, depots, suppliers and volunteer groups working this disaster.">
        <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={15} /> Add organization</button>
      </PageHeader>

      <div className="toolbar">
        <input type="search" placeholder="Search name, address or contact" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search organizations" />
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
          <option value="all">All types</option>
          {Object.entries(ORG_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={service} onChange={(e) => setService(e.target.value)} aria-label="Service">
          <option value="all">All services</option>
          {Object.entries(ORG_SERVICES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="card-panel flush table-scroll">
        <table className="table">
          <thead>
            <tr><th>Organization</th><th>Services</th><th>Status</th><th>Contact</th><th className="num">Stock</th><th className="num">Open needs</th><th className="num">Active shipments</th><th>Updated</th></tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={8}><Empty>No organizations match.</Empty></td></tr>}
            {list.map((o) => {
              const stock = d.inventory.filter((r) => r.holder.id === o.id)
              const units = stock.reduce((n, r) => n + available(r), 0)
              const needs = d.needs.filter((n) => n.status === 'open' && n.requester.id === o.id).length
              const ships = d.shipments.filter((s) => ACTIVE_SHIPMENT.includes(s.status) && (s.from.id === o.id || s.to.id === o.id)).length
              return (
                <tr key={o.id} className="click-row">
                  <td>
                    <Link to={`/organizations/${o.id}`} className="strong-link">{o.name}</Link>
                    <div className="muted small">{ORG_TYPES[o.type]} · {o.address}</div>
                  </td>
                  <td><div className="tags">{o.services.map((s) => <span key={s} className="tag">{ORG_SERVICES[s]}</span>)}</div></td>
                  <td><span className={`badge ost-${o.status}`}>{cap(o.status)}</span></td>
                  <td className="small">{o.contact?.name}<div className="muted">{o.contact?.phone}</div></td>
                  <td className="num">{stock.length ? <>{units.toLocaleString()}<div className="muted small">{stock.length} items</div></> : <span className="muted">—</span>}</td>
                  <td className="num">{needs || <span className="muted">—</span>}</td>
                  <td className="num">{ships || <span className="muted">—</span>}</td>
                  <td className="muted small nowrap">{timeAgo(o.updated_at)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {adding && <OrgDialog onClose={() => setAdding(false)} />}
    </div>
  )
}
