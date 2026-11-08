import { useState } from 'react';
import { API_BASE, logWalkIn } from './api';
import { RESOURCE_LABELS, RESOURCE_TYPES, authMessage } from './format';

/**
 * Log goods that arrived without a pledge in the app (someone just walked in with them).
 * Everything else about the hub's stock updates automatically.
 * Props: hubId, token (that hub's staff, or an operator), apiBase, onSaved(hub).
 */
export default function WalkInForm({ hubId, token, apiBase = API_BASE, onSaved }) {
  const [resource, setResource] = useState(RESOURCE_TYPES[0][0]);
  const [quantity, setQuantity] = useState(1);
  const [items, setItems] = useState({});
  const [state, setState] = useState({ kind: 'idle' });
  const lines = Object.entries(items);

  const add = () => {
    const amount = Math.max(1, Math.min(100000, Number.parseInt(quantity, 10) || 0));
    setItems((current) => ({ ...current, [resource]: (current[resource] ?? 0) + amount }));
    setQuantity(1);
    setState({ kind: 'idle' });
  };

  const save = async () => {
    setState({ kind: 'saving' });
    try {
      const payload = lines.map(([resource_type_id, q]) => ({ resource_type_id, quantity: q }));
      const hub = await logWalkIn(hubId, payload, { apiBase, token });
      setItems({});
      setState({ kind: 'saved', count: payload.length });
      onSaved?.(hub);
    } catch (e) {
      setState({ kind: 'error', message: authMessage(e) });
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Log a walk-in donation</h2>
        <p className="text-sm text-gray-500">
          Only for goods that arrived without a pledge in the app. Pledged drop-offs, deliveries, and shipments update your
          stock automatically.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Item</span>
          <select
            value={resource}
            onChange={(e) => setResource(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
          >
            {RESOURCE_TYPES.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="w-24 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Quantity</span>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 tabular-nums"
          />
        </label>
        <button
          type="button"
          onClick={add}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Add
        </button>
      </div>
      {lines.length > 0 && (
        <ul className="divide-y divide-gray-100 rounded-md border border-gray-200 text-sm">
          {lines.map(([id, q]) => (
            <li key={id} className="flex items-center justify-between px-3 py-1.5">
              <span>
                {q} × {RESOURCE_LABELS[id]}
              </span>
              <button
                type="button"
                onClick={() => setItems(({ [id]: _, ...rest }) => rest)}
                className="text-xs text-gray-500 hover:text-red-700"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!lines.length || state.kind === 'saving'}
          onClick={save}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {state.kind === 'saving' ? 'Logging…' : 'Log drop-off'}
        </button>
        {state.kind === 'saved' && <span className="text-sm text-green-700">Added to stock ✓</span>}
        {state.kind === 'error' && <span className="text-sm text-red-700">{state.message}</span>}
      </div>
    </section>
  );
}
