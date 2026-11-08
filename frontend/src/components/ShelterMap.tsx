import { useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react'
import { Link } from 'react-router-dom'
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { DEFAULT_CENTER, RESOURCE_KEYS, REPORT_TYPES } from '../lib/constants'
import { LEVEL_LABEL, cap, shelterLevel, timeAgo, type ShelterLevel } from '../lib/format'
import type { Family, Location, MapLayers, Report, Shelter } from '../api/types'

export const LEVEL_COLOR: Record<ShelterLevel, string> = { ok: '#1f9d55', low: '#d98a00', full: '#d64545', closed: '#8a8f98' }

const LAYER_OPTIONS: { key: keyof MapLayers; label: string }[] = [
  { key: 'shelters', label: 'Shelters' },
  { key: 'families', label: 'Families' },
  { key: 'reports', label: 'Family reports' },
]

const radiusFor = (total: number): number => Math.max(7, Math.min(20, 5 + Math.sqrt(total || 0)))

function FitToData({ points, disasterId }: { points: [number, number][]; disasterId: string | null }) {
  const map = useMap()
  const fitted = useRef<string | null>(null)
  useEffect(() => {
    if (!points.length || fitted.current === disasterId) return
    map.fitBounds(points, { padding: [40, 40], maxZoom: 13 })
    fitted.current = disasterId
  }, [points, disasterId, map])
  return null
}

function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo(target, Math.max(map.getZoom(), 14), { duration: 0.6 })
  }, [target, map])
  return null
}

function ClickToPick({ onPick }: { onPick?: (location: Location) => void }) {
  useMapEvents({
    click(e) {
      onPick?.({ latitude: +e.latlng.lat.toFixed(5), longitude: +e.latlng.lng.toFixed(5) })
    },
  })
  return null
}

export default function ShelterMap({
  shelters, families = [], familyError, reports, disasterId, selectedId, onSelect, focus,
  layers, setLayers, picking, draftLocation, onPick,
}: {
  shelters: Shelter[]
  families?: Family[]
  familyError?: string | null
  reports: Report[]
  disasterId: string | null
  selectedId: string | null
  onSelect: (id: string) => void
  focus: [number, number] | null
  layers: MapLayers
  setLayers: Dispatch<SetStateAction<MapLayers>>
  picking: boolean
  draftLocation?: Location
  onPick?: (location: Location) => void
}) {
  const points = useMemo<[number, number][]>(
    () => [...shelters, ...families].map((s): [number, number] => [s.location.latitude, s.location.longitude]),
    [shelters, families],
  )

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

        {layers.reports && reports.filter((r): r is Report & { location: Location } => !!r.location).map((r) => (
          <CircleMarker key={r.id} center={[r.location.latitude, r.location.longitude]} radius={6}
            pathOptions={{ color: '#7c3aed', weight: 2, fillColor: '#fff', fillOpacity: 1, dashArray: r.type === 'need_help' ? undefined : '2 3' }}>
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
            {LAYER_OPTIONS.map(({ key, label }) => (
              <label key={key} className="check">
                <input type="checkbox" checked={layers[key]} onChange={(e) => setLayers((l) => ({ ...l, [key]: e.target.checked }))} />
                {label}
              </label>
            ))}
            {layers.families && familyError && <span className="error" role="alert">Families could not be loaded: {familyError}</span>}
          </div>
          <div className="legend" aria-label="Map legend">
            {Object.entries(LEVEL_COLOR).map(([k, c]) => <span key={k}><i style={{ background: c }} />{LEVEL_LABEL[k as ShelterLevel]}</span>)}
            <span><i style={{ background: '#60a5fa', border: '1px solid #1d4ed8' }} />Family</span>
            <span><i className="legend-report" />Family report</span>
          </div>
        </>
      )}
    </div>
  )
}
