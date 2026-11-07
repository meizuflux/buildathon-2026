import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useData } from '../data.jsx'
import { Empty, PageHead } from '../components/ui.jsx'
import { CATEGORIES } from '../lib/constants.js'
import { available, timeAgo } from '../lib/format.js'

// Organization-only: stock counts. Reserved stock is committed to approved shipments.
export default function Inventory() {
  const d = useData()
  const rows = useMemo(() => [...d.inventory].sort((a, b) => d.rt(a.resource_type_id).category.localeCompare(d.rt(b.resource_type_id).category)), [d])
  const [edits, setEdits] = useState({})
  const [adding, setAdding] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const dirty = Object.keys(edits).length > 0
  const newRows = Object.keys(edits).filter((k) => !rows.some((r) => r.resource_type_id === k))
  const missing = d.resourceTypes.filter((r) => !rows.some((x) => x.resource_type_id === r.id) && !(r.id in edits))

  async function save() {
    setBusy(true)
    setMsg(null)
    try {
      await d.mutate((api) => api.setInventory(d.site.id, Object.entries(edits).map(([resource_type_id, q]) => ({ resource_type_id, quantity: Number(q) || 0 }))))
      setEdits({})
      setMsg({ ok: 'Stock updated. The operations center sees these counts now.' })
    } catch (e) {
      setMsg({ error: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page narrow">
      <PageHead title="Inventory" subtitle="Keep counts current so operations can route supplies through you. Reserved stock is promised to approved shipments.">
        {dirty && <button className="btn" onClick={() => setEdits({})}>Discard</button>}
        <button className="btn btn-primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : 'Save counts'}</button>
      </PageHead>
      {msg?.error && <p className="error">{msg.error}</p>}
      {msg?.ok && <p className="success">{msg.ok}</p>}

      <section className="card-panel flush table-scroll">
        {rows.length + newRows.length === 0 ? <Empty>No stock recorded yet. Add what you have below.</Empty> : (
          <table className="table">
            <thead><tr><th>Resource</th><th className="num">On hand</th><th className="num">Reserved</th><th className="num">Free to send</th><th className="hide-sm">Updated</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const t = d.rt(r.resource_type_id)
                const changed = r.resource_type_id in edits
                const val = edits[r.resource_type_id] ?? r.quantity
                return (
                  <tr key={r.resource_type_id} className={changed ? 'changed' : ''}>
                    <td>{t.name}<div className="muted small">{CATEGORIES[t.category]} · {t.unit}</div></td>
                    <td className="num"><input className="qty" type="number" min={r.reserved} value={val} aria-label={`${t.name} on hand`}
                      onChange={(e) => setEdits((x) => ({ ...x, [r.resource_type_id]: e.target.value }))} /></td>
                    <td className="num">{r.reserved || '—'}</td>
                    <td className="num"><strong>{changed ? Math.max(0, Number(val) - r.reserved) : available(r)}</strong></td>
                    <td className="muted small nowrap hide-sm">{timeAgo(r.updated_at)}</td>
                  </tr>
                )
              })}
              {newRows.map((k) => (
                <tr key={k} className="changed">
                  <td>{d.rt(k).name} <span className="muted small">(new)</span></td>
                  <td className="num"><input className="qty" type="number" min="0" value={edits[k]} onChange={(e) => setEdits((x) => ({ ...x, [k]: e.target.value }))} /></td>
                  <td className="num">—</td><td className="num">{edits[k] || 0}</td><td className="hide-sm" />
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <div className="add-item">
        <select value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Add a resource">
          <option value="">Add a resource you stock…</option>
          {missing.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.unit})</option>)}
        </select>
        <button className="btn" disabled={!adding} onClick={() => { setEdits((x) => ({ ...x, [adding]: 0 })); setAdding('') }}><Plus size={14} /> Add</button>
      </div>
    </div>
  )
}
