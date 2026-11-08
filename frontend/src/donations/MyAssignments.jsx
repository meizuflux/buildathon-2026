import { useCallback, useEffect, useState } from 'react';
import { API_BASE, fetchRequests, fulfillRequest, releaseRequest } from './api';
import { authMessage, itemsText, timeAgo } from './format';

function directionsUrl(r) {
  const hub = `${r.hub.latitude},${r.hub.longitude}`;
  const citizen = `${r.latitude},${r.longitude}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${hub}&destination=${citizen}`;
}

/**
 * Requests the signed-in worker has claimed: where to collect goods, where they go, and closing actions.
 * Props: token (operator), apiBase, refreshKey (change to reload), onChange().
 */
export default function MyAssignments({ token, apiBase = API_BASE, refreshKey, onChange }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      setItems(await fetchRequests({ status: 'assigned', assignedToMe: true }, { apiBase, token }));
      setError(null);
    } catch (e) {
      setError(authMessage(e));
    }
  }, [apiBase, token]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const act = async (item, fn) => {
    setBusy(item.id);
    try {
      await fn(item.id, { apiBase, token });
      setError(null);
      onChange?.();
    } catch (e) {
      setError(authMessage(e));
    } finally {
      setBusy(null);
      load();
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <header className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-lg font-semibold text-gray-900">My assignments</h2>
        <p className="text-sm text-gray-500">Marking a request fulfilled removes the items from the hub's inventory.</p>
      </header>
      {error && <p className="px-4 py-3 text-sm text-red-700">{error}</p>}
      <ul className="divide-y divide-gray-100">
        {items.length === 0 && !error && <li className="px-4 py-4 text-sm text-gray-500">Nothing assigned to you.</li>}
        {items.map((r) => (
          <li key={r.id} className="space-y-2 px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold text-gray-900">{itemsText(r.items)}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  r.method === 'delivery' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                }`}
              >
                {r.method === 'delivery' ? 'Delivery' : 'Citizen pickup'}
              </span>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-gray-500">Collect from</dt>
              <dd className="text-gray-900">
                {r.hub.name}, {r.hub.address}
              </dd>
              <dt className="text-gray-500">{r.method === 'delivery' ? 'Deliver to' : 'Citizen at'}</dt>
              <dd className="text-gray-900">{r.address || `${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}`}</dd>
              {r.notes && (
                <>
                  <dt className="text-gray-500">Notes</dt>
                  <dd className="italic text-gray-700">{r.notes}</dd>
                </>
              )}
              <dt className="text-gray-500">Requested</dt>
              <dd className="text-gray-700">{timeAgo(r.created_at)}</dd>
            </dl>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => act(r, fulfillRequest)}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {r.method === 'delivery' ? 'Mark delivered' : 'Mark picked up'}
              </button>
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => act(r, releaseRequest)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Release to queue
              </button>
              {r.method === 'delivery' && (
                <a
                  href={directionsUrl(r)}
                  target="_blank"
                  rel="noreferrer"
                  className="px-1 py-1.5 text-sm font-medium text-blue-700 hover:underline"
                >
                  Directions ↗
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
