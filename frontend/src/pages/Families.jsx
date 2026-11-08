import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { api } from '../api/index.js'
import { useData } from '../data.jsx'
import { Empty, PageHeader } from '../components/ui.jsx'
import { timeAgo } from '../lib/format.js'

const PAGE_SIZE = 50

export default function Families() {
  const d = useData()
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState(null)
  const [plans, setPlans] = useState({})
  const [error, setError] = useState(null)
  const [planError, setPlanError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => { setOffset(0); setPage(null); setPlans({}); setNotice(null) }, [d.disasterId])
  useEffect(() => {
    if (!d.disasterId) return
    let active = true
    setPage(null); setPlans({}); setError(null); setPlanError(null)
    api.listFamilies(d.disasterId, PAGE_SIZE, offset).then((result) => { if (active) setPage(result) }).catch((err) => { if (active) setError(err.message) })
    async function loadPlans() {
      const all = {}; let position = 0; let result
      do {
        result = await api.listPlans(d.disasterId, 1000, position)
        for (const plan of result.plans) all[plan.family_id] = plan
        position += result.plans.length
      } while (result.plans.length && position < result.total)
      if (active) setPlans(all)
    }
    loadPlans().catch((err) => { if (active) setPlanError(err.message) })
    return () => { active = false }
  }, [d.disasterId, offset, revision])
  const recompute = useCallback(async () => {
    const family = page?.families[0]
    if (!family || !confirm('Recompute plans for every family in this disaster? Assignments may change.')) return
    setBusy(true); setError(null); setNotice(null)
    try {
      await d.mutate((client) => client.generatePlan(family.id))
      setNotice('Plans recomputed for this disaster.'); setRevision((v) => v + 1)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }, [d, page])

  return <div className="page">
    <PageHeader title="Families" subtitle="Households and their current shelter assignments for this disaster.">
      <button className="btn btn-primary" disabled={!page?.families.length || busy} onClick={recompute}><RefreshCw size={15} /> {busy ? 'Recomputing…' : 'Recompute all plans'}</button>
    </PageHeader>
    <p className="muted small">Recomputing considers every family in the disaster and may change assignments. Profile and shelter changes also trigger recomputation automatically.</p>
    {notice && <p className="success" role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {planError && <p className="error" role="alert">Plans could not be loaded: {planError}</p>}
    <div className="card-panel flush table-scroll"><table className="table">
      <thead><tr><th>Family</th><th>Household</th><th>Assigned shelter</th><th>Plan alerts</th><th>Updated</th></tr></thead>
      <tbody>
        {!page && !error && <tr><td colSpan={5}><Empty>Loading families…</Empty></td></tr>}
        {page && page.families.length === 0 && <tr><td colSpan={5}><Empty>No families on this page.</Empty></td></tr>}
        {page?.families.map((family) => {
          const plan = plans[family.id]
          return <tr key={family.id}><td><Link className="strong-link" to={`/families/${encodeURIComponent(family.id)}`}>{family.id}</Link></td><td>{family.adults} adults · {family.children} children</td><td>{plan?.shelter?.name || (plan ? 'No match' : planError ? 'Unavailable' : '—')}</td><td>{plan ? plan.alerts.length : '—'}</td><td className="muted small">{timeAgo(family.updated_at)}</td></tr>
        })}
      </tbody>
    </table></div>
    {page && <div className="alerts-pagination"><button className="btn btn-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Previous</button><span className="muted small">{page.total ? `${offset + 1}–${offset + page.families.length} of ${page.total}` : '0 families'}</span><button className="btn btn-sm" disabled={offset + page.families.length >= page.total} onClick={() => setOffset(offset + PAGE_SIZE)}>Next</button></div>}
  </div>
}
