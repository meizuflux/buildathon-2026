import { useData } from '../data'
import { PageHeader } from '../components/ui'
import ReportsPanel from '../components/ReportsPanel'

export default function FamilyReports() {
  const d = useData()
  return <div className="page">
    <PageHeader title="Family reports" subtitle="Reports submitted by families in this disaster." />
    <section className="card-panel flush">
      {d.errors.reports ? <p className="error" role="alert">Reports could not be loaded: {d.errors.reports}</p> : !d.loaded ? <p className="muted">Loading reports…</p> : <ReportsPanel reports={d.reports} />}
    </section>
  </div>
}
