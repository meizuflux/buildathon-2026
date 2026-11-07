import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { MapContainer, TileLayer, Circle, CircleMarker } from 'react-leaflet'
import { ArrowLeft, Mail, MessagesSquare, PackagePlus, Pencil, Phone, Plus, Truck } from 'lucide-react'
import { useData } from '../data.jsx'
import { Empty, PriorityBadge, Progress, Segmented } from '../components/ui.jsx'
import OrgDialog from '../components/OrgDialog.jsx'
import ShipmentDialog from '../components/ShipmentDialog.jsx'
import NeedDialog from '../components/NeedDialog.jsx'
import PortalAccess from '../components/PortalAccess.jsx'
import { ORG_SERVICES, ORG_STATUSES, ORG_TYPES, SHIPMENT_LABEL } from '../lib/constants.js'
import { available, needProgress } from '../lib/logistics.js'
import { cap, timeAgo } from '../lib/format.js'

export default function OrganizationDetail() {
  const { id } = useParams()
  const d = useData()
  const navigate = useNavigate()
  const org = d.organizations.find((o) => o.id === id)
  const [dialog, setDialog] = useState(null)

  if (!org) return <div className="page"><Link to="/organizations" className="back"><ArrowLeft size={14} /> Organizations</Link><Empty>{d.loaded ? 'Organization not found.' : 'Loading…'}</Empty></div>

  const needs = d.needs.filter((n) => n.requester.id === org.id && n.status === 'open')
  const shipments = d.shipments.filter((s) => s.from.id === org.id || s.to.id === org.id).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  const conv = d.conversations.find((c) => c.participant.kind === 'organization' && c.participant.id === org.id)
  const setStatus = (status) => d.mutate((api) => api.updateOrganization(org.id, { status })).catch((e) => alert(e.message))

  return (
    <div className="page">
      <Link to="/organizations" className="back"><ArrowLeft size={14} /> Organizations</Link>
      <div className="page-head">
        <div>
          <h1>{org.name}</h1>
          <p className="muted">{ORG_TYPES[org.type]} · {org.address} · covers {org.coverage_radius_km} km · updated {timeAgo(org.updated_at)}</p>
          <div className="tags">{org.services.map((s) => <span key={s} className="tag">{ORG_SERVICES[s]}</span>)}</div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => navigate(conv ? `/comms/messages/${conv.id}` : `/comms/messages?to=organization:${org.id}`)}>
            <MessagesSquare size={15} /> {conv ? 'Open thread' : 'Message'}{conv?.unread_count ? ` (${conv.unread_count})` : ''}
          </button>
          <button className="btn" onClick={() => setDialog('need')}><PackagePlus size={15} /> Log need</button>
          <button className="btn btn-primary" onClick={() => setDialog('ship')}><Truck size={15} /> Dispatch from here</button>
          <button className="icon-btn" onClick={() => setDialog('edit')} aria-label="Edit organization"><Pencil size={16} /></button>
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-main">
          <InventoryEditor org={org} />

          <section className="card-panel">
            <div className="panel-title"><h2>Open needs</h2><span className="muted">{needs.length}</span></div>
            {needs.length === 0 ? <Empty>No open needs logged for this organization.</Empty> : (
              <ul className="list">
                {needs.map((n) => {
                  const p = needProgress(n, d.shipments)
                  const r = d.rt(n.resource_type_id)
                  return (
                    <li key={n.id} className="row-line">
                      <PriorityBadge priority={n.priority} />
                      <span className="grow"><strong>{n.quantity_needed} {r.unit}</strong> {r.name}</span>
                      <div className="w-160"><Progress total={n.quantity_needed} done={p.fulfilled} pending={p.inTransit} /></div>
                      <Link className="btn btn-sm" to={`/logistics/needs?focus=${n.id}`}>Open</Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="card-panel">
            <div className="panel-title"><h2>Shipments</h2><span className="muted">{shipments.length}</span></div>
            {shipments.length === 0 ? <Empty>No shipments yet.</Empty> : (
              <div className="table-scroll"><table className="table compact">
                <thead><tr><th>Direction</th><th>Counterparty</th><th>Items</th><th>Status</th><th>Updated</th></tr></thead>
                <tbody>
                  {shipments.map((s) => {
                    const out = s.from.id === org.id
                    const other = out ? s.to : s.from
                    return (
                      <tr key={s.id}>
                        <td><span className={`badge ${out ? 'dir-out' : 'dir-in'}`}>{out ? 'Outbound' : 'Inbound'}</span></td>
                        <td>{other.name}</td>
                        <td className="small">{s.items.map((i) => `${i.quantity} ${d.rt(i.resource_type_id).name}`).join(', ')}</td>
                        <td><span className={`badge ship-${s.status}`}>{SHIPMENT_LABEL[s.status]}</span></td>
                        <td className="muted small nowrap">{timeAgo(s.updated_at)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table></div>
            )}
          </section>
        </div>

        <aside className="detail-side">
          <section className="card-panel">
            <h2>Status</h2>
            <Segmented value={org.status} onChange={setStatus} label="Status" options={ORG_STATUSES.map((s) => [s, cap(s), `ost-on-${s}`])} />
            <h2 className="mt">Contact</h2>
            <div className="contact">
              <strong>{org.contact?.name || '—'}</strong>
              {org.contact?.phone && <a href={`tel:${org.contact.phone}`}><Phone size={13} /> {org.contact.phone}</a>}
              {org.contact?.email && <a href={`mailto:${org.contact.email}`}><Mail size={13} /> {org.contact.email}</a>}
            </div>
            {org.notes && <><h2 className="mt">Notes</h2><p className="small">{org.notes}</p></>}
          </section>
          <section className="card-panel">
            <h2>Citizen assistance</h2>
            <label className="check">
              <input type="checkbox" checked={!!org.citizen_assistance} onChange={(e) => d.mutate((api) => api.updateOrganization(org.id, { citizen_assistance: e.target.checked })).catch((err) => alert(err.message))} />
              Approved to help households directly
            </label>
            <p className="hint">When on, this organization sees consented citizen requests within {org.coverage_radius_km} km (approximate location only) and can accept them, which reveals the household's contact details. Every acceptance is logged.</p>
            {(() => {
              const mine = d.assistance.filter((a) => a.assigned_to?.id === org.id)
              return mine.length > 0 && <p className="small"><Link to="/citizens">{mine.filter((a) => ['claimed', 'en_route'].includes(a.status)).length} active · {mine.filter((a) => a.status === 'completed').length} completed</Link></p>
            })()}
          </section>
          <PortalAccess key={org.id} site={{ kind: 'organization', id: org.id }} defaultEmail={org.contact?.email || ''} defaultName={org.contact?.name || ''} />
          <section className="card-panel flush mini-map">
            <MapContainer center={[org.location.latitude, org.location.longitude]} zoom={11} className="map" scrollWheelZoom={false}>
              <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <Circle center={[org.location.latitude, org.location.longitude]} radius={org.coverage_radius_km * 1000} pathOptions={{ color: '#2563eb', weight: 1, fillOpacity: 0.06 }} />
              {d.shelters.map((s) => <CircleMarker key={s.id} center={[s.location.latitude, s.location.longitude]} radius={4} pathOptions={{ color: '#475569', weight: 1, fillOpacity: 0.6 }} />)}
              <CircleMarker center={[org.location.latitude, org.location.longitude]} radius={8} pathOptions={{ color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }} />
            </MapContainer>
          </section>
        </aside>
      </div>

      {dialog === 'edit' && <OrgDialog org={org} onClose={() => setDialog(null)} />}
      {dialog === 'ship' && <ShipmentDialog initial={{ from: { kind: 'organization', id: org.id } }} onClose={() => setDialog(null)} />}
      {dialog === 'need' && <NeedDialog initial={{ requester: { kind: 'organization', id: org.id } }} onClose={() => setDialog(null)} />}
    </div>
  )
}

function InventoryEditor({ org }) {
  const d = useData()
  const rows = useMemo(() => d.inventory.filter((r) => r.holder.id === org.id), [d.inventory, org.id])
  const [edits, setEdits] = useState({})
  const [adding, setAdding] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const dirty = Object.keys(edits).length > 0

  const value = (r) => edits[r.resource_type_id] ?? r.quantity
  const missing = d.resourceTypes.filter((r) => !rows.some((x) => x.resource_type_id === r.id) && !(r.id in edits))

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await d.mutate((api) => api.setInventory(org.id, Object.entries(edits).map(([resource_type_id, quantity]) => ({ resource_type_id, quantity: Number(quantity) || 0 }))))
      setEdits({})
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const newRows = Object.keys(edits).filter((k) => !rows.some((r) => r.resource_type_id === k))

  return (
    <section className="card-panel">
      <div className="panel-title">
        <h2>Inventory</h2>
        <div className="page-actions">
          {dirty && <button className="btn btn-sm" onClick={() => setEdits({})}>Discard</button>}
          <button className="btn btn-sm btn-primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : 'Save counts'}</button>
        </div>
      </div>
      {rows.length + newRows.length === 0 && <Empty>No stock recorded. Add items below.</Empty>}
      {rows.length + newRows.length > 0 && (
        <div className="table-scroll"><table className="table compact">
          <thead><tr><th>Resource</th><th className="num">On hand</th><th className="num">Reserved</th><th className="num">Free</th><th>Updated</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const rt = d.rt(r.resource_type_id)
              const changed = r.resource_type_id in edits
              return (
                <tr key={r.resource_type_id} className={changed ? 'changed' : ''}>
                  <td>{rt.name} <span className="muted small">({rt.unit})</span></td>
                  <td className="num">
                    <input className="qty" type="number" min={r.reserved} value={value(r)} aria-label={`${rt.name} on hand`}
                      onChange={(e) => setEdits((x) => ({ ...x, [r.resource_type_id]: e.target.value }))} />
                  </td>
                  <td className="num">{r.reserved || '—'}</td>
                  <td className="num"><strong>{changed ? Math.max(0, Number(value(r)) - r.reserved) : available(r)}</strong></td>
                  <td className="muted small nowrap">{timeAgo(r.updated_at)}</td>
                </tr>
              )
            })}
            {newRows.map((k) => (
              <tr key={k} className="changed">
                <td>{d.rt(k).name} <span className="muted small">(new)</span></td>
                <td className="num"><input className="qty" type="number" min="0" value={edits[k]} onChange={(e) => setEdits((x) => ({ ...x, [k]: e.target.value }))} /></td>
                <td className="num">—</td><td className="num">{edits[k] || 0}</td><td />
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      <div className="add-item">
        <select value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Add resource">
          <option value="">Add a resource…</option>
          {missing.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <button className="btn btn-sm" disabled={!adding} onClick={() => { setEdits((x) => ({ ...x, [adding]: 0 })); setAdding('') }}><Plus size={14} /> Add</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  )
}
