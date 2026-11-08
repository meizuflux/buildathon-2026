import { useMemo, useState } from 'react'
import { CloudLightning, Play, RefreshCw, RotateCcw, X } from 'lucide-react'
import type { EvacuationMetrics, Requirement } from '../api/types'
import { useData } from '../data'
import { Meter, Seg } from '../components/ui'
import OpsMap from '../components/OpsMap'
import EvacCanvas, { type EvacFilter, type EvacPhase, type EvacPin } from '../components/EvacCanvas'
import { InitiateHurricaneDialog, useHurricanePhase } from '../components/HurricaneDialogs'
import { REQUIREMENTS, REQ_UNMET_LABEL, km, pct, useEvacuationPreview, type Algo } from '../lib/evac'

const NO_LAYERS = { shelters: false, families: false, reports: false }

type Row = {
  key: string
  label: string
  naive: string
  personalized: string
  delta: { text: string; tone: string } | null
  filter?: EvacFilter
}

function countDelta(n: number, p: number): Row['delta'] {
  const d = p - n
  if (d === 0) return { text: 'same', tone: 't-muted' }
  return { text: `${d > 0 ? '+' : '−'}${Math.abs(d).toLocaleString()}`, tone: d < 0 ? 't-green' : 't-red' }
}

// Travel is a trade-off, not a score: show the difference without judging it.
function travelDelta(n: number | null, p: number | null): Row['delta'] {
  if (n == null || p == null) return null
  const d = p - n
  if (Math.abs(d) < 0.05) return { text: 'same', tone: 't-muted' }
  return { text: `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} km`, tone: 't-muted' }
}

function buildRows(naive: EvacuationMetrics, pers: EvacuationMetrics): Row[] {
  const rows: Row[] = [{
    key: 'any', label: 'Households with unmet needs', filter: 'any',
    naive: naive.unmet_households.toLocaleString(), personalized: pers.unmet_households.toLocaleString(),
    delta: countDelta(naive.unmet_households, pers.unmet_households),
  }]
  for (const r of REQUIREMENTS) {
    const nn = naive.needs.find((x) => x.requirement === r)
    const pn = pers.needs.find((x) => x.requirement === r)
    const total = nn?.households ?? pn?.households ?? 0
    if (!total) continue
    rows.push({
      key: r, label: REQ_UNMET_LABEL[r], filter: r,
      naive: `${nn?.unmet_households ?? 0} / ${total}`, personalized: `${pn?.unmet_households ?? 0} / ${total}`,
      delta: countDelta(nn?.unmet_households ?? 0, pn?.unmet_households ?? 0),
    })
  }
  rows.push(
    { key: 'over', label: 'People over capacity', naive: naive.people_over_capacity.toLocaleString(), personalized: pers.people_over_capacity.toLocaleString(), delta: countDelta(naive.people_over_capacity, pers.people_over_capacity) },
    { key: 'crowded', label: 'Overcrowded shelters', naive: String(naive.overcrowded_shelters), personalized: String(pers.overcrowded_shelters), delta: countDelta(naive.overcrowded_shelters, pers.overcrowded_shelters) },
    { key: 'idle', label: 'Idle shelters', naive: String(naive.idle_shelters), personalized: String(pers.idle_shelters), delta: countDelta(naive.idle_shelters, pers.idle_shelters) },
    {
      key: 'util', label: 'Utilization range', delta: null,
      naive: `${pct(naive.min_utilization)}–${pct(naive.max_utilization)}`, personalized: `${pct(pers.min_utilization)}–${pct(pers.max_utilization)}`,
    },
    { key: 'km', label: 'Average travel', naive: km(naive.travel.mean_km), personalized: km(pers.travel.mean_km), delta: travelDelta(naive.travel.mean_km, pers.travel.mean_km) },
    { key: 'kmnc', label: 'Average travel without a car', naive: km(naive.travel.no_car_mean_km), personalized: km(pers.travel.no_car_mean_km), delta: travelDelta(naive.travel.no_car_mean_km, pers.travel.no_car_mean_km) },
  )
  return rows
}

