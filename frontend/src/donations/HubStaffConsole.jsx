import { useEffect, useState } from 'react';
import { API_BASE, fetchHub } from './api';
import { HUB_TYPES, capacityHex } from './format';
import HubInventoryEditor from './HubInventoryEditor';
import PledgeInbox from './PledgeInbox';

function HubSummary({ hub }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{hub.name}</h2>
          <p className="text-sm text-gray-500">
            {HUB_TYPES[hub.type] ?? 'Hub'} · {hub.address}
          </p>
        </div>
        <span className="text-2xl font-bold tabular-nums" style={{ color: capacityHex(hub.capacity_pct) }}>
          {hub.capacity_pct}%
        </span>
      </div>
      {hub.open_pickup && (
        <p className="mt-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          A transport pickup is on its way to clear space.
        </p>
      )}
      <table className="mt-3 w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="py-1">Supply</th>
            <th className="py-1 text-right">On hand</th>
            <th className="py-1 text-right">Promised out</th>
            <th className="py-1 text-right">Incoming</th>
            <th className="py-1 text-right">Still needed</th>
          </tr>
        </thead>
        <tbody>
          {hub.supplies.map((s) => (
            <tr key={s.resource_type_id} className="border-t border-gray-100">
              <td className="py-1 text-gray-800">{s.name}</td>
              <td className="py-1 text-right tabular-nums">{s.quantity}</td>
              <td className="py-1 text-right tabular-nums text-gray-600">{s.reserved}</td>
              <td className="py-1 text-right tabular-nums text-gray-600">{s.pledged}</td>
              <td className={`py-1 text-right tabular-nums ${s.need ? 'font-semibold text-blue-700' : 'text-gray-400'}`}>{s.need}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/**
 * Hub staff view for one hub: live summary, incoming pledges, and the check-in form.
 * Props: hubId (from the staff user's /api/me), token, apiBase.
 */
export default function HubStaffConsole({ hubId, token, apiBase = API_BASE }) {
  const [hub, setHub] = useState(null);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  useEffect(() => {
    if (!hubId) return;
    fetchHub(hubId, { apiBase }).then(
      (h) => {
        setHub(h);
        setError(null);
      },
      (e) => setError(e.message),
    );
  }, [hubId, apiBase, version]);

  if (!hubId) return <p className="text-sm text-red-700">This account isn't linked to a hub.</p>;
  if (error) return <p className="text-sm text-red-700">Couldn't load hub: {error}</p>;
  if (!hub) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <HubSummary hub={hub} />
        <PledgeInbox hubId={hubId} token={token} apiBase={apiBase} onChange={refresh} />
      </div>
      <HubInventoryEditor key={version} hubId={hubId} token={token} apiBase={apiBase} onSaved={refresh} />
    </div>
  );
}
