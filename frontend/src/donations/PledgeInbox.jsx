import { useCallback, useEffect, useState } from 'react';
import { API_BASE, fetchHubPledges, noShowPledge, receivePledge } from './api';
import { authMessage, itemsText, timeAgo } from './format';

/**
 * Incoming drop-off pledges for one hub. Receiving adds the items to inventory.
 * Props: hubId, token (that hub's staff, or an operator), apiBase, pollMs, onChange().
 */
export default function PledgeInbox({ hubId, token, apiBase = API_BASE, pollMs = 20000, onChange }) {
  const [pledges, setPledges] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    if (!hubId) return;
    try {
      setPledges(await fetchHubPledges(hubId, 'pending', { apiBase, token }));
      setError(null);
    } catch (e) {
      setError(authMessage(e));
    }
  }, [hubId, apiBase, token]);

  useEffect(() => {
    load();
    const id = setInterval(load, pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);

  const act = async (pledge, fn) => {
    setBusy(pledge.id);
    try {
      await fn(pledge.id, { apiBase, token });
      setPledges((list) => list.filter((p) => p.id !== pledge.id));
      onChange?.();
    } catch (e) {
      setError(authMessage(e));
      load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <header className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-lg font-semibold text-gray-900">Expected drop-offs</h2>
        <p className="text-sm text-gray-500">Confirm when donations arrive. Received items are added to your inventory.</p>
      </header>
      {error && <p className="px-4 py-3 text-sm text-red-700">{error}</p>}
      <ul className="divide-y divide-gray-100">
        {pledges.length === 0 && !error && <li className="px-4 py-4 text-sm text-gray-500">No pending drop-offs.</li>}
        {pledges.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <div className="font-medium text-gray-900">{itemsText(p.items)}</div>
              <div className="text-xs text-gray-500">
                {p.donor_email} · pledged {timeAgo(p.created_at)}
                {p.notes && ` · “${p.notes}”`}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy === p.id}
                onClick={() => act(p, receivePledge)}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                Received
              </button>
              <button
                type="button"
                disabled={busy === p.id}
                onClick={() => act(p, noShowPledge)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                No-show
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
