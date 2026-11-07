import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Circle, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { Accessibility, Baby, Car, Check, EyeOff, HeartPulse, MapPin, Navigation, PawPrint, Phone, ShieldCheck, Users } from 'lucide-react'
import { useData } from '../data.jsx'
import { Empty, Modal, PageHead, PriorityBadge, Segmented } from '../components/ui.jsx'
import { ASSIST_KINDS, ASSIST_STATUS, PRIORITY_RANK } from '../lib/constants.js'
import { available, cap, clock, timeAgo } from '../lib/format.js'

const PRI_COLOR = { critical: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#6b7280' }
const DEFAULT_NOTE = {
  delivery: "We've accepted your request and are bringing your supplies.",
  transport: "We're sending a vehicle to take you to safety. Please have documents and medication ready.",
  medical: 'Our medical team has your request and will call you before arriving.',
  welfare_check: "We're sending someone to check on your household.",
  other: "We've accepted your request and will be in touch shortly.",
}

function Fly({ to }) {
  const map = useMap()
  useEffect(() => { if (to) map.flyTo(to, 14, { duration: 0.5 }) }, [to, map])
  return null
}

export default function Citizens() {
  const d = useData()
  const [tab, setTab] = useState('nearby')
  const [kind, setKind] = useState('all')
  const [focus, setFocus] = useState(null)
  const [claiming, setClaiming] = useState(null)
  const [justClaimed, setJustClaimed] = useState(null)

  const stock = useMemo(() => Object.fromEntries(d.inventory.map((r) => [r.resource_type_id, available(r)])), [d.inventory])
  const nearby = d.nearbyCitizens
    .filter((a) => kind === 'all' || a.kind === kind)
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.distance_km - b.distance_km)
  const isActive = (a) => ['claimed', 'en_route'].includes(a.status)
  const mine = [...d.myCitizens].sort((a, b) => isActive(b) - isActive(a) || b.updated_at.localeCompare(a.updated_at))
  const activeMine = mine.filter((a) => ['claimed', 'en_route'].includes(a.status))

  if (!d.me) return <div className="page"><Empty>Loading…</Empty></div>
  if (!d.citizenApproved) {
    return (
      <div className="page narrow">
        <PageHead title="Citizens in need" />
        <div className="card-panel notice-panel"><ShieldCheck size={18} /> Your organization isn't approved to help households directly yet. Ask the operations center to enable citizen assistance for you.</div>
      </div>
    )
  }
  const center = [d.me.location.latitude, d.me.location.longitude]

  return (
    <div className="page">
      <PageHead title="Citizens in need" subtitle={`Households within ${d.me.coverage_radius_km} km who can't get to an aid location and agreed to be helped by partners like you.`} />
      <p className="privacy"><EyeOff size={14} /> Locations are approximate and names, phone numbers and addresses stay hidden until you accept a request. Accepting is logged with the operations center. Use these details only to help this household.</p>

      <div className="cit-grid">
        <div className="cit-map">
          <MapContainer center={center} zoom={12} className="map" scrollWheelZoom>
            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Fly to={focus} />
            <Circle center={center} radius={d.me.coverage_radius_km * 1000} pathOptions={{ color: '#0f766e', weight: 1, fillOpacity: 0.04, dashArray: '6 6' }} />
            <CircleMarker center={center} radius={8} pathOptions={{ color: '#fff', weight: 2, fillColor: '#0f766e', fillOpacity: 1 }}><Tooltip>You: {d.me.name}</Tooltip></CircleMarker>
            {tab === 'nearby' && nearby.map((a) => (
              <Circle key={a.id} center={[a.approx_location.latitude, a.approx_location.longitude]} radius={450}
                pathOptions={{ color: PRI_COLOR[a.priority], weight: 1.5, fillColor: PRI_COLOR[a.priority], fillOpacity: 0.25 }}
                eventHandlers={{ click: () => setClaiming(a) }}>
                <Tooltip>{cap(a.priority)} · {ASSIST_KINDS[a.kind]} · ~{a.distance_km} km</Tooltip>
              </Circle>
            ))}
            {activeMine.map((a) => (
              <CircleMarker key={a.id} center={[a.location.latitude, a.location.longitude]} radius={8}
                pathOptions={{ color: '#fff', weight: 2, fillColor: a.status === 'en_route' ? '#7c3aed' : '#2563eb', fillOpacity: 1 }}>
                <Tooltip>{a.contact.name} · {ASSIST_STATUS[a.status]}</Tooltip>
              </CircleMarker>
            ))}
          </MapContainer>
          <div className="map-legend">
            {Object.entries(PRI_COLOR).map(([k, c]) => <span key={k}><i style={{ background: c, opacity: 0.6 }} />{cap(k)}</span>)}
            <span><i style={{ background: '#2563eb' }} />Your assignments</span>
          </div>
        </div>

        <div className="cit-list">
          <div className="row-between">
            <Segmented value={tab} onChange={setTab} label="View" options={[['nearby', `Nearby (${d.nearbyCitizens.length})`], ['mine', `Your assignments (${activeMine.length})`]]} />
            {tab === 'nearby' && (
              <select className="select-sm" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type">
                <option value="all">All types</option>
                {Object.entries(ASSIST_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            )}
          </div>

          {justClaimed && <p className="success"><Check size={14} /> Accepted. The household's details are now under <strong>Your assignments</strong>.</p>}

          {tab === 'nearby' && (
            <div className="stack mt">
              {nearby.length === 0 && <Empty>No open requests near you right now.</Empty>}
              {nearby.map((a) => {
                const canFill = a.items.length > 0 && a.items.every((i) => (stock[i.resource_type_id] || 0) >= i.quantity)
                return (
                  <article key={a.id} className={`card-panel cit-card pri-edge-${a.priority}`} onMouseEnter={() => setFocus([a.approx_location.latitude, a.approx_location.longitude])}>
                    <div className="row-between">
                      <span><PriorityBadge priority={a.priority} /> <strong>{ASSIST_KINDS[a.kind]}</strong></span>
                      <span className="muted small"><MapPin size={12} /> ~{a.distance_km} km · {timeAgo(a.created_at)}</span>
                    </div>
                    <Household h={a.household} />
                    {a.items.length > 0 && (
                      <div className="small">Needs: {a.items.map((i) => `${d.rt(i.resource_type_id).name} × ${i.quantity}`).join(', ')}{' '}
                        {canFill ? <span className="badge st-active">You have this</span> : <span className="muted">(not in your stock)</span>}</div>
                    )}
                    <div className="row-between cit-foot">
                      <span className="muted small"><EyeOff size={12} /> Details shown after accepting</span>
                      <button className="btn btn-primary btn-sm" onClick={() => setClaiming(a)}>Accept</button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}

          {tab === 'mine' && (
            <div className="stack mt">
              {mine.length === 0 && <Empty>You haven't accepted any requests yet.</Empty>}
              {mine.map((a) => <Assignment key={a.id} a={a} stock={stock} onLocate={() => setFocus([a.location.latitude, a.location.longitude])} />)}
            </div>
          )}
        </div>
      </div>

      {claiming && <ClaimDialog a={claiming} onClose={() => setClaiming(null)} onDone={() => { setClaiming(null); setTab('mine'); setJustClaimed(claiming.id) }} />}
    </div>
  )
}

function Household({ h, full }) {
  const people = full ? h.adults + h.children : h.people
  return (
    <div className="chips">
      <span className="tag"><Users size={12} /> {full ? `${h.adults} adult${h.adults === 1 ? '' : 's'}, ${h.children} child${h.children === 1 ? '' : 'ren'}` : `${people} ${people === 1 ? 'person' : 'people'}`}</span>
      {!full && h.children > 0 && <span className="tag"><Baby size={12} /> Children</span>}
      {h.immediate_medication && <span className="tag tag-alert"><HeartPulse size={12} /> Needs medication</span>}
      {(h.accessibility || h.accessibility_notes) && <span className="tag tag-warn"><Accessibility size={12} /> Accessibility needs</span>}
      {h.pets && <span className="tag"><PawPrint size={12} /> Pets</span>}
      {!h.has_car && <span className="tag"><Car size={12} /> No car</span>}
    </div>
  )
}

function ClaimDialog({ a, onClose, onDone }) {
  const d = useData()
  const [eta, setEta] = useState(a.priority === 'critical' ? 30 : 60)
  const [note, setNote] = useState(DEFAULT_NOTE[a.kind])
  const [ack, setAck] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await d.mutate((api) => api.claimAssistanceRequest(a.id, { eta: new Date(Date.now() + eta * 60_000).toISOString(), partner_note: note }))
      onDone()
    } catch (err) {
      setError(err.code === 'already_claimed' ? 'Another organization just accepted this request. Thank you anyway!' : err.message)
      setBusy(false)
    }
  }
  return (
    <Modal title={`Accept: ${ASSIST_KINDS[a.kind]} (${cap(a.priority)})`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Household h={a.household} />
        <p className="small muted">About {a.distance_km} km from you. Accepting reveals the household's name, phone, address and care notes to your organization and tells them help is coming.</p>
        <div className="row">
          <label className="field"><span>You can be there in (minutes)</span><input type="number" min="5" step="5" value={eta} onChange={(e) => setEta(Number(e.target.value))} /></label>
        </div>
        <label className="field"><span>Message to the household (they'll see this in the Haven app)</span><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} required /></label>
        <label className="check ack"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I'll use this household's details only to help them, and I'll release the request if we can't follow through.</label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!ack || busy}>{busy ? 'Accepting…' : 'Accept request'}</button>
        </div>
      </form>
    </Modal>
  )
}

function Assignment({ a, stock, onLocate }) {
  const d = useData()
  const [dialog, setDialog] = useState(null)
  const [busy, setBusy] = useState(false)
  const h = a.household
  const active = ['claimed', 'en_route'].includes(a.status)
  const directions = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${d.me.location.latitude}%2C${d.me.location.longitude}%3B${a.location.latitude}%2C${a.location.longitude}`
  const patch = async (body) => {
    setBusy(true)
    await d.mutate((api) => api.updateAssistanceRequest(a.id, body)).catch((e) => alert(e.message))
    setBusy(false)
  }
  return (
    <article className={`card-panel cit-card ast-edge-${a.status}`}>
      <div className="row-between">
        <span><PriorityBadge priority={a.priority} /> <strong>{ASSIST_KINDS[a.kind]}</strong></span>
        <span className={`badge ast-${a.status}`}>{ASSIST_STATUS[a.status]}{a.eta && active && ` · ETA ${clock(a.eta)}`}</span>
      </div>
      <div className="contact-row">
        <div><div className="cit-name">{a.contact.name}</div><div className="muted small">{a.address} · {a.distance_km} km</div></div>
        <div className="page-actions">
          <a className="btn btn-sm" href={`tel:${a.contact.phone}`}><Phone size={13} /> {a.contact.phone}</a>
          <a className="btn btn-sm" href={directions} target="_blank" rel="noreferrer"><Navigation size={13} /> Directions</a>
          <button className="btn btn-sm btn-ghost" onClick={onLocate}><MapPin size={13} /> Map</button>
        </div>
      </div>
      <blockquote className="cit-quote">{a.message}</blockquote>
      <Household h={h} full />
      {(h.medical_notes || h.accessibility_notes || h.other_special_care) && (
        <ul className="care">
          {h.medical_notes && <li className="tone-alert"><HeartPulse size={13} /> {h.medical_notes}</li>}
          {h.accessibility_notes && <li><Accessibility size={13} /> {h.accessibility_notes}</li>}
          {h.other_special_care && <li>{h.other_special_care}</li>}
        </ul>
      )}
      {a.items.length > 0 && (
        <div className="small">Bring: {a.items.map((i) => {
          const have = stock[i.resource_type_id] || 0
          return <span key={i.resource_type_id} className={have >= i.quantity ? '' : 'tone-alert'}>{d.rt(i.resource_type_id).name} × {i.quantity} ({have} in stock) </span>
        })}</div>
      )}
      {a.partner_note && <div className="muted small">You told them: “{a.partner_note}”</div>}
      {a.resolution_note && <div className="small">Outcome: {a.resolution_note}</div>}
      {active && (
        <div className="cit-actions">
          <button className="btn btn-ghost btn-sm danger" disabled={busy} onClick={() => setDialog('release')}>Can't make it</button>
          {a.status === 'claimed' && <button className="btn btn-sm" disabled={busy} onClick={() => patch({ status: 'en_route', partner_note: 'We are on our way now.' })}>On our way</button>}
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setDialog('complete')}>Mark completed</button>
        </div>
      )}
      {dialog === 'complete' && <CompleteDialog a={a} stock={stock} onClose={() => setDialog(null)} />}
      {dialog === 'release' && <ReleaseDialog a={a} onClose={() => setDialog(null)} />}
    </article>
  )
}

function CompleteDialog({ a, stock, onClose }) {
  const d = useData()
  const canDeduct = a.items.length > 0 && a.items.some((i) => stock[i.resource_type_id] !== undefined)
  const [note, setNote] = useState('')
  const [deduct, setDeduct] = useState(canDeduct)
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    await d.mutate((api) => api.updateAssistanceRequest(a.id, { status: 'completed', resolution_note: note, deduct_inventory: deduct })).catch((err) => alert(err.message))
    onClose()
  }
  return (
    <Modal title="Mark request completed" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label className="field"><span>What happened? (shared with operations)</span><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Delivered water and meals; family is safe and staying put." required /></label>
        {canDeduct && <label className="check"><input type="checkbox" checked={deduct} onChange={(e) => setDeduct(e.target.checked)} /> Deduct the delivered items from our inventory</label>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Complete'}</button>
        </div>
      </form>
    </Modal>
  )
}

function ReleaseDialog({ a, onClose }) {
  const d = useData()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    await d.mutate((api) => api.updateAssistanceRequest(a.id, { status: 'released', note: reason })).catch((err) => alert(err.message))
    onClose()
  }
  return (
    <Modal title="Release this request" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="small muted">The request goes back to the open queue so another organization can help, and you'll lose access to the household's details.</p>
        <label className="field"><span>Reason (shared with operations)</span><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Road to the address is closed" required /></label>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Releasing…' : 'Release'}</button>
        </div>
      </form>
    </Modal>
  )
}
