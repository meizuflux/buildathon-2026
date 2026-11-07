import { useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import L from 'leaflet'
import { MapContainer, TileLayer, CircleMarker, Marker, Polyline, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { DEFAULT_CENTER, ORG_TYPES, RESOURCE_KEYS, REPORT_TYPES, SHIPMENT_LABEL } from '../lib/constants.js'
import { LEVEL_LABEL, cap, shelterLevel, timeAgo } from '../lib/format.js'
import { isLate } from '../lib/logistics.js'

export const LEVEL_COLOR = { ok: '#1f9d55', low: '#d98a00', full: '#d64545', closed: '#8a8f98' }
const SHIP_COLOR = { requested: '#94a3b8', approved: '#2563eb', in_transit: '#2563eb' }

const radiusFor = (total) => Math.max(7, Math.min(20, 5 + Math.sqrt(total || 0)))

const orgIcon = (org) =>
  L.divIcon({
    className: '',
    html: `<span class="org-pin org-${org.type} ${org.status !== 'active' ? 'org-dim' : ''}">${org.services.includes('transport') ? '⇄' : org.services.includes('medical') ? '+' : '■'}</span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  })

function FitToData({ points, disasterId }) {
  const map = useMap()
  const fitted = useRef(null)
  useEffect(() => {
    if (!points.length || fitted.current === disasterId) return
    map.fitBounds(points, { padding: [40, 40], maxZoom: 13 })
    fitted.current = disasterId
  }, [points, disasterId, map])
  return null
}

function FlyTo({ target }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo(target, Math.max(map.getZoom(), 14), { duration: 0.6 })
  }, [target, map])
  return null
}

function ClickToPick({ onPick }) {
  useMapEvents({
    click(e) {
      onPick?.({ latitude: +e.latlng.lat.toFixed(5), longitude: +e.latlng.lng.toFixed(5) })
    },
  })
  return null
}

export default function ShelterMap({
  shelters, families = [], familyError, reports, organizations = [], shipments = [], disasterId, selectedId, onSelect, focus,
  layers, setLayers, picking, draftLocation, onPick,
}) {
  const points = useMemo(
    () => [...shelters, ...organizations, ...families].map((s) => [s.location.latitude, s.location.longitude]),
    [shelters, organizations, families],
  )
  const where = (ref) => (ref.kind === 'shelter' ? shelters : organizations).find((x) => x.id === ref.id)?.location
  const routes = shipments
    .filter((s) => ['requested', 'approved', 'in_transit'].includes(s.status))
    .map((s) => ({ s, a: where(s.from), b: where(s.to) }))
    .filter((r) => r.a && r.b)

  return (
    <div className={`map-wrap ${picking ? 'is-picking' : ''}`}>
      <MapContainer center={DEFAULT_CENTER} zoom={12} className="map" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitToData points={points} disasterId={disasterId} />
        <FlyTo target={focus} />
        {picking && <ClickToPick onPick={onPick} />}

        {layers.shipments && routes.map(({ s, a, b }) => (
          <Polyline key={s.id} positions={[[a.latitude, a.longitude], [b.latitude, b.longitude]]}
            pathOptions={{ color: isLate(s) ? '#d64545' : SHIP_COLOR[s.status], weight: 3, opacity: 0.8, dashArray: s.status === 'in_transit' ? '8 6' : '2 6' }}>
            <Tooltip sticky>
              {SHIPMENT_LABEL[s.status]}{isLate(s) ? ' (late)' : ''}: {s.from.name} → {s.to.name}
            </Tooltip>
          </Polyline>
        ))}

        {layers.reports && reports.filter((r) => r.location).map((r) => (
          <CircleMarker key={r.id} center={[r.location.latitude, r.location.longitude]} radius={6}
            pathOptions={{ color: '#7c3aed', weight: 2, fillColor: '#fff', fillOpacity: 1, dashArray: r.type === 'need_help' ? null : '2 3' }}>
            <Popup>
              <strong>{REPORT_TYPES[r.type] || r.type}</strong>
              <div className="popup-meta">{r.family_id} · {timeAgo(r.created_at)}</div>
              <p className="popup-msg">{r.message}</p>
            </Popup>
          </CircleMarker>
        ))}

        {layers.families && families.map((family) => (
          <CircleMarker key={family.id} center={[family.location.latitude, family.location.longitude]} radius={5}
            pathOptions={{ color: '#1d4ed8', weight: 1.5, fillColor: '#60a5fa', fillOpacity: 0.8 }}>
            {!picking && <Popup>
              <strong>Family {family.id}</strong>
              <div className="popup-meta">{family.adults} adults · {family.children} children</div>
              <Link to={`/families/${encodeURIComponent(family.id)}`}>View family profile →</Link>
            </Popup>}
          </CircleMarker>
        ))}

        {layers.organizations && organizations.map((o) => (
          <Marker key={o.id} position={[o.location.latitude, o.location.longitude]} icon={orgIcon(o)}>
            <Tooltip direction="top" offset={[0, -8]}>{o.name}</Tooltip>
            {!picking && (
              <Popup>
                <strong>{o.name}</strong>
                <div className="popup-meta">{ORG_TYPES[o.type]} · {cap(o.status)}</div>
                <div className="popup-meta">{o.address}</div>
                <Link to={`/organizations/${o.id}`}>Open organization →</Link>
              </Popup>
            )}
          </Marker>
        ))}

        {layers.shelters && shelters.map((s) => {
          const level = shelterLevel(s)
          const selected = s.id === selectedId
          return (
            <CircleMarker key={s.id} center={[s.location.latitude, s.location.longitude]} radius={radiusFor(s.capacity.total_people)}
              pathOptions={{ color: selected ? '#111827' : '#fff', weight: selected ? 3 : 2, fillColor: LEVEL_COLOR[level], fillOpacity: 0.9 }}
              eventHandlers={{ click: () => !picking && onSelect(s.id) }}>
              <Tooltip direction="top" offset={[0, -6]}>{s.name}</Tooltip>
              {!picking && (
                <Popup>
                  <strong>{s.name}</strong>
                  <div className="popup-meta">{s.address}</div>
                  <div className="popup-meta">{LEVEL_LABEL[level]} · {s.capacity.available_people}/{s.capacity.total_people} spaces</div>
                  <div className="popup-res">
                    {RESOURCE_KEYS.map((k) => <span key={k} className={`chip res-${s.resources[k] || 'unknown'}`}>{cap(k)}</span>)}
                  </div>
                </Popup>
              )}
            </CircleMarker>
          )
        })}

        {picking && draftLocation && (
          <CircleMarker center={[draftLocation.latitude, draftLocation.longitude]} radius={11}
            pathOptions={{ color: '#2563eb', weight: 3, fillColor: '#2563eb', fillOpacity: 0.35, dashArray: '4 3' }} />
        )}
      </MapContainer>

      {picking ? (
        <div className="map-banner">Click the map to set the shelter location</div>
      ) : (
        <>
          <div className="layer-toggle" role="group" aria-label="Map layers">
            {[['shelters', 'Shelters'], ['families', 'Families'], ['organizations', 'Organizations'], ['shipments', 'Shipments'], ['reports', 'Family reports']].map(([k, label]) => (
              <label key={k} className="check">
                <input type="checkbox" checked={layers[k]} onChange={(e) => setLayers((l) => ({ ...l, [k]: e.target.checked }))} />
                {label}
              </label>
            ))}
            {layers.families && familyError && <span className="error" role="alert">Families could not be loaded: {familyError}</span>}
          </div>
          <div className="legend" aria-label="Map legend">
            {Object.entries(LEVEL_COLOR).map(([k, c]) => <span key={k}><i style={{ background: c }} />{LEVEL_LABEL[k]}</span>)}
            <span><span className="org-pin org-nonprofit legend-pin">■</span>Organization</span>
            <span><i style={{ background: '#60a5fa', border: '1px solid #1d4ed8' }} />Family</span>
            <span><i className="legend-report" />Family report</span>
            <span><i className="legend-route" />Shipment</span>
          </div>
        </>
      )}
    </div>
  )
}
