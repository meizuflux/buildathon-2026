import { useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react'
import { Link } from 'react-router-dom'
import L from 'leaflet'
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, ZoomControl, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { Family, Location, MapLayers, Report, Shelter } from '../api/types'
import { DEFAULT_CENTER, REPORT_TYPES, RESOURCE_KEYS } from '../lib/constants'
import { cap, timeAgo } from '../lib/format'
import { LEVEL_TEXT, occupancy, shelterLevel } from '../lib/ops'

// OpenStreetMap tiles, darkened in CSS (.hx-tiles) so no tile API key is needed.
const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

type FamilyKind = 'med' | 'nocar' | 'plain'
export const FAMILY_COLOR: Record<FamilyKind, string> = { med: '#f2615e', nocar: '#d9a05a', plain: '#8ea2b6' }
const RES_TONE: Record<string, string> = { available: 't-green', limited: 't-amber', unavailable: 't-red' }

export function familyKind(f: Family): FamilyKind {
  if (f.needs.immediate_medication) return 'med'
  if (!f.resources.has_car) return 'nocar'
  return 'plain'
}

function shelterIcon(s: Shelter, selected: boolean) {
  const level = shelterLevel(s)
  const pct = (occupancy(s) * 100).toFixed(1)
  const free = Math.max(0, s.capacity.available_people || 0)
  const label = level === 'closed' ? '—' : level === 'full' ? 'Full' : free >= 1000 ? `${(free / 1000).toFixed(1)}k` : String(free)
  return L.divIcon({
    className: '',
    iconSize: [46, 46],
    iconAnchor: [23, 23],
    html: `<div class="hx-pin lvl-${level}${selected ? ' selected' : ''}"><svg viewBox="0 0 46 46" aria-hidden="true"><circle class="bg" cx="23" cy="23" r="19"/><circle class="arc" cx="23" cy="23" r="19" pathLength="100" stroke-dasharray="${pct} 100" transform="rotate(-90 23 23)"/></svg><span class="n">${label}</span></div>`,
  })
}
const urgent = (r: Report) => r.type === 'need_help' || r.type === 'resource_request'
const reportIcon = (r: Report) =>
  L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9], html: `<div class="hx-report-pin${urgent(r) ? '' : ' quiet'}"></div>` })
const draftIcon = L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13], html: '<div class="hx-draft-pin"></div>' })
const homeIcon = L.divIcon({ className: '', iconSize: [16, 16], iconAnchor: [8, 8], html: '<div class="hx-home-pin"></div>' })

function FitToData({ points, fitKey }: { points: [number, number][]; fitKey: string | null }) {
  const map = useMap()
  const fitted = useRef<string | null>(null)
  useEffect(() => {
    if (!points.length || fitted.current === fitKey) return
    map.fitBounds(points, { padding: [60, 60], maxZoom: 14 })
    fitted.current = fitKey
  }, [points, fitKey, map])
  return null
}

function FlyTo({ target }: { target: [number, number] | null | undefined }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo(target, Math.max(map.getZoom(), 14), { duration: 0.6 })
  }, [target, map])
  return null
}

function ClickToPick({ onPick }: { onPick?: (location: Location) => void }) {
  useMapEvents({ click: (e) => onPick?.({ latitude: +e.latlng.lat.toFixed(5), longitude: +e.latlng.lng.toFixed(5) }) })
  return null
}

// Keep Leaflet's size in sync when the surrounding layout changes.
function AutoResize() {
  const map = useMap()
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(map.getContainer())
    return () => ro.disconnect()
  }, [map])
  return null
}

type OpsMapProps = {
  shelters?: Shelter[]
  families?: Family[]
  reports?: Report[]
  layers?: MapLayers
  selectedId?: string | null
  onSelect?: (id: string) => void
  focus?: [number, number] | null
  fitKey: string | null
  picking?: boolean
  draftLocation?: Location
  onPick?: (location: Location) => void
  popups?: boolean
  home?: Location | null
  line?: [number, number][] | null
  zoomControl?: boolean
}

const ALL_LAYERS: MapLayers = { shelters: true, families: true, reports: true }

