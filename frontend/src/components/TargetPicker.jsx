import { useEffect } from 'react'
import { MapContainer, TileLayer, Circle, CircleMarker, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { DEFAULT_CENTER } from '../lib/constants.js'
import { Segmented } from './ui.jsx'

function Click({ onClick }) {
  useMapEvents({ click: (e) => onClick({ latitude: +e.latlng.lat.toFixed(5), longitude: +e.latlng.lng.toFixed(5) }) })
  return null
}
function Follow({ center, radius }) {
  const map = useMap()
  useEffect(() => {
    if (center) map.fitBounds(L_bounds(center, radius), { padding: [10, 10], maxZoom: 14 })
  }, [center, radius, map])
  return null
}
// Rough lat/lng box around a circle; good enough to frame it.
function L_bounds(c, km) {
  const dLat = km / 111
  const dLng = km / (111 * Math.cos((c.latitude * Math.PI) / 180))
  return [[c.latitude - dLat, c.longitude - dLng], [c.latitude + dLat, c.longitude + dLng]]
}

// target: {type:'all'} | {type:'radius', center, radius_km, label}
export default function TargetPicker({ target, setTarget, shelters }) {
  const isArea = target.type === 'radius'
  const setArea = (patch) => {
    const base = { type: 'radius', center: { latitude: DEFAULT_CENTER[0], longitude: DEFAULT_CENTER[1] }, radius_km: 3 }
    const next = { ...base, ...(isArea ? target : {}), ...patch }
    next.label = `${next.radius_km} km around ${next.anchor || 'selected point'}`
    setTarget(next)
  }

  return (
    <div className="target">
      <Segmented value={target.type} label="Target area" onChange={(v) => (v === 'all' ? setTarget({ type: 'all' }) : setArea({}))}
        options={[['all', 'Entire disaster area'], ['radius', 'Specific area']]} />
      {isArea && (
        <>
          <div className="row">
            <label className="field">
              <span>Center on</span>
              <select value={target.anchor_id || ''} onChange={(e) => {
                const s = shelters.find((x) => x.id === e.target.value)
                if (s) setArea({ center: s.location, anchor: s.name, anchor_id: s.id })
              }}>
                <option value="">Point clicked on map</option>
                {shelters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Radius: {target.radius_km} km</span>
              <input type="range" min="0.5" max="15" step="0.5" value={target.radius_km} onChange={(e) => setArea({ radius_km: Number(e.target.value) })} />
            </label>
          </div>
          <div className="target-map">
            <MapContainer center={DEFAULT_CENTER} zoom={11} className="map" scrollWheelZoom={false}>
              <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <Click onClick={(c) => setArea({ center: c, anchor: undefined, anchor_id: undefined })} />
              <Follow center={target.center} radius={target.radius_km} />
              {shelters.map((s) => (
                <CircleMarker key={s.id} center={[s.location.latitude, s.location.longitude]} radius={4} pathOptions={{ color: '#475569', weight: 1, fillOpacity: 0.7 }}>
                  <Tooltip>{s.name}</Tooltip>
                </CircleMarker>
              ))}
              <Circle center={[target.center.latitude, target.center.longitude]} radius={target.radius_km * 1000}
                pathOptions={{ color: '#d64545', weight: 2, fillColor: '#d64545', fillOpacity: 0.12 }} />
            </MapContainer>
            <div className="map-banner map-banner-sm">Click to move the area</div>
          </div>
        </>
      )}
    </div>
  )
}
