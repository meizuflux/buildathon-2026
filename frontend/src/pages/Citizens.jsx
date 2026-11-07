import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MapContainer, TileLayer, CircleMarker, Marker, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ArrowLeft, Baby, Car, EyeOff, HeartPulse, MessagesSquare, PawPrint, Phone, ShieldCheck, Users, Accessibility } from 'lucide-react'
import { useData } from '../data.jsx'
import { Empty, PriorityBadge } from '../components/ui.jsx'
import { ASSIST_COLOR, ASSIST_KINDS, ASSIST_STATUS, DEFAULT_CENTER, PRIORITIES, PRIORITY_RANK } from '../lib/constants.js'
import { available, km } from '../lib/logistics.js'
import { cap, fullTime, timeAgo } from '../lib/format.js'

const orgIcon = L.divIcon({ className: '', html: '<span class="org-pin org-nonprofit">■</span>', iconSize: [18, 18], iconAnchor: [9, 9] })

function Fly({ to }) {
  const map = useMap()
  useEffect(() => { if (to) map.flyTo(to, Math.max(map.getZoom(), 14), { duration: 0.5 }) }, [to, map])
  return null
}

export default function Citizens() {
  const d = useData()
  const [params, setParams] = useSearchParams()
  const [selected, setSelected] = useState(params.get('request'))
  const [status, setStatus] = useState('active')
  const [kind, setKind] = useState('all')
  const [query, setQuery] = useState('')
  const [focus, setFocus] = useState(null)

  useEffect(() => { if (params.get('request')) setParams({}, { replace: true }) }, [params, setParams])

  const list = useMemo(() => d.assistance
    .filter((a) => status === 'all' || (status === 'active' ? ['open', 'claimed', 'en_route'].includes(a.status) : status === 'unassigned' ? a.status === 'open' : a.status === status))
    .filter((a) => kind === 'all' || a.kind === kind)
    .filter((a) => !query || `${a.contact.name} ${a.address} ${a.message} ${a.family_id}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.created_at.localeCompare(b.created_at)),
  [d.assistance, status, kind, query])

  const open = d.assistance.filter((a) => a.status === 'open')
  const active = d.assistance.filter((a) => ['claimed', 'en_route'].includes(a.status))
  const current = d.assistance.find((a) => a.id === selected)
  const select = (a) => { setSelected(a.id); setFocus([a.location.latitude, a.location.longitude]) }

  return (
    <div className="citizen-page">
      <div className="citizen-top">
        <div>
          <h1>Citizen requests</h1>
          <p className="muted">Households who can't reach an aid location. Approved partner organizations see consented requests near them — location approximate and contact details hidden until they accept.</p>
        </div>
        <div className="summary-strip">
          <div className="tone-alert"><strong>{open.filter((a) => a.priority === 'critical').length}</strong> critical unassigned</div>
          <div><strong>{open.length}</strong> unassigned</div>
          <div><strong>{active.length}</strong> in progress</div>
          <div><strong>{d.assistance.filter((a) => a.status === 'completed').length}</strong> completed</div>
          <div><strong>{d.assistance.filter((a) => !a.consent_to_share && ['open', 'claimed', 'en_route'].includes(a.status)).length}</strong> government-only</div>
        </div>
      </div>

      <div className="citizen-work">
        <div className="map-wrap">
          <MapContainer center={DEFAULT_CENTER} zoom={12} className="map" scrollWheelZoom>
            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Fly to={focus} />
            {d.organizations.filter((o) => o.citizen_assistance).map((o) => (
              <Marker key={o.id} position={[o.location.latitude, o.location.longitude]} icon={orgIcon}><Tooltip>{o.name}</Tooltip></Marker>
            ))}
            {list.map((a) => (
              <CircleMarker key={a.id} center={[a.location.latitude, a.location.longitude]} radius={a.priority === 'critical' ? 9 : 7}
                pathOptions={{ color: a.id === selected ? '#111827' : '#fff', weight: a.id === selected ? 3 : 2, fillColor: ASSIST_COLOR[a.status], fillOpacity: 0.9 }}
                eventHandlers={{ click: () => select(a) }}>
                <Tooltip>{ASSIST_KINDS[a.kind]} · {a.household.adults + a.household.children} people · {ASSIST_STATUS[a.status]}</Tooltip>
              </CircleMarker>
            ))}
          </MapContainer>
          <div className="legend">
            {Object.entries(ASSIST_STATUS).map(([k, v]) => <span key={k}><i style={{ background: ASSIST_COLOR[k] }} />{v}</span>)}
            <span><span className="org-pin org-nonprofit legend-pin">■</span>Approved org</span>
          </div>
        </div>

        <aside className="side">
          {current ? <RequestDetail a={current} onBack={() => setSelected(null)} /> : (
            <div className="panel-body">
              <div className="panel-toolbar">
                <input className="search" type="search" placeholder="Search name, address, message" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search requests" />
              </div>
              <div className="panel-toolbar">
                <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
                  <option value="active">Active</option><option value="unassigned">Unassigned</option><option value="claimed">Accepted</option>
                  <option value="en_route">En route</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="all">All</option>
                </select>
                <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type">
                  <option value="all">All types</option>
                  {Object.entries(ASSIST_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <ul className="list">
                {list.length === 0 && <li className="empty">No requests match.</li>}
                {list.map((a) => (
                  <li key={a.id}>
                    <button className={`card citizen-card st-edge-${a.status}`} onClick={() => select(a)}>
                      <div className="card-head">
                        <PriorityBadge priority={a.priority} />
                        <span className="card-title">{ASSIST_KINDS[a.kind]}</span>
                        <span className={`badge ast-${a.status}`}>{ASSIST_STATUS[a.status]}</span>
                      </div>
                      <div className="card-sub">{a.contact.name} · {a.address}</div>
                      <p className="citizen-msg">{a.message}</p>
                      <HouseholdChips h={a.household} />
                      <div className="row-between muted small">
                        <span>{timeAgo(a.created_at)}</span>
                        <span>{a.assigned_to ? a.assigned_to.name : !a.consent_to_share ? <><EyeOff size={11} /> Government only</> : 'Unassigned'}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

export function HouseholdChips({ h }) {
  const people = (h.adults ?? 0) + (h.children ?? 0) || h.people
  return (
    <div className="chips hh-chips">
      <span className="tag"><Users size={11} /> {people} {people === 1 ? 'person' : 'people'}</span>
      {h.children > 0 && <span className="tag"><Baby size={11} /> {h.children} child{h.children > 1 ? 'ren' : ''}</span>}
      {(h.immediate_medication) && <span className="tag tag-alert"><HeartPulse size={11} /> Medication</span>}
      {(h.accessibility_notes || h.accessibility) && <span className="tag tag-warn"><Accessibility size={11} /> Accessibility</span>}
      {h.pets && <span className="tag"><PawPrint size={11} /> Pets</span>}
      {!h.has_car && <span className="tag"><Car size={11} /> No car</span>}
    </div>
  )
}

function RequestDetail({ a, onBack }) {
  const d = useData()
  const [notes, setNotes] = useState(a.operator_notes || '')
  const [busy, setBusy] = useState(false)
  const patch = async (body) => {
    setBusy(true)
    await d.mutate((api) => api.updateAssistanceRequest(a.id, body)).catch((e) => alert(e.message))
    setBusy(false)
  }
  const candidates = d.organizations
    .filter((o) => o.citizen_assistance && o.status !== 'inactive')
    .map((o) => {
      const dist = km(o.location, a.location)
      const has = a.items.every((it) => d.inventory.some((r) => r.holder.id === o.id && r.resource_type_id === it.resource_type_id && available(r) >= it.quantity))
      return { o, dist, has, inRange: dist <= (o.coverage_radius_km || 15) }
    })
    .sort((x, y) => (y.has && a.items.length ? 1 : 0) - (x.has && a.items.length ? 1 : 0) || (x.dist ?? 99) - (y.dist ?? 99))
  const h = a.household

  return (
    <div className="panel-body citizen-detail">
      <button className="btn btn-ghost btn-sm back-btn" onClick={onBack}><ArrowLeft size={14} /> All requests</button>
      <div className="card-head">
        <PriorityBadge priority={a.priority} />
        <h2 className="grow">{ASSIST_KINDS[a.kind]}</h2>
        <span className={`badge ast-${a.status}`}>{ASSIST_STATUS[a.status]}</span>
      </div>
      <p className="muted small">{a.id} · {a.family_id} · requested {timeAgo(a.created_at)}{a.source_report_id && ` · from report ${a.source_report_id}`}</p>
      <blockquote className="citizen-quote">{a.message}</blockquote>

      {a.items.length > 0 && (
        <>
          <h3>Requested items</h3>
          <ul className="plain">{a.items.map((i) => <li key={i.resource_type_id}><strong>{i.quantity}</strong> {d.rt(i.resource_type_id).unit} · {d.rt(i.resource_type_id).name}</li>)}</ul>
        </>
      )}

      <h3>Household</h3>
      <div className="hh-grid">
        <div><span>Contact</span><strong>{a.contact.name}</strong><a href={`tel:${a.contact.phone}`}><Phone size={12} /> {a.contact.phone}</a></div>
        <div><span>Address</span><strong>{a.address}</strong><span className="muted small">{a.location.latitude.toFixed(4)}, {a.location.longitude.toFixed(4)}</span></div>
        <div><span>People</span><strong>{h.adults} adult{h.adults === 1 ? '' : 's'}, {h.children} child{h.children === 1 ? '' : 'ren'}</strong><span className="muted small">{h.pets ? 'Has pets' : 'No pets'} · {h.has_car ? 'Has a car' : 'No car'}</span></div>
        {h.medical_notes && <div className="hh-alert"><span>Medical</span><strong>{h.medical_notes}</strong></div>}
        {h.accessibility_notes && <div className="hh-warn"><span>Accessibility</span><strong>{h.accessibility_notes}</strong></div>}
      </div>
      <p className={`consent ${a.consent_to_share ? 'yes' : 'no'}`}>
        {a.consent_to_share ? <><ShieldCheck size={14} /> Household consented to sharing with approved aid organizations.</> : <><EyeOff size={14} /> No consent to share — only government can see or act on this request.</>}
      </p>

      <h3>Assignment</h3>
      {a.assigned_to ? (
        <div className="assigned">
          <div><strong><Link to={`/organizations/${a.assigned_to.id}`}>{a.assigned_to.name}</Link></strong>{a.eta && a.status !== 'completed' && <span className="muted small"> · ETA {new Date(a.eta).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}</div>
          {a.partner_note && <div className="small">Told the household: “{a.partner_note}”</div>}
          {a.resolution_note && <div className="small">Outcome: {a.resolution_note}</div>}
          {['claimed', 'en_route'].includes(a.status) && <button className="btn btn-sm" disabled={busy} onClick={() => confirm('Unassign this organization? The request goes back to the open queue.') && patch({ assigned_to: null })}>Unassign</button>}
        </div>
      ) : a.consent_to_share && a.status === 'open' ? (
        <table className="table compact">
          <tbody>
            {candidates.slice(0, 5).map(({ o, dist, has, inRange }) => (
              <tr key={o.id}>
                <td>{o.name}<div className="muted small">{dist.toFixed(1)} km{!inRange && ' · outside their coverage'}{a.items.length > 0 && (has ? ' · has the items' : ' · missing items')}</div></td>
                <td className="num"><button className="btn btn-sm" disabled={busy} onClick={() => patch({ assigned_to: { kind: 'organization', id: o.id } })}>Assign</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="muted small">{a.status === 'open' ? 'Handle directly: message the household or dispatch a government team.' : 'No organization assigned.'}</p>}

      <h3>Manage</h3>
      <div className="manage">
        <select value={a.priority} onChange={(e) => patch({ priority: e.target.value })} aria-label="Priority">{PRIORITIES.map((p) => <option key={p} value={p}>{cap(p)}</option>)}</select>
        {a.status !== 'completed' && <button className="btn btn-sm" disabled={busy} onClick={() => patch({ status: 'completed', note: 'Closed by operations' })}>Mark completed</button>}
        {!['completed', 'cancelled'].includes(a.status) && <button className="btn btn-sm danger" disabled={busy} onClick={() => confirm('Cancel this request?') && patch({ status: 'cancelled', note: 'Cancelled by operations' })}>Cancel</button>}
        {['completed', 'cancelled'].includes(a.status) && <button className="btn btn-sm" disabled={busy} onClick={() => patch({ status: 'open', note: 'Reopened by operations' })}>Reopen</button>}
        <Link className="btn btn-sm" to={`/comms/messages?to=family:${a.family_id}&subject=${encodeURIComponent(`Your ${ASSIST_KINDS[a.kind].toLowerCase()} request`)}`}><MessagesSquare size={13} /> Message household</Link>
      </div>
      <label className="field mt">
        <span>Operator notes (government only)</span>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (a.operator_notes || '') && patch({ operator_notes: notes })} />
      </label>

      <h3>History</h3>
      <ol className="timeline compact-tl">
        {[...a.history].reverse().map((h, i) => (
          <li key={i} className="tl"><span className="tl-dot" style={{ background: ASSIST_COLOR[h.status] || '#8a8f98' }} />
            <div><strong>{h.status === 'released' ? 'Released' : ASSIST_STATUS[h.status] || h.status}</strong> · {h.by?.name}{h.note && <> — {h.note}</>}
              <div className="muted small" title={fullTime(h.at)}>{timeAgo(h.at)}</div></div>
          </li>
        ))}
      </ol>
    </div>
  )
}
