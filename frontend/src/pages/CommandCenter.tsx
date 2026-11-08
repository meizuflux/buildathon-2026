import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import type { EvacuationMetrics } from '../api/types'
import { useData } from '../data'
import { cap, fullTime, timeAgo } from '../lib/format'
import { SEV_TONE, isOpenHelp, needsAction } from '../lib/ops'
import { REQUIREMENTS, REQ_LABEL, km, useEvacuationPreview } from '../lib/evac'
import ReportActions from '../components/ReportActions'
import { Empty } from '../components/ui'
import { useHurricanePhase } from '../components/HurricaneDialogs'

const REF_LINK: Record<string, (id: string) => string> = {
  shelter: (id) => `/map?shelter=${encodeURIComponent(id)}`,
  update: () => '/comms/broadcasts',
  report: (id) => `/map?report=${encodeURIComponent(id)}`,
  family: (id) => `/families/${encodeURIComponent(id)}`,
}

const n = (v: number) => v.toLocaleString()
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

// The status center: no map (that lives on Operations map), just headline figures and charts. The
// header shows the hurricane status. Peace shows readiness; an active hurricane shows the published assignments.
export default function CommandCenter() {
  const d = useData()
  const phase = useHurricanePhase()
  const active = phase === 'active'
  const { preview, loading, error, reload } = useEvacuationPreview(d.disasterId)

  // Refresh the charts when the phase flips or a shelter's capacity changes, not on every poll.
  const shelterKey = d.shelters.map((s) => `${s.id}:${s.status}:${s.capacity.total_people}:${s.capacity.available_people}`).join('|')
  const seen = useRef<string | null>(null)
  useEffect(() => {
    const key = `${phase}|${shelterKey}`
    if (seen.current !== null && seen.current !== key && phase) reload()
    if (phase) seen.current = key
  }, [phase, shelterKey, reload])

  const m = preview?.personalized
  const helpOpen = d.reports.filter(isOpenHelp).length
  const queue = useMemo(() => needsAction(d.alerts, d.reports), [d.alerts, d.reports])
  const recent = [...d.updates].sort((a, b) => (b.published_at || '').localeCompare(a.published_at || '')).slice(0, 4)
  const shelterName = (id: string) => d.shelters.find((s) => s.id === id)?.name ?? 'one shelter'
  const openShelters = d.shelters.filter((s) => s.status !== 'closed')
  const capacity = openShelters.reduce((t, s) => t + s.capacity.total_people, 0)
  const chartState = error ? `Charts could not be loaded: ${error}` : !m ? (loading ? 'Loading…' : 'No data yet.') : null

  return (
    <div className="hx-page hx-cc">
      <h1 className="sr-only">Command center</h1>
      <div className="hx-stats" aria-label="Key figures">
        {active ? (
          <>
            <Stat label="People assigned to shelters" value={m ? n(m.people) : '—'} sub={`in ${openShelters.length} ${openShelters.length === 1 ? 'shelter' : 'shelters'}`} />
            <Stat label="Spaces free" value={m ? n(Math.max(0, capacity - m.people)) : '—'} sub={m ? `${pct(m.people, capacity)}% of ${n(capacity)} occupied` : undefined} />
            <Stat label="Households with every need met" value={m ? `${pct(m.households - m.unmet_households, m.households)}%` : '—'}
              sub={m ? `${n(m.households - m.unmet_households)} of ${n(m.households)}` : undefined} tone={m && m.unmet_households > 0 ? 'bad' : 'good'} />
            <Stat label="Open help requests" value={n(helpOpen)} sub={`of ${n(d.reports.length)} reports`} tone={helpOpen > 0 ? 'bad' : undefined} to="/comms/reports" />
          </>
        ) : (
          <>
            <Stat label="Shelters on standby" value={n(openShelters.length)} sub={`${n(capacity)} spaces ready`} tone="good" />
            <Stat label="Households registered" value={m ? n(m.households) : '—'} sub={m ? `${n(m.people)} people` : undefined} to="/families" />
            <Stat label="Plans ready, every need met" value={m ? n(m.households - m.unmet_households) : '—'} sub={m ? `of ${n(m.households)} households` : undefined}
              tone={m && m.unmet_households > 0 ? 'bad' : 'good'} />
            <Stat label="Households with care needs on file" value={m ? n(m.households_with_needs) : '—'} sub="medical, access, pets, children or care" />
          </>
        )}
      </div>

      <div className="hx-cc-charts">
        <section className="hx-panel hx-chart" aria-label={active ? 'Shelter occupancy' : 'Planned shelter load'}>
          <ChartHead title={active ? 'Shelter occupancy' : 'Planned shelter load'}
            sub={active ? 'People assigned to each shelter, against its capacity' : 'Where households would go if an evacuation were ordered now'} />
          {chartState ? <p className="muted">{chartState}</p> : m && <ShelterLoad metrics={m} />}
        </section>

        <section className="hx-panel hx-chart" aria-label="Needs coverage">
          <ChartHead title="Needs coverage" sub="Households with each need, and whether their shelter supports it" />
          {chartState ? <p className="muted">{chartState}</p> : m && <NeedsCoverage metrics={m} />}
        </section>

        <section className="hx-panel hx-chart" aria-label="Haven compared with nearest-shelter routing">
          <ChartHead title="Haven vs nearest shelter" sub="The same households and shelters, routed two ways"
            action={<Link to="/evacuation-preview">Open preview <ArrowRight size={13} /></Link>} />
          {chartState ? <p className="muted">{chartState}</p> : preview && <Comparison haven={preview.personalized} nearest={preview.naive} />}
        </section>
      </div>

      <div className={`hx-cc-feeds ${active ? 'three' : ''}`}>
        {active && (
          <section className="hx-panel hx-feed">
            <div className="hx-panel-title"><h2>Needs action</h2><Link to="/alerts">All alerts <ArrowRight size={13} /></Link></div>
            {d.errors.alerts ? <p className="muted">Alerts could not be loaded.</p>
              : !d.alerts ? <p className="muted">Loading alerts…</p>
                : queue.length === 0 ? <Empty>Nothing needs action right now.</Empty> : (
                  <ul className="hx-queue">
                    {queue.slice(0, 6).map((q) => (
                      <li key={q.key} className={`k-${q.kind}`}>
                        <div>
                          <div className="t">{q.title}</div>
                          <div className="m">
                            <span title={fullTime(q.when)}>{q.label}{q.when ? `, ${timeAgo(q.when)}` : ''}</span>
                            <span className="acts">
                              {q.shelterId && <Link className="btn btn-sm" to={`/map?shelter=${encodeURIComponent(q.shelterId)}`}>Show shelter</Link>}
                              {q.reportId && <Link className="btn btn-sm" to={`/map?report=${encodeURIComponent(q.reportId)}`}>Show on map</Link>}
                              {q.familyId && <Link className="btn btn-sm" to={`/families/${encodeURIComponent(q.familyId)}`}>View family</Link>}
                              {q.report && <ReportActions report={q.report} compact />}
                            </span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
            {queue.length > 6 && <p className="small muted" style={{ marginTop: 8 }}>{queue.length - 6} more in Alerts and Family reports.</p>}
          </section>
        )}

        <section className="hx-panel hx-feed">
          <div className="hx-panel-title"><h2>Recent broadcasts</h2><Link to="/comms/broadcasts">All broadcasts <ArrowRight size={13} /></Link></div>
          {recent.length === 0 ? <Empty>No broadcasts sent yet.</Empty> : (
            <div className="hx-casts">
              {recent.map((u) => (
                <div key={u.id} className="hx-cast">
                  <div className="r1"><span className={`badge ${SEV_TONE[u.severity]}`}>{cap(u.severity)}</span><strong>{u.title}</strong></div>
                  <div className="r2">
                    <span>{u.target?.type === 'shelter' ? `Families assigned to ${shelterName(u.target.shelter_id)}` : 'All families'}</span>
                    <span title={fullTime(u.published_at)}>{timeAgo(u.published_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="hx-panel hx-feed">
          <div className="hx-panel-title"><h2>Activity</h2><span className="small muted">Live</span></div>
          {d.activity.length === 0 ? <Empty>No activity yet.</Empty> : (
            <ol className="hx-timeline">
              {d.activity.slice(0, 10).map((a) => {
                const link = REF_LINK[a.ref?.kind]
                return (
                  <li key={a.id}>
                    <span className={`dot c-${a.type.split('_')[0]}`} aria-hidden="true" />
                    <div>
                      {link ? <Link to={link(a.ref.id)}>{a.summary}</Link> : a.summary}
                      <div className="meta" title={fullTime(a.created_at)}>{timeAgo(a.created_at)}, {a.actor?.name || 'System'}</div>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value, sub, tone, to }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad'; to?: string }) {
  const body = (
    <>
      <span className="lbl">{tone && <i className={`dot ${tone}`} aria-label={tone === 'good' ? 'OK' : 'Needs attention'} />}{label}</span>
      <b>{value}</b>
      {sub && <span>{sub}</span>}
    </>
  )
  return to ? <Link className="hx-panel hx-stat hx-cc-stat" to={to}>{body}</Link> : <div className="hx-panel hx-stat hx-cc-stat">{body}</div>
}

function ChartHead({ title, sub, action }: { title: string; sub: string; action?: ReactNode }) {
  return (
    <div className="hx-chart-head">
      <div><h2>{title}</h2><p>{sub}</p></div>
      {action}
    </div>
  )
}

// One bar per shelter on a shared scale: the faint track is capacity, the fill is assigned people.
function ShelterLoad({ metrics }: { metrics: EvacuationMetrics }) {
  const rows = [...metrics.shelters].filter((s) => s.total_people > 0 || s.people > 0).sort((a, b) => b.total_people - a.total_people)
  const max = Math.max(1, ...rows.map((s) => Math.max(s.total_people, s.people)))
  return (
    <ul className="hx-bars wrap">
      {rows.map((s) => {
        const ratio = s.total_people > 0 ? s.people / s.total_people : 1
        const level = s.people > s.total_people ? 'over' : ratio > 0.9 ? 'high' : 'ok'
        const text = `${n(s.people)} / ${n(s.total_people)}${s.people_over_capacity ? ` · ${n(s.people_over_capacity)} over` : ` · ${pct(s.people, s.total_people)}%`}`
        return (
          <li key={s.shelter_id} title={`${s.name}: ${n(s.people)} people assigned, capacity ${n(s.total_people)}`}>
            <span className="lbl">{s.name.replace(/^Demo — /, '')}</span>
            <span className="plot">
              <i className="track" style={{ width: `${(s.total_people / max) * 100}%` }} />
              <i className={`fill lvl-${level}`} style={{ width: `${(s.people / max) * 100}%` }} />
            </span>
            <span className={`val ${level === 'over' ? 'tone-bad' : ''}`}>{text}</span>
          </li>
        )
      })}
    </ul>
  )
}

// Stacked bar per need: met (green) then unmet (red), with the counts written out beside it.
function NeedsCoverage({ metrics }: { metrics: EvacuationMetrics }) {
  const rows = REQUIREMENTS.map((r) => metrics.needs.find((x) => x.requirement === r)).filter((x): x is NonNullable<typeof x> => !!x && x.households > 0)
  if (!rows.length) return <Empty>No household has a listed need.</Empty>
  const max = Math.max(...rows.map((r) => r.households))
  return (
    <>
      <div className="hx-legend" aria-hidden="true"><span><i className="sw met" />Supported</span><span><i className="sw unmet" />Not supported</span></div>
      <ul className="hx-bars">
        {rows.map((r) => {
          const met = r.households - r.unmet_households
          return (
            <li key={r.requirement} title={`${REQ_LABEL[r.requirement]}: ${n(met)} supported, ${n(r.unmet_households)} not supported`}>
              <span className="lbl">{REQ_LABEL[r.requirement]}</span>
              <span className="plot stack">
                {met > 0 && <i className="seg met" style={{ width: `${(met / max) * 100}%` }} />}
                {r.unmet_households > 0 && <i className="seg unmet" style={{ width: `${(r.unmet_households / max) * 100}%` }} />}
              </span>
              <span className={`val ${r.unmet_households ? 'tone-bad' : ''}`}>{r.unmet_households ? `${n(r.unmet_households)} not supported` : `${n(met)} / ${n(r.households)}`}</span>
            </li>
          )
        })}
      </ul>
    </>
  )
}

// Paired bars per measure, each pair on its own scale. Travel is shown as a trade-off, not a score.
function Comparison({ haven, nearest }: { haven: EvacuationMetrics; nearest: EvacuationMetrics }) {
  const groups: { label: string; a: number; b: number; fmt: (v: number) => string }[] = [
    { label: 'Households with unmet needs', a: haven.unmet_households, b: nearest.unmet_households, fmt: n },
    { label: 'People over shelter capacity', a: haven.people_over_capacity, b: nearest.people_over_capacity, fmt: n },
    { label: 'Average travel', a: haven.travel.mean_km ?? 0, b: nearest.travel.mean_km ?? 0, fmt: (v) => km(v) },
  ]
  return (
    <div className="hx-compare-chart">
      {groups.map((g) => {
        const max = Math.max(g.a, g.b) || 1
        return (
          <div key={g.label} className="grp">
            <div className="glbl">{g.label}</div>
            <ul className="hx-bars tight">
              <li title={`Haven: ${g.fmt(g.a)}`}>
                <span className="lbl">Haven</span>
                <span className="plot"><i className="fill haven" style={{ width: `${(g.a / max) * 100}%` }} /></span>
                <span className="val">{g.fmt(g.a)}</span>
              </li>
              <li title={`Nearest shelter: ${g.fmt(g.b)}`}>
                <span className="lbl">Nearest shelter</span>
                <span className="plot"><i className="fill nearest" style={{ width: `${(g.b / max) * 100}%` }} /></span>
                <span className="val">{g.fmt(g.b)}</span>
              </li>
            </ul>
          </div>
        )
      })}
    </div>
  )
}