function headline(n: number, p: number): string {
  if (p === 0 && n > 0) return `Haven meets every listed need: 0 vs ${n.toLocaleString()} households with unmet needs`
  if (p === 0) return 'Both approaches meet every listed need; compare capacity and travel below'
  if (p < n) return `Haven cuts households with unmet needs from ${n.toLocaleString()} to ${p.toLocaleString()}`
  return `Households with unmet needs: ${p.toLocaleString()} with Haven vs ${n.toLocaleString()} nearest-shelter`
}

const filterLabel = (f: Requirement | 'any') => (f === 'any' ? 'Households with unmet needs' : REQ_UNMET_LABEL[f])

export default function EvacuationPreview() {
  const d = useData()
  const phase = useHurricanePhase()
  const { preview, loading, error, reload } = useEvacuationPreview(d.disasterId)
  const [algo, setAlgo] = useState<Algo>('naive')
  const [run, setRun] = useState<EvacPhase>('ready')
  const [filter, setFilter] = useState<EvacFilter>(null)
  const [initiating, setInitiating] = useState(false)

  const households = preview?.households
  const extraPoints = useMemo(() => (households ?? []).map((h): [number, number] => [h.location.latitude, h.location.longitude]), [households])
  // The dashboard re-polls shelters every few seconds as new objects. Key the pins on their values so a
  // poll never rebuilds (and so never disturbs) the animation.
  const shelterKey = d.shelters.filter((s) => s.status !== 'closed')
    .map((s) => `${s.id}|${s.name}|${s.location.latitude}|${s.location.longitude}`).join('\n')
  const pins = useMemo<EvacPin[]>(() => {
    if (!preview || !shelterKey) return []
    const totals = new Map(preview[algo].shelters.map((s) => [s.shelter_id, s.total_people]))
    return shelterKey.split('\n').map((line) => {
      const [id, name, lat, lng] = line.split('|')
      return { id, name, lat: Number(lat), lng: Number(lng), total: totals.get(id) ?? 0 }
    })
  }, [preview, algo, shelterKey])

  const rows = useMemo(() => (preview ? buildRows(preview.naive, preview.personalized) : []), [preview])
  const metrics = preview?.[algo]
  const highlighted = useMemo(() => {
    if (!households || !filter) return 0
    return households.filter((h) => (filter === 'any' ? h[algo].unmet.length > 0 : h[algo].unmet.includes(filter))).length
  }, [households, filter, algo])

  const pick = (a: Algo) => { setAlgo(a); setRun('ready') }
  const toggleFilter = (f: EvacFilter) => setFilter((cur) => (cur === f ? null : f))

  return (
    <div className="hx-overview hx-evac">
      <div className="hx-mapcol">
        <OpsMap shelters={d.shelters} layers={NO_LAYERS} fitKey={`${d.disasterId}:${preview ? 1 : 0}`} extraPoints={extraPoints} popups={false}>
          {preview && <EvacCanvas households={preview.households} pins={pins} algo={algo} phase={run} onDone={() => setRun('done')} filter={filter} />}
        </OpsMap>

        <div className="hx-float hx-evac-controls">
          <div className="row">
            <Seg label="Routing method" value={algo} onChange={pick}
              options={[['naive', 'Nearest shelter'], ['personalized', 'Haven personalized']]} />
            {run === 'done'
              ? <button className="btn" onClick={() => setRun('ready')}><RotateCcw size={13} /> Reset</button>
              : <button className="btn btn-primary" onClick={() => setRun('running')} disabled={!preview || run === 'running'}><Play size={13} /> {run === 'running' ? 'Running…' : 'Run preview'}</button>}
            {phase === 'peace' && <button className="btn btn-danger" onClick={() => setInitiating(true)}><CloudLightning size={14} /> Initiate hurricane</button>}
          </div>
          <span className="small muted">Simulation · straight-line paths, not routes</span>
        </div>

        <div className="hx-float hx-layers" aria-label="Legend">
          <div className="key" style={{ borderTop: 0, paddingTop: 0 }}>
            <span><i style={{ background: '#9fb2c6' }} />No special needs</span>
            <span><i style={{ background: '#4fc48d' }} />All needs met</span>
            <span><i style={{ background: '#f2615e' }} />Unmet need</span>
          </div>
        </div>
        {!preview && (
          <div className="hx-float hx-banner" role={error ? 'alert' : 'status'} style={{ top: 96, color: 'var(--text)', background: 'var(--glass)', borderColor: 'var(--line)' }}>
            {error ? `Preview could not be loaded: ${error}` : 'Computing evacuation preview…'}
          </div>
        )}
      </div>

      <aside className="hx-side">
        <section aria-label="Summary">
          <div className="hx-panel-title">
            <h2>Nearest shelter vs Haven</h2>
            <button className="btn btn-sm" onClick={reload} disabled={loading}><RefreshCw size={12} /> {loading ? 'Computing…' : 'Recompute'}</button>
          </div>
          {error && <p className="notice notice-error" role="alert">{error}</p>}
          {!preview && !error && <p className="muted">Loading preview…</p>}
          {preview && (
            <>
              <p className="hx-evac-headline">{headline(preview.naive.unmet_households, preview.personalized.unmet_households)}</p>
              <p className="small muted">{preview.personalized.households.toLocaleString()} households, {preview.personalized.people.toLocaleString()} people. Supply labels are availability signals, not inventory.</p>
              {filter && (
                <div className="hx-evac-filter" role="status">
                  <span>Highlighting <b>{filterLabel(filter)}</b> · {highlighted.toLocaleString()} {highlighted === 1 ? 'household' : 'households'} with {algo === 'naive' ? 'nearest-shelter' : 'Haven'} routing</span>
                  <button className="btn btn-sm" onClick={() => setFilter(null)}><X size={12} /> Clear</button>
                </div>
              )}
              <div className="hx-table-wrap">
                <table className={`hx-table hx-compare sel-${algo}`}>
                  <thead>
                    <tr>
                      <th scope="col">Metric</th>
                      <th scope="col" className="num c-naive">Nearest</th>
                      <th scope="col" className="num c-personalized">Haven</th>
                      <th scope="col" className="num">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key} className={r.filter && filter === r.filter ? 'is-filter' : ''}>
                        <th scope="row">
                          {r.filter ? (
                            <button type="button" className="hx-linkbtn" aria-pressed={filter === r.filter} onClick={() => toggleFilter(r.filter ?? null)}>{r.label}</button>
                          ) : r.label}
                        </th>
                        <td className="num c-naive">{r.naive}</td>
                        <td className="num c-personalized">{r.personalized}</td>
                        <td className="num">{r.delta ? <span className={`badge ${r.delta.tone}`}>{r.delta.text}</span> : <span className="muted">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="small muted">Select a need to highlight the affected households on the map. The change column is Haven minus nearest shelter.</p>
            </>
          )}
        </section>

        {metrics && (
          <section aria-label="Shelter load">
            <div className="hx-panel-title"><h2>Shelter load</h2><span className="small muted">{algo === 'naive' ? 'Nearest shelter' : 'Haven personalized'}</span></div>
            <ul className="hx-loadbars">
              {[...metrics.shelters].sort((a, b) => b.people - a.people).map((s) => {
                const over = s.people > s.total_people
                const ratio = s.total_people > 0 ? s.people / s.total_people : s.people > 0 ? 1 : 0
                return (
                  <li key={s.shelter_id}>
                    <div className="r1"><span className="nm">{s.name}</span><span className={over ? 'over' : 'muted'}>{s.people.toLocaleString()} / {s.total_people.toLocaleString()}{over ? ` · +${s.people_over_capacity.toLocaleString()}` : ''}</span></div>
                    <Meter value={ratio} level={over ? 'full' : ratio > 0.9 ? 'low' : 'ok'} thin />
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </aside>
      {initiating && <InitiateHurricaneDialog onClose={() => setInitiating(false)} />}
    </div>
  )
}
