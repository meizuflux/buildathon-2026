import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { api } from '../api'
import type { FamilyPage, PlanPage } from '../api/types'
import { useData } from '../data'
import { timeAgo } from '../lib/format'
import { errorMessage } from '../lib/ops'
import { Empty, Head } from '../components/ui'

const PAGE_SIZE = 50
type ListedPlan = PlanPage['plans'][number]

export default function Families() {
  const d = useData()
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState<FamilyPage | null>(null)
  const [plans, setPlans] = useState<Record<string, ListedPlan>>({})
  const [error, setError] = useState<string | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => { setOffset(0); setPage(null); setPlans({}); setNotice(null) }, [d.disasterId])
  useEffect(() => {
    const disasterId = d.disasterId
    if (!disasterId) return
    let active = true
    setPage(null); setPlans({}); setError(null); setPlanError(null)
    api.listFamilies(disasterId, PAGE_SIZE, offset)
      .then((r) => { if (active) setPage(r) })
      .catch((e) => { if (active) setError(errorMessage(e)) })
    async function loadPlans(id: string) {
      const all: Record<string, ListedPlan> = {}
      let position = 0
      for (;;) {
        const result = await api.listPlans(id, 1000, position)
        for (const plan of result.plans) all[plan.family_id] = plan
        position += result.plans.length
        if (!result.plans.length || position >= result.total) break
      }
      if (active) setPlans(all)
    }
    loadPlans(disasterId).catch((e) => { if (active) setPlanError(errorMessage(e)) })
    return () => { active = false }
  }, [d.disasterId, offset, revision])

  const recompute = useCallback(async () => {
    const family = page?.families[0]
    if (!family || !confirm('Recompute plans for every family in this disaster? Assignments may change.')) return
    setBusy(true); setError(null); setNotice(null)
    try {
      await d.mutate((client) => client.generatePlan(family.id))
      setNotice('Plans recomputed for this disaster.')
      setRevision((v) => v + 1)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }, [d, page])

  return (
    <div className="hx-page">
      <Head title="Families" sub="Households in this disaster and the shelter each one is assigned to. Profile and shelter changes recompute plans automatically.">
        <button className="btn btn-primary" disabled={!page?.families.length || busy} onClick={recompute}><RefreshCw size={14} /> {busy ? 'Recomputing…' : 'Recompute all plans'}</button>
      </Head>
      {notice && <p className="notice notice-ok" role="status">{notice}</p>}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {planError && <p className="notice notice-error" role="alert">Plans could not be loaded: {planError}</p>}

      <section className="hx-panel">
        <div className="hx-table-wrap">
          <table className="hx-table">
            <thead><tr><th>Family</th><th>Household</th><th>Needs</th><th>Assigned shelter</th><th className="num">Plan alerts</th><th>Updated</th></tr></thead>
            <tbody>
              {!page && !error && <tr><td colSpan={6}><Empty>Loading families…</Empty></td></tr>}
              {page && page.families.length === 0 && <tr><td colSpan={6}><Empty>No families on this page.</Empty></td></tr>}
              {page?.families.map((f) => {
                const plan = plans[f.id]
                const plain = !f.needs.immediate_medication && f.resources.has_car && !f.needs.pets
                return (
                  <tr key={f.id}>
                    <td><Link className="strong" to={`/families/${encodeURIComponent(f.id)}`}>{f.id}</Link></td>
                    <td>{f.adults} {f.adults === 1 ? 'adult' : 'adults'}, {f.children} {f.children === 1 ? 'child' : 'children'}</td>
                    <td>
                      <div className="hx-tags">
                        {f.needs.immediate_medication && <span className="badge t-red">Medication</span>}
                        {!f.resources.has_car && <span className="badge t-amber">No car</span>}
                        {f.needs.pets && <span className="badge t-muted">Pets</span>}
                        {plain && <span className="muted">—</span>}
                      </div>
                    </td>
                    <td>{plan?.shelter ? <Link to={`/map?shelter=${encodeURIComponent(plan.shelter.id)}`}>{plan.shelter.name}</Link> : plan ? <span className="badge t-red">No match</span> : <span className="muted">{planError ? 'Unavailable' : '—'}</span>}</td>
                    <td className="num">{plan ? (plan.alerts.length ? <span className="badge t-amber">{plan.alerts.length}</span> : <span className="muted">0</span>) : '—'}</td>
                    <td className="muted small nowrap">{timeAgo(f.updated_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {page && (
          <div className="hx-pager">
            <span>{page.total ? `${(offset + 1).toLocaleString()}–${(offset + page.families.length).toLocaleString()} of ${page.total.toLocaleString()}` : '0 families'}</span>
            <div className="btns">
              <button className="btn btn-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Previous</button>
              <button className="btn btn-sm" disabled={offset + page.families.length >= page.total} onClick={() => setOffset(offset + PAGE_SIZE)}>Next</button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
