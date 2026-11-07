import { useCallback, useEffect, useState } from 'react';
import { API_BASE, dispatchPickup, fetchHubs } from './api';

const THRESHOLDS = [70, 80, 90];
const TYPES = {
  church: 'Church',
  fire_station: 'Fire station',
  school: 'School',
  community_center: 'Community center',
  other: 'Hub',
};

function barColor(pct) {
  if (pct >= 90) return 'bg-red-600';
  if (pct >= 70) return 'bg-amber-500';
  return 'bg-green-600';
}

function formatTime(iso) {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * Government view: hubs at or above a capacity threshold, with a dispatch action.
 * Props: token (operator bearer token, needed to dispatch), apiBase, pollMs.
 */
export default function OverCapacityHubs({ token, apiBase = API_BASE, pollMs = 30000 }) {
  const [threshold, setThreshold] = useState(90);
  const [hubs, setHubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState({});
  const [rowErrors, setRowErrors] = useState({});

  const load = useCallback(async () => {
    try {
      setHubs(await fetchHubs(threshold, { apiBase }));
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [threshold, apiBase]);

  useEffect(() => {
    setLoading(true);
    load();
    const id = setInterval(load, pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);

  const dispatch = async (hub) => {
    setPending((p) => ({ ...p, [hub.id]: true }));
    setRowErrors((e) => ({ ...e, [hub.id]: null }));
    try {
      const pickup = await dispatchPickup(hub.id, '', { apiBase, token });
      setHubs((list) => list.map((h) => (h.id === hub.id ? { ...h, open_pickup: pickup } : h)));
    } catch (e) {
      if (e.status === 409) {
        await load();
      } else {
        const message = e.status === 401 || e.status === 403 ? 'Operator login required' : e.message;
        setRowErrors((errs) => ({ ...errs, [hub.id]: message }));
      }
    } finally {
      setPending((p) => ({ ...p, [hub.id]: false }));
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Over-capacity donation hubs</h2>
          <p className="text-sm text-gray-500">Dispatch transport to clear hubs that can't accept more donations.</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-600">At or above</span>
          {THRESHOLDS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setThreshold(t)}
              className={`rounded-md px-2.5 py-1 font-medium ${
                threshold === t ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {t}%
            </button>
          ))}
        </div>
      </header>

      {error && <p className="px-4 py-3 text-sm text-red-700">Couldn't load hubs: {error}</p>}

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2">Hub</th>
              <th className="px-4 py-2">Capacity</th>
              <th className="px-4 py-2">Stock on hand</th>
              <th className="px-4 py-2">Updated</th>
              <th className="px-4 py-2 text-right">Transport</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && hubs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">Loading…</td>
              </tr>
            ) : hubs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">No hubs at or above {threshold}%.</td>
              </tr>
            ) : (
              hubs.map((hub) => (
                <tr key={hub.id} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{hub.name}</div>
                    <div className="text-xs text-gray-500">
                      {TYPES[hub.type] ?? 'Hub'} · {hub.address}
                    </div>
                    <div className="text-xs text-gray-400">
                      {hub.latitude.toFixed(4)}, {hub.longitude.toFixed(4)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded bg-gray-200">
                        <div className={`h-full ${barColor(hub.capacity_pct)}`} style={{ width: `${hub.capacity_pct}%` }} />
                      </div>
                      <span className="font-semibold tabular-nums text-gray-900">{hub.capacity_pct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {hub.supplies.length === 0
                      ? '—'
                      : hub.supplies.map((s) => (
                          <div key={s.category} className="tabular-nums">
                            {s.category.replace('_', ' ')}: {s.quantity}
                            {s.quantity > s.target && <span className="ml-1 text-xs text-amber-700">(+{s.quantity - s.target} surplus)</span>}
                          </div>
                        ))}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatTime(hub.updated_at)}</td>
                  <td className="px-4 py-3 text-right">
                    {hub.open_pickup ? (
                      <div>
                        <span className="inline-flex rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">
                          Dispatched ✓
                        </span>
                        <div className="mt-1 text-xs text-gray-500">{formatTime(hub.open_pickup.created_at)}</div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={pending[hub.id]}
                        onClick={() => dispatch(hub)}
                        className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {pending[hub.id] ? 'Dispatching…' : 'Dispatch Transport Pickup'}
                      </button>
                    )}
                    {rowErrors[hub.id] && <div className="mt-1 text-xs text-red-700">{rowErrors[hub.id]}</div>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
