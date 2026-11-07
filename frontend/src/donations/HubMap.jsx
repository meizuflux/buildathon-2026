import 'leaflet/dist/leaflet.css';
import { useCallback, useEffect, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip } from 'react-leaflet';
import { API_BASE, dispatchPickup, fetchHubs, fetchRequests } from './api';
import { authMessage, capacityHex, itemsText } from './format';

const DEFAULT_CENTER = [27.9506, -82.4572]; // Tampa demo region

function HubPopup({ hub, onDispatch, busy, error }) {
  return (
    <div className="min-w-[200px] space-y-1 text-sm">
      <div className="font-semibold text-gray-900">{hub.name}</div>
      <div className="text-gray-600">{hub.address}</div>
      <div className="font-medium" style={{ color: capacityHex(hub.capacity_pct) }}>
        {hub.capacity_pct}% full
      </div>
      <div className="text-xs text-gray-600">
        {hub.supplies.map((s) => `${s.name}: ${s.quantity}`).join(' · ') || 'No stock logged'}
      </div>
      {hub.open_pickup ? (
        <div className="text-xs font-semibold text-green-700">Transport dispatched ✓</div>
      ) : hub.capacity_pct >= 70 ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onDispatch(hub)}
          className="mt-1 rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Dispatching…' : 'Dispatch Transport Pickup'}
        </button>
      ) : null}
      {error && <div className="text-xs text-red-700">{error}</div>}
    </div>
  );
}

/**
 * Map of every hub, colored by capacity, plus open citizen requests as small blue dots.
 * Props: token (operator; needed to dispatch and to see requests), apiBase, center [lat, lng], height, pollMs, refreshKey.
 */
export default function HubMap({ token, apiBase = API_BASE, center = DEFAULT_CENTER, height = 420, pollMs = 30000, refreshKey }) {
  const [hubs, setHubs] = useState([]);
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState(null);
  const [errors, setErrors] = useState({});

  const load = useCallback(async () => {
    try {
      setHubs(await fetchHubs(0, { apiBase }));
    } catch {
      // keep the last good data on screen
    }
    if (token) {
      fetchRequests({ status: 'open' }, { apiBase, token }).then(setRequests, () => setRequests([]));
    }
  }, [apiBase, token]);

  useEffect(() => {
    load();
    const id = setInterval(load, pollMs);
    return () => clearInterval(id);
  }, [load, pollMs, refreshKey]);

  const dispatch = async (hub) => {
    setBusy(hub.id);
    try {
      const pickup = await dispatchPickup(hub.id, '', { apiBase, token });
      setHubs((list) => list.map((h) => (h.id === hub.id ? { ...h, open_pickup: pickup } : h)));
    } catch (e) {
      if (e.status === 409) load();
      else setErrors((errs) => ({ ...errs, [hub.id]: authMessage(e) }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
        <h2 className="text-lg font-semibold text-gray-900">Hub map</h2>
        <div className="flex flex-wrap gap-3 text-xs text-gray-600">
          {[
            ['#dc2626', '90%+ full'],
            ['#f59e0b', '70–89%'],
            ['#16a34a', 'Under 70%'],
            ['#2563eb', 'Open request'],
          ].map(([color, label]) => (
            <span key={label} className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
              {label}
            </span>
          ))}
        </div>
      </header>
      <MapContainer center={center} zoom={11} style={{ height }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {hubs.map((hub) => (
          <CircleMarker
            key={hub.id}
            center={[hub.latitude, hub.longitude]}
            radius={8 + hub.capacity_pct / 10}
            pathOptions={{ color: '#fff', weight: 2, fillColor: capacityHex(hub.capacity_pct), fillOpacity: 0.9 }}
          >
            <Tooltip>{`${hub.name}: ${hub.capacity_pct}%`}</Tooltip>
            <Popup>
              <HubPopup hub={hub} onDispatch={dispatch} busy={busy === hub.id} error={errors[hub.id]} />
            </Popup>
          </CircleMarker>
        ))}
        {requests.map((r) => (
          <CircleMarker
            key={r.id}
            center={[r.latitude, r.longitude]}
            radius={5}
            pathOptions={{ color: '#fff', weight: 1.5, fillColor: '#2563eb', fillOpacity: 0.9 }}
          >
            <Tooltip>{`Request: ${itemsText(r.items)}`}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </section>
  );
}
