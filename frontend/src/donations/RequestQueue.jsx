import { useCallback, useEffect, useState } from 'react';
import { API_BASE, claimRequest, fetchRequests } from './api';
import { authMessage, itemsText, timeAgo } from './format';

function Where({ item }) {
  return (
    <div className="text-sm text-gray-600">
      {item.address || `${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`}
      {item.notes && <div className="mt-1 italic text-gray-500">“{item.notes}”</div>}
    </div>
  );
}

function RequestCard({ item, onClaim, busy, error }) {
  const [method, setMethod] = useState('delivery');
  return (
    <li className="space-y-3 rounded-lg border border-gray-200 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-semibold text-gray-900">{itemsText(item.items)}</div>
        <div className="text-xs text-gray-500">{timeAgo(item.created_at)}</div>
      </div>
      <Where item={item} />
      <div className="rounded-md bg-green-50 px-3 py-2 text-sm">
        <div className="text-xs font-medium uppercase tracking-wide text-green-800">Matched hub (items reserved)</div>
        <div className="font-medium text-gray-900">{item.hub.name}</div>
        {item.match?.reasons && <div className="text-xs text-gray-600">{item.match.reasons.join(' · ')}</div>}
      </div>
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
          disabled={busy}
          onClick={() => onClaim(item, method)}
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
 * Citizen requests. Each is matched to the best hub automatically and its items reserved; a worker
 * claims a matched request and chooses delivery or pickup. Requests no hub can cover yet are listed
 * as waiting and are matched automatically when stock arrives.
 * Props: token (operator), apiBase, pollMs, onClaimed(request).
 */
export default function RequestQueue({ token, apiBase = API_BASE, pollMs = 20000, onClaimed }) {
  const [matched, setMatched] = useState([]);
  const [waiting, setWaiting] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [rowErrors, setRowErrors] = useState({});

  const load = useCallback(async () => {
    try {
      const [ready, open] = await Promise.all([
        fetchRequests({ status: 'matched' }, { apiBase, token }),
        fetchRequests({ status: 'open' }, { apiBase, token }),
      ]);
      setMatched(ready);
      setWaiting(open);
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

  const claim = async (item, method) => {
    setBusy(item.id);
    setRowErrors((e) => ({ ...e, [item.id]: null }));
    try {
      const claimed = await claimRequest(item.id, method, { apiBase, token });
      setMatched((list) => list.filter((r) => r.id !== item.id));
      onClaimed?.(claimed);
    } catch (e) {
      setRowErrors((errs) => ({ ...errs, [item.id]: authMessage(e) }));
      if (e.code === 'request_not_matched') load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <header className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-lg font-semibold text-gray-900">Citizen requests</h2>
        <p className="text-sm text-gray-500">
          {matched.length} ready to claim, {waiting.length} waiting for supplies. Hubs are matched automatically.
        </p>
      </header>
      {error && <p className="px-4 py-3 text-sm text-red-700">{error}</p>}
      <ul className="space-y-3 p-4">
        {matched.length === 0 && !error && <li className="text-sm text-gray-500">No requests waiting for a worker.</li>}
        {matched.map((item) => (
          <RequestCard key={item.id} item={item} onClaim={claim} busy={busy === item.id} error={rowErrors[item.id]} />
        ))}
      </ul>
      {waiting.length > 0 && (
        <div className="border-t border-gray-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-amber-800">Waiting for supplies</h3>
          <p className="mb-2 text-xs text-gray-500">No hub can cover these yet. They'll be matched as soon as stock arrives.</p>
          <ul className="space-y-2">
            {waiting.map((item) => (
              <li key={item.id} className="rounded-md bg-amber-50 px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-gray-900">{itemsText(item.items)}</span>
                  <span className="text-xs text-gray-500">{timeAgo(item.created_at)}</span>
                </div>
                <Where item={item} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
