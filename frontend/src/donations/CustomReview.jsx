import { useCallback, useEffect, useState } from 'react';
import { API_BASE, approveCustom, completeCustom, declineCustom, fetchCustom, fetchHubs } from './api';
import { authMessage, timeAgo } from './format';

function KindBadge({ kind }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
        kind === 'donation' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
      }`}
    >
      {kind === 'donation' ? 'Donation offer' : 'Request'}
    </span>
  );
}

function PendingCard({ item, hubs, onApprove, onDecline, busy, error }) {
  const suggested = item.nearby_hubs ?? [];
  const [hubId, setHubId] = useState(suggested[0]?.id ?? '');
  const [message, setMessage] = useState('');
  const nearbyIds = new Set(suggested.map((h) => h.id));
  const others = hubs.filter((h) => !nearbyIds.has(h.id));
  return (
    <li className="space-y-3 rounded-lg border border-gray-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <KindBadge kind={item.kind} />
          <span className="font-semibold text-gray-900">
            {item.quantity} × {item.description}
          </span>
        </div>
        <span className="text-xs text-gray-500">{timeAgo(item.created_at)}</span>
      </div>
      <div className="text-sm text-gray-600">
        {item.citizen_email}
        {item.notes && <div className="mt-1 italic text-gray-500">“{item.notes}”</div>}
      </div>
      <label className="block text-sm">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {item.kind === 'donation' ? 'Drop-off hub' : 'Assigned hub'}
        </span>
        <select
          value={hubId}
          onChange={(e) => setHubId(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
        >
          {suggested.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name} — {h.distance_km.toFixed(1)} km, {h.capacity_pct}% full
            </option>
          ))}
          {others.length > 0 && (
            <optgroup label="Other hubs">
              {others.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={2}
        maxLength={1000}
        placeholder={
          item.kind === 'donation'
            ? 'Instructions for the donor, e.g. "Bring it to the side door after 3pm."'
            : 'Instructions for the citizen, e.g. "We\'ll deliver it tomorrow morning."'
        }
        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !hubId || !message.trim()}
          onClick={() => onApprove(item, hubId, message.trim())}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={busy || !message.trim()}
          onClick={() => onDecline(item, message.trim())}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Decline
        </button>
        <span className="self-center text-xs text-gray-500">A message is required either way.</span>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </li>
  );
}

/**
 * Incoming custom donations and requests (items outside the catalog). Approve with a hub and
 * instructions, or decline with a reason; mark approved items completed once handed over.
 * Props: token (operator), apiBase, pollMs.
 */
export default function CustomReview({ token, apiBase = API_BASE, pollMs = 20000 }) {
  const [pending, setPending] = useState([]);
  const [approved, setApproved] = useState([]);
  const [hubs, setHubs] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [rowErrors, setRowErrors] = useState({});

  const load = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([
        fetchCustom('pending', { apiBase, token }),
        fetchCustom('approved', { apiBase, token }),
      ]);
      setPending(p);
      setApproved(a);
      setError(null);
    } catch (e) {
      setError(authMessage(e));
    }
  }, [apiBase, token]);

  useEffect(() => {
    fetchHubs(0, { apiBase }).then(setHubs, () => setHubs([]));
  }, [apiBase]);

  useEffect(() => {
    load();
    const id = setInterval(load, pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);

  const act = async (item, fn) => {
    setBusy(item.id);
    setRowErrors((e) => ({ ...e, [item.id]: null }));
    try {
      await fn();
      await load();
    } catch (e) {
      setRowErrors((errs) => ({ ...errs, [item.id]: authMessage(e) }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <header className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-gray-900">Incoming custom items</h2>
          <p className="text-sm text-gray-500">
            {pending.length} awaiting review. These are outside the standard list, so pick a hub and tell the citizen what to do.
          </p>
        </header>
        {error && <p className="px-4 py-3 text-sm text-red-700">{error}</p>}
        <ul className="space-y-3 p-4">
          {pending.length === 0 && !error && <li className="text-sm text-gray-500">Nothing to review.</li>}
          {pending.map((item) => (
            <PendingCard
              key={item.id}
              item={item}
              hubs={hubs}
              busy={busy === item.id}
              error={rowErrors[item.id]}
              onApprove={(it, hubId, message) => act(it, () => approveCustom(it.id, hubId, message, { apiBase, token }))}
              onDecline={(it, message) => act(it, () => declineCustom(it.id, message, { apiBase, token }))}
            />
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <header className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-gray-900">Approved, in progress</h2>
          <p className="text-sm text-gray-500">Mark each one completed once it has been dropped off or handed over.</p>
        </header>
        <ul className="divide-y divide-gray-100">
          {approved.length === 0 && <li className="px-4 py-4 text-sm text-gray-500">Nothing in progress.</li>}
          {approved.map((item) => (
            <li key={item.id} className="space-y-1 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <KindBadge kind={item.kind} />
                <span className="font-medium text-gray-900">
                  {item.quantity} × {item.description}
                </span>
              </div>
              <div className="text-sm text-gray-600">
                {item.hub?.name} · {item.citizen_email}
              </div>
              {item.response && <div className="text-xs italic text-gray-500">“{item.response}”</div>}
              <button
                type="button"
                disabled={busy === item.id}
                onClick={() => act(item, () => completeCustom(item.id, { apiBase, token }))}
                className="mt-1 rounded-md bg-gray-900 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
              >
                Mark completed
              </button>
              {rowErrors[item.id] && <p className="text-xs text-red-700">{rowErrors[item.id]}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
