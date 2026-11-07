import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronRight, PackagePlus, Truck } from 'lucide-react'
import { useData } from '../data.jsx'
import { Empty, PageHeader, PriorityBadge, Progress } from '../components/ui.jsx'
import ShipmentDialog from '../components/ShipmentDialog.jsx'
import NeedDialog from '../components/NeedDialog.jsx'
import { CATEGORIES, PRIORITIES, RESOURCE_KEYS } from '../lib/constants.js'
import { byPriority, needProgress, suggestSources } from '../lib/logistics.js'
import { cap, timeAgo } from '../lib/format.js'

export default function Needs() {
  const d = useData()
  const [params] = useSearchParams()
  const focus = params.get('focus')
  const [status, setStatus] = useState('open')
  const [priority, setPriority] = useState('all')
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(() => new Set(focus ? [focus] : []))
  const [ship, setShip] = useState(null)
  const [needDialog, setNeedDialog] = useState(null)

  useEffect(() => {
    if (focus) {
      setExpanded((s) => new Set([...s, focus]))
      setTimeout(() => document.getElementById(`need-${focus}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 200)
    }
  }, [focus, d.loaded])

  const rows = useMemo(() => d.needs
    .filter((n) => status === 'all' || n.status === status)
    .filter((n) => priority === 'all' || n.priority === priority)
    .filter((n) => category === 'all' || d.rt(n.resource_type_id).category === category)
    .filter((n) => !query || n.requester.name.toLowerCase().includes(query.toLowerCase()) || d.rt(n.resource_type_id).name.toLowerCase().includes(query.toLowerCase()))
    .map((n) => {
      const p = needProgress(n, d.shipments)
      const dest = d.site(n.requester)
      return { n, p, dest, sources: n.status === 'open' ? suggestSources(n, d, dest, p.uncovered) : [] }
    })
    .sort((a, b) => (a.p.uncovered > 0 ? 0 : 1) - (b.p.uncovered > 0 ? 0 : 1) || byPriority(a.n, b.n)),
  [d, status, priority, category, query])

  // Shelters reporting limited/unavailable supplies that nobody has logged a need for.
  const shortages = useMemo(() => {
    const out = []
    for (const s of d.shelters.filter((x) => x.status !== 'closed')) {
      for (const k of RESOURCE_KEYS) {
        const level = s.resources[k]
        if (level !== 'limited' && level !== 'unavailable') continue
        const covered = d.needs.some((n) => n.status === 'open' && n.requester.id === s.id && d.rt(n.resource_type_id).category === k)
        if (!covered) out.push({ shelter: s, category: k, level })
      }
    }
    return out
  }, [d])

  const openNeeds = d.needs.filter((n) => n.status === 'open')
  const uncovered = openNeeds.filter((n) => needProgress(n, d.shipments).uncovered > 0)
  const toggle = (id) => setExpanded((s) => { const x = new Set(s); x.has(id) ? x.delete(id) : x.add(id); return x })

  const dispatch = (n, p, src) => setShip({
    from: src ? { kind: 'organization', id: src.org.id } : undefined,
    to: { kind: n.requester.kind, id: n.requester.id },
    items: [{ resource_type_id: n.resource_type_id, quantity: src ? src.sendable : p.uncovered }],
    need_ids: [n.id],
    priority: n.priority,
  })
  const patch = (n, body) => d.mutate((api) => api.updateNeed(n.id, body)).catch((e) => alert(e.message))

  return (
    <div className="page">
      <PageHeader title="Resource needs" subtitle="What each shelter and organization needs, what's on the way, and who can fill the gap.">
        <button className="btn btn-primary" onClick={() => setNeedDialog({})}><PackagePlus size={15} /> Log need</button>
      </PageHeader>

      <div className="summary-strip">
        <div><strong>{openNeeds.length}</strong> open needs</div>
        <div className="tone-alert"><strong>{uncovered.filter((n) => n.priority === 'critical').length}</strong> critical without full coverage</div>
        <div><strong>{uncovered.length}</strong> need dispatch</div>
        <div><strong>{d.shipments.filter((s) => ['approved', 'in_transit'].includes(s.status)).length}</strong> shipments active</div>
      </div>

      {shortages.length > 0 && (
        <section className="callout">
          <div className="callout-title">Reported shortages with no logged need ({shortages.length})</div>
          <div className="callout-items">
            {shortages.map(({ shelter, category: c, level }) => (
              <div key={`${shelter.id}-${c}`} className="callout-item">
                <span className={`chip res-${level}`}>{cap(c)}</span>
                <span>{shelter.name}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setNeedDialog({
                  requester: { kind: 'shelter', id: shelter.id },
                  resource_type_id: d.resourceTypes.find((r) => r.category === c)?.id,
                  priority: level === 'unavailable' ? 'high' : 'medium',
                  notes: `Shelter reports ${c} ${level}.`,
                })}>Log need</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="toolbar">
        <input type="search" placeholder="Search requester or resource" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search needs" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="open">Open</option><option value="fulfilled">Fulfilled</option><option value="cancelled">Cancelled</option><option value="all">All statuses</option>
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
          <option value="all">All priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{cap(p)}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="all">All categories</option>
          {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="need-list">
        {rows.length === 0 && <Empty>No needs match these filters.</Empty>}
        {rows.map(({ n, p, sources }) => {
          const r = d.rt(n.resource_type_id)
          const best = sources[0]
          const open = expanded.has(n.id)
          const overdue = n.needed_by && new Date(n.needed_by) < new Date() && n.status === 'open'
          return (
            <article key={n.id} id={`need-${n.id}`} className={`need ${n.id === focus ? 'focused' : ''} pri-edge-${n.priority} ${n.status !== 'open' ? 'is-closed' : ''}`}>
              <div className="need-main">
                <button className="icon-btn" onClick={() => toggle(n.id)} aria-expanded={open} aria-label="Show sources">
                  {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <div className="need-what">
                  <div className="need-title">
                    <PriorityBadge priority={n.priority} />
                    <strong>{n.quantity_needed} {r.unit}</strong> {r.name}
                  </div>
                  <div className="muted small">
                    for <Link to={n.requester.kind === 'organization' ? `/organizations/${n.requester.id}` : `/map?shelter=${n.requester.id}`}>{n.requester.name}</Link>
                    {' · '}logged {timeAgo(n.created_at)}
                    {n.needed_by && <span className={overdue ? 'tone-alert' : ''}> · needed {timeAgo(n.needed_by)}</span>}
                  </div>
                  {n.notes && <div className="need-notes">{n.notes}</div>}
                </div>
                <div className="need-progress">
                  <Progress total={n.quantity_needed} done={p.fulfilled} pending={p.inTransit} />
                  <div className="muted small">
                    {p.fulfilled} received · {p.inTransit} on the way · <strong className={p.uncovered ? 'tone-alert' : ''}>{p.uncovered} uncovered</strong>
                  </div>
                </div>
                <div className="need-best">
                  {n.status !== 'open' ? <span className={`badge st-${n.status}`}>{cap(n.status)}</span>
                    : p.uncovered === 0 ? <span className="badge lvl-ok">Fully covered</span>
                    : best ? (
                      <>
                        <div className="small"><strong>{best.org.name}</strong></div>
                        <div className="muted small">{best.available} free · {best.distance != null ? `${best.distance.toFixed(1)} km` : '—'}</div>
                      </>
                    ) : <span className="badge lvl-full">No stock anywhere</span>}
                </div>
                <div className="need-actions">
                  {n.status === 'open' && p.uncovered > 0 && (
                    <button className="btn btn-primary btn-sm" onClick={() => dispatch(n, p, best)}><Truck size={14} /> Dispatch</button>
                  )}
                </div>
              </div>

              {open && (
                <div className="need-detail">
                  <div>
                    <h3>Suggested sources</h3>
                    {sources.length === 0 ? <p className="muted small">No organization has this in stock. Contact suppliers or log a request with the county depot.</p> : (
                      <div className="table-scroll"><table className="table compact">
                        <thead><tr><th>Organization</th><th className="num">Free stock</th><th className="num">Distance</th><th className="num">Covers</th><th /></tr></thead>
                        <tbody>
                          {sources.slice(0, 4).map((s, i) => (
                            <tr key={s.org.id}>
                              <td>{i === 0 && <span className="badge lvl-ok">Best</span>} <Link to={`/organizations/${s.org.id}`}>{s.org.name}</Link>{s.org.status === 'limited' && <span className="muted small"> (limited)</span>}</td>
                              <td className="num">{s.available}</td>
                              <td className="num">{s.distance != null ? `${s.distance.toFixed(1)} km` : '—'}</td>
                              <td className="num">{Math.round(s.coverage * 100)}%</td>
                              <td className="num"><button className="btn btn-sm" disabled={n.status !== 'open'} onClick={() => dispatch(n, p, s)}>Send {s.sendable}</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table></div>
                    )}
                  </div>
                  <div>
                    <h3>Shipments</h3>
                    {p.shipments.length === 0 ? <p className="muted small">None yet.</p> : (
                      <ul className="plain">
                        {p.shipments.map((s) => <li key={s.id} className="small"><Link to="/logistics/dispatch">{s.from.name}</Link> · {cap(s.status.replace('_', ' '))}</li>)}
                      </ul>
                    )}
                    <h3>Manage</h3>
                    <div className="manage">
                      <select value={n.priority} onChange={(e) => patch(n, { priority: e.target.value })} aria-label="Change priority">
                        {PRIORITIES.map((x) => <option key={x} value={x}>{cap(x)}</option>)}
                      </select>
                      {n.status === 'open' ? (
                        <>
                          <button className="btn btn-sm" onClick={() => patch(n, { status: 'fulfilled', quantity_fulfilled: n.quantity_needed })}>Mark fulfilled</button>
                          <button className="btn btn-sm danger" onClick={() => confirm('Cancel this need?') && patch(n, { status: 'cancelled' })}>Cancel need</button>
                        </>
                      ) : (
                        <button className="btn btn-sm" onClick={() => patch(n, { status: 'open' })}>Reopen</button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>

      {ship && <ShipmentDialog initial={ship} onClose={() => setShip(null)} />}
      {needDialog && <NeedDialog initial={needDialog} onClose={() => setNeedDialog(null)} />}
    </div>
  )
}
