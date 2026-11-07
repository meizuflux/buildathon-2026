import { useCallback, useEffect, useState } from 'react';
import { API_BASE, claimRequest, fetchRequests } from './api';
import { authMessage, itemsText, timeAgo } from './format';

function RequestCard({ item, onClaim, busy, error }) {
  const [hubId, setHubId] = useState(item.suggested_hubs?.[0]?.id ?? '');
  const [method, setMethod] = useState('delivery');
  const options = item.suggested_hubs ?? [];
  return (
    <li className="space-y-3 rounded-lg border border-gray-200 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-semibold text-gray-900">{itemsText(item.items)}</div>
        <div className="text-xs text-gray-500">{timeAgo(item.created_at)}</div>
      </div>
      <div className="text-sm text-gray-600">
        {item.address || `${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`}
        {item.notes && <div className="mt-1 italic text-gray-500">“{item.notes}”</div>}
      </div>

      {options.length === 0 ? (
        <p className="text-sm text-amber-700">No hub has enough stock for this request right now.</p>
      ) : (
        <fieldset className="space-y-1">
          <legend className="text-xs font-medium uppercase tracking-wide text-gray-500">Source hub</legend>
          {options.map((hub) => (
            <label key={hub.id} className="flex items-center gap-2 text-sm">
              <input type="radio" name={`hub-${item.id}`} checked={hubId === hub.id} onChange={() => setHubId(hub.id)} />
              <span className="text-gray-900">{hub.name}</span>
              <span className="text-gray-500">{hub.distance_km.toFixed(1)} km</span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-md border border-gray-300 text-sm">
          {[
            ['delivery', 'Deliver to citizen'],
            ['pickup', 'Citizen picks up'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMethod(key)}
              className={`px-3 py-1.5 ${method === key ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={!hubId || busy}
          onClick={() => onClaim(item, hubId, method)}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? 'Claiming…' : 'Claim request'}
        </button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </li>
  );
}

/**
 * Open citizen requests, oldest first, with hubs that can cover each one.
 * A worker picks a hub and delivery method, then claims the request.
 * Props: token (operator), apiBase, pollMs, onClaimed(request).
 */
export default function RequestQueue({ token, apiBase = API_BASE, pollMs = 20000, onClaimed }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [rowErrors, setRowErrors] = useState({});

  const load = useCallback(async () => {
    try {
      setItems(await fetchRequests({ status: 'open' }, { apiBase, token }));
      setError(null);
    } catch (e) {
      setError(authMessage(e));
    }
  }, [apiBase, token]);

  useEffect(() => {
    load();
    const id = setInterval(load, pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);

  const claim = async (item, hubId, method) => {
    setBusy(item.id);
    setRowErrors((e) => ({ ...e, [item.id]: null }));
    try {
      const claimed = await claimRequest(item.id, hubId, method, { apiBase, token });
      setItems((list) => list.filter((r) => r.id !== item.id));
      onClaimed?.(claimed);
    } catch (e) {
      setRowErrors((errs) => ({ ...errs, [item.id]: authMessage(e) }));
      if (e.code === 'request_not_open') load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <header className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-lg font-semibold text-gray-900">Citizen requests</h2>
        <p className="text-sm text-gray-500">{items.length} open, oldest first. Claim one to take responsibility for it.</p>
      </header>
      {error && <p className="px-4 py-3 text-sm text-red-700">{error}</p>}
      <ul className="space-y-3 p-4">
        {items.length === 0 && !error && <li className="text-sm text-gray-500">No open requests.</li>}
        {items.map((item) => (
          <RequestCard key={item.id} item={item} onClaim={claim} busy={busy === item.id} error={rowErrors[item.id]} />
        ))}
      </ul>
    </section>
  );
}
