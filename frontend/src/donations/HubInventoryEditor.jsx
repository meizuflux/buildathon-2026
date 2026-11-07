import { useEffect, useMemo, useState } from 'react';
import { API_BASE, fetchHubs, updateInventory } from './api';

const CATEGORIES = [
  ['water', 'Water'],
  ['diapers', 'Diapers'],
  ['formula', 'Formula'],
  ['canned_goods', 'Canned goods'],
  ['blankets', 'Blankets'],
];

function formFromHub(hub) {
  const byCategory = Object.fromEntries((hub?.supplies ?? []).map((s) => [s.category, s]));
  return {
    capacity: hub?.capacity_pct ?? 0,
    supplies: Object.fromEntries(
      CATEGORIES.map(([key]) => [key, { quantity: byCategory[key]?.quantity ?? 0, target: byCategory[key]?.target ?? 0 }]),
    ),
  };
}

const toCount = (value) => Math.max(0, Math.min(1000000, Number.parseInt(value, 10) || 0));

/**
 * Hub check-in form: log storage capacity and supply levels for one hub.
 * Props: token (operator bearer token), apiBase, hubId (preselect; otherwise a picker is shown), onSaved(hub).
 */
export default function HubInventoryEditor({ token, apiBase = API_BASE, hubId, onSaved }) {
  const [hubs, setHubs] = useState([]);
  const [selected, setSelected] = useState(hubId ?? '');
  const [form, setForm] = useState(formFromHub(null));
  const [status, setStatus] = useState({ kind: 'idle' });

  useEffect(() => {
    fetchHubs(0, { apiBase })
      .then((list) => {
        setHubs(list.sort((a, b) => a.name.localeCompare(b.name)));
        setSelected((current) => current || list[0]?.id || '');
      })
      .catch((e) => setStatus({ kind: 'error', message: e.message }));
  }, [apiBase]);

  const hub = useMemo(() => hubs.find((h) => h.id === selected), [hubs, selected]);
  useEffect(() => setForm(formFromHub(hub)), [hub]);

  const setSupply = (key, field, value) =>
    setForm((f) => ({ ...f, supplies: { ...f.supplies, [key]: { ...f.supplies[key], [field]: toCount(value) } } }));

  const save = async (event) => {
    event.preventDefault();
    setStatus({ kind: 'saving' });
    try {
      const supplies = CATEGORIES.map(([category]) => ({ category, ...form.supplies[category] }));
      const saved = await updateInventory(selected, form.capacity, supplies, { apiBase, token });
      setHubs((list) => list.map((h) => (h.id === saved.id ? saved : h)));
      setStatus({ kind: 'saved' });
      onSaved?.(saved);
    } catch (e) {
      const message = e.status === 401 || e.status === 403 ? 'Operator login required' : e.message;
      setStatus({ kind: 'error', message });
    }
  };

  const capacityColor = form.capacity >= 90 ? 'accent-red-600' : form.capacity >= 70 ? 'accent-amber-500' : 'accent-green-600';

  return (
    <form onSubmit={save} className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Hub check-in</h2>
        <p className="text-sm text-gray-500">Log how full the hub is and what's on hand. Citizens see this right away.</p>
      </div>

      {!hubId && (
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Hub</span>
          <select
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setStatus({ kind: 'idle' });
            }}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
          >
            {hubs.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block text-sm">
        <span className="flex justify-between font-medium text-gray-700">
          Storage used <span className="tabular-nums">{form.capacity}%</span>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={form.capacity}
          onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value) }))}
          className={`mt-2 w-full ${capacityColor}`}
        />
      </label>

      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="py-1">Supply</th>
            <th className="py-1">On hand</th>
            <th className="py-1">Target</th>
            <th className="py-1 text-right">Need</th>
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.map(([key, label]) => {
            const { quantity, target } = form.supplies[key];
            const need = Math.max(target - quantity, 0);
            return (
              <tr key={key}>
                <td className="py-1 pr-2 font-medium text-gray-700">{label}</td>
                {['quantity', 'target'].map((field) => (
                  <td key={field} className="py-1 pr-2">
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={form.supplies[key][field]}
                      onChange={(e) => setSupply(key, field, e.target.value)}
                      aria-label={`${label} ${field === 'quantity' ? 'on hand' : 'target'}`}
                      className="w-24 rounded-md border border-gray-300 px-2 py-1 tabular-nums"
                    />
                  </td>
                ))}
                <td className={`py-1 text-right tabular-nums ${need > 0 ? 'font-semibold text-blue-700' : 'text-gray-400'}`}>{need}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!selected || status.kind === 'saving'}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {status.kind === 'saving' ? 'Saving…' : 'Save check-in'}
        </button>
        {status.kind === 'saved' && <span className="text-sm text-green-700">Saved ✓</span>}
        {status.kind === 'error' && <span className="text-sm text-red-700">{status.message}</span>}
      </div>
    </form>
  );
}