export default function OpsMap({
  shelters = [], families = [], reports = [], layers = ALL_LAYERS, selectedId, onSelect, focus, fitKey,
  picking = false, draftLocation, onPick, popups = true, home, line, zoomControl = true,
}: OpsMapProps) {
  const points = useMemo(() => {
    const pts: [number, number][] = [
      ...shelters.map((s): [number, number] => [s.location.latitude, s.location.longitude]),
      ...families.map((f): [number, number] => [f.location.latitude, f.location.longitude]),
    ]
    if (home) pts.push([home.latitude, home.longitude])
    return pts
  }, [shelters, families, home])

  return (
    <div className={`hx-map ${picking ? 'is-picking' : ''}`}>
      <MapContainer center={DEFAULT_CENTER} zoom={12} preferCanvas scrollWheelZoom zoomControl={false}>
        <TileLayer url={TILES} attribution={ATTRIBUTION} className="hx-tiles" maxZoom={19} />
        {zoomControl && <ZoomControl position="bottomright" />}
        <AutoResize />
        <FitToData points={points} fitKey={fitKey} />
        <FlyTo target={focus} />
        {picking && <ClickToPick onPick={onPick} />}

        {line && <Polyline positions={line} pathOptions={{ color: '#5b9cf0', weight: 2, dashArray: '6 6', opacity: 0.9 }} />}

        {layers.families && families.map((f) => {
          const kind = familyKind(f)
          return (
            <CircleMarker key={f.id} center={[f.location.latitude, f.location.longitude]} radius={kind === 'med' ? 3.8 : 3.2}
              pathOptions={{ stroke: false, fillColor: FAMILY_COLOR[kind], fillOpacity: kind === 'med' ? 0.85 : kind === 'nocar' ? 0.6 : 0.45 }}>
              {popups && !picking && (
                <Popup>
                  <div className="pop-title">Family {f.id}</div>
                  <div className="pop-meta">{f.adults} adults, {f.children} children{f.needs.pets ? ', pets' : ''}</div>
                  <div className="pop-row">
                    {f.needs.immediate_medication && <span className="badge t-red">Needs medication</span>}
                    {!f.resources.has_car && <span className="badge t-amber">No car</span>}
                  </div>
                  <div className="pop-row"><Link to={`/families/${encodeURIComponent(f.id)}`}>Open family profile</Link></div>
                </Popup>
              )}
            </CircleMarker>
          )
        })}

        {layers.reports && reports.map((r) => r.location && (
          <Marker key={r.id} position={[r.location.latitude, r.location.longitude]} icon={reportIcon(r)}>
            {popups && !picking && (
              <Popup>
                <span className={`badge ${r.type === 'need_help' ? 't-red' : 't-violet'}`}>{REPORT_TYPES[r.type] || r.type}</span>
                <p className="pop-msg">{r.message}</p>
                <div className="pop-meta">{timeAgo(r.created_at)}</div>
                <div className="pop-row"><Link to={`/families/${encodeURIComponent(r.family_id)}`}>Family {r.family_id}</Link></div>
              </Popup>
            )}
          </Marker>
        ))}

        {layers.shelters && shelters.map((s) => (
          <Marker key={s.id} position={[s.location.latitude, s.location.longitude]} icon={shelterIcon(s, s.id === selectedId)}
            zIndexOffset={s.id === selectedId ? 1000 : 500}
            eventHandlers={{ click: () => { if (!picking) onSelect?.(s.id) } }}>
            <Tooltip direction="top" offset={[0, -22]}>{s.name}</Tooltip>
            {popups && !onSelect && !picking && (
              <Popup>
                <div className="pop-title">{s.name}</div>
                <div className="pop-meta">{s.address}</div>
                <div className="pop-meta">{LEVEL_TEXT[shelterLevel(s)]}, {s.capacity.available_people} of {s.capacity.total_people} spaces free</div>
                <div className="pop-row">{RESOURCE_KEYS.map((k) => <span key={k} className={`badge ${RES_TONE[s.resources[k]] || 't-muted'}`}>{cap(k)}</span>)}</div>
              </Popup>
            )}
          </Marker>
        ))}

        {home && <Marker position={[home.latitude, home.longitude]} icon={homeIcon}><Tooltip direction="top" offset={[0, -8]}>Household location</Tooltip></Marker>}
        {picking && draftLocation && <Marker position={[draftLocation.latitude, draftLocation.longitude]} icon={draftIcon} />}
      </MapContainer>
    </div>
  )
}

export function LayerPanel({ layers, setLayers, familyError }: {
  layers: MapLayers
  setLayers: Dispatch<SetStateAction<MapLayers>>
  familyError: string | null
}) {
  const toggles: [keyof MapLayers, string][] = [['shelters', 'Shelters'], ['families', 'Households'], ['reports', 'Reports']]
  return (
    <div className="hx-float hx-layers" role="group" aria-label="Map layers">
      <div className="toggles">
        {toggles.map(([k, label]) => (
          <label key={k}><input type="checkbox" checked={layers[k]} onChange={(e) => setLayers((l) => ({ ...l, [k]: e.target.checked }))} />{label}</label>
        ))}
      </div>
      <div className="key">
        <span><i className="ring" />Shelter, ring shows how full</span>
        <span><i style={{ background: FAMILY_COLOR.plain }} />Household</span>
        <span><i style={{ background: FAMILY_COLOR.med }} />Needs medication</span>
        <span><i style={{ background: FAMILY_COLOR.nocar }} />No car</span>
        <span><i className="diamond" />Report</span>
      </div>
      {layers.families && familyError && <span className="small" style={{ color: 'var(--red)' }} role="alert">Households could not be loaded: {familyError}</span>}
    </div>
  )
}
