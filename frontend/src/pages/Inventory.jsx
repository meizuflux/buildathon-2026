import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../data.jsx'
import { Empty, PageHeader } from '../components/ui.jsx'
import { CATEGORIES } from '../lib/constants.js'
import { available, coverageByResource } from '../lib/logistics.js'

export default function Inventory() {
  const d = useData()
  const [onlyNeeded, setOnlyNeeded] = useState(false)
  const [category, setCategory] = useState('all')

  const holders = useMemo(
    () => d.organizations.filter((o) => d.inventory.some((r) => r.holder.id === o.id)),
    [d.organizations, d.inventory],
  )
  const cell = useMemo(() => {
    const m = {}
    for (const r of d.inventory) m[`${r.holder.id}:${r.resource_type_id}`] = r
    return m
  }, [d.inventory])
  const coverage = useMemo(() => Object.fromEntries(coverageByResource(d).map((c) => [c.resource_type_id, c])), [d])

  const groups = Object.entries(CATEGORIES)
    .filter(([k]) => category === 'all' || k === category)
    .map(([k, label]) => [label, d.resourceTypes.filter((r) => r.category === k && (!onlyNeeded || coverage[r.id]?.needed > 0))])
    .filter(([, list]) => list.length)

  return (
    <div className="page">
      <PageHeader title="Inventory" subtitle="Spare stock across every organization, against open demand. Click a holder to adjust their counts." />

      <div className="toolbar">
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="all">All categories</option>
          {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={onlyNeeded} onChange={(e) => setOnlyNeeded(e.target.checked)} /> Only resources with open needs</label>
      </div>

      {groups.length === 0 ? <Empty>Nothing to show.</Empty> : (
        <div className="table-scroll card-panel flush">
          <table className="table matrix">
            <thead>
              <tr>
                <th className="sticky-col">Resource</th>
                {holders.map((o) => <th key={o.id} className="num holder"><Link to={`/organizations/${o.id}`}>{o.name}</Link></th>)}
                <th className="num sep">Total free</th>
                <th className="num">Open demand</th>
                <th className="num">On the way</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(([label, list]) => (
                <Fragment key={label}>
                  <tr className="group-row"><td colSpan={holders.length + 5}>{label}</td></tr>
                  {list.map((r) => {
                    const c = coverage[r.id] || { available: 0, needed: 0, inTransit: 0, uncovered: 0 }
                    const short = c.uncovered - c.available
                    return (
                      <tr key={r.id}>
                        <td className="sticky-col">{r.name} <span className="muted small">({r.unit})</span></td>
                        {holders.map((o) => {
                          const row = cell[`${o.id}:${r.id}`]
                          return (
                            <td key={o.id} className={`num ${row ? '' : 'muted'}`}>
                              {row ? <>{available(row)}{row.reserved > 0 && <div className="muted small">{row.reserved} reserved</div>}</> : '—'}
                            </td>
                          )
                        })}
                        <td className="num sep"><strong>{c.available}</strong></td>
                        <td className="num">{c.needed || '—'}</td>
                        <td className="num">{c.inTransit || '—'}</td>
                        <td>
                          {!c.needed ? <span className="muted small">No demand</span>
                            : c.uncovered === 0 ? <span className="badge lvl-ok">Covered</span>
                            : short > 0 ? <span className="badge lvl-full">Short {short}</span>
                            : <Link to="/logistics/needs" className="badge lvl-low">Dispatch {c.uncovered}</Link>}
                        </td>
                      </tr>
                    )
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
