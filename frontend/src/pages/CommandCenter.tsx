import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Check, Route, X } from 'lucide-react'
import type { MapLayers, Shelter } from '../api/types'
import { useData } from '../data'
import { RESOURCE_KEYS } from '../lib/constants'
import { cap, fullTime, timeAgo } from '../lib/format'
import { LEVEL_TEXT, SEV_TONE, isOpenHelp, needsAction, occupancy, shelterLevel, shelterTotals } from '../lib/ops'
import OpsMap, { LayerPanel } from '../components/OpsMap'
import ReportActions from '../components/ReportActions'
import { Empty, Meter, useAllFamilies } from '../components/ui'
import NeedsMonitor from '../components/NeedsMonitor'
import { InitiateHurricaneDialog, useHurricanePhase } from '../components/HurricaneDialogs'

const REF_LINK: Record<string, (id: string) => string> = {
  shelter: (id) => `/map?shelter=${encodeURIComponent(id)}`,
  update: () => '/comms/broadcasts',
  report: (id) => `/map?report=${encodeURIComponent(id)}`,
  family: (id) => `/families/${encodeURIComponent(id)}`,
}

export default function CommandCenter() {
  const d = useData()
  const navigate = useNavigate()
  const [layers, setLayers] = useState<MapLayers>({ shelters: true, families: true, reports: true })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [initiating, setInitiating] = useState(false)
  const phase = useHurricanePhase()
  const peace = phase === 'peace'
  const { families, error: familyError } = useAllFamilies(d.disasterId, layers.families || phase !== 'active')
  const t = shelterTotals(d.shelters)
  const helpOpen = d.reports.filter(isOpenHelp).length
  const queue = useMemo(() => needsAction(d.alerts, d.reports), [d.alerts, d.reports])
  const selected = d.shelters.find((s) => s.id === selectedId)
  const shelterName = (id: string) => d.shelters.find((s) => s.id === id)?.name ?? 'one shelter'
  const onFile = useMemo(() => ({
    medication: families.filter((f) => f.needs.immediate_medication).length,
    wheelchair: families.filter((f) => (f.needs.accessibility_notes || '').trim()).length,
    pets: families.filter((f) => f.needs.pets).length,
  }), [families])
  const recent = [...d.updates]
    .sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''))
    .slice(0, 3)

  return (
    <div className="hx-overview">
      <div className="hx-mapcol">
        <OpsMap shelters={d.shelters} families={families} reports={peace ? [] : d.reports} layers={layers} fitKey={d.disasterId} standby={peace}
          selectedId={selectedId} onSelect={setSelectedId} />

        {peace ? (
          <div className="hx-float hx-figures standby" aria-label="Key figures">
            <Link to="/map">
              <b>{t.active.length.toLocaleString()}</b>
              <span>{t.active.length === 1 ? 'shelter' : 'shelters'} on standby</span>
            </Link>
            <Link to="/map">
              <b>{t.total.toLocaleString()}</b>
              <span>spaces ready</span>
            </Link>
            <Link to="/families">
              <b>{families.length.toLocaleString()}</b>
              <span>households registered</span>
            </Link>
          </div>
        ) : (
          <div className="hx-float hx-figures" aria-label="Key figures">
            <Link to="/map">
              <b>{t.sheltered.toLocaleString()}</b>
              <span>people sheltered in {t.active.length} {t.active.length === 1 ? 'site' : 'sites'}</span>
            </Link>
            <Link to="/map">
              <b>{t.free.toLocaleString()}</b>
              <Meter value={t.occupancy} level={t.occupancy > 0.9 ? 'full' : t.occupancy > 0.8 ? 'low' : 'ok'} thin />
              <span>spaces free, {Math.round(t.occupancy * 100)}% occupied</span>
            </Link>
            <Link to="/comms/reports" className={helpOpen ? 'alert' : ''}>
              <b>{helpOpen}</b>
              <span>open help {helpOpen === 1 ? 'request' : 'requests'} of {d.reports.length} reports</span>
            </Link>
          </div>
        )}

        {selected && <ShelterCard s={selected} onClose={() => setSelectedId(null)} onMessage={() => navigate(`/comms/broadcasts?to=${encodeURIComponent(selected.id)}`)} />}
        <LayerPanel layers={layers} setLayers={setLayers} familyError={familyError} />
      </div>

      <aside className="hx-side">
        {phase === 'active' && <NeedsMonitor />}
        {peace ? (
          <section aria-label="All clear">
            <div className="hx-panel-title"><h2>All clear</h2><span className="badge t-green">Peace</span></div>
            <ul className="hx-checks-list">
              <li className="hx-check ok"><Check size={15} aria-hidden="true" /><span>No active hurricane</span></li>
              <li className="hx-check ok"><Check size={15} aria-hidden="true" /><span><b>{t.active.length}</b> {t.active.length === 1 ? 'shelter' : 'shelters'} on standby with <b>{t.total.toLocaleString()}</b> spaces</span></li>
              <li className="hx-check ok"><Check size={15} aria-hidden="true" /><span><b>{families.length.toLocaleString()}</b> households registered, plans pre-computed</span></li>
              <li className="hx-check ok"><Check size={15} aria-hidden="true" /><span>Needs on file: <b>{onFile.medication}</b> medication, <b>{onFile.wheelchair}</b> wheelchair access, <b>{onFile.pets}</b> pets</span></li>
            </ul>
            <div className="hx-form-actions" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
              <Link className="btn btn-primary" to="/evacuation-preview"><Route size={14} /> Preview evacuation</Link>
              <button className="btn" onClick={() => setInitiating(true)}>Initiate hurricane</button>
            </div>
          </section>
        ) : (
        <section>
          <div className="hx-panel-title">
            <h2>Needs action</h2>
            <Link to="/alerts">All alerts <ArrowRight size={13} /></Link>
          </div>
          {d.errors.alerts ? <p className="muted">Alerts could not be loaded.</p>
            : !d.alerts ? <p className="muted">Loading alerts…</p>
              : queue.length === 0 ? <Empty>Nothing needs action right now.</Empty> : (
                <ul className="hx-queue">
                  {queue.slice(0, 7).map((q) => (
                    <li key={q.key} className={`k-${q.kind}`}>
                      <div>
                        <div className="t">{q.title}</div>
                        <div className="m">
                          <span title={fullTime(q.when)}>{q.label}{q.when ? `, ${timeAgo(q.when)}` : ''}</span>
                          <span className="acts">
                            {q.shelterId && <button className="btn btn-sm" onClick={() => setSelectedId(q.shelterId ?? null)}>Show shelter</button>}
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
          {queue.length > 7 && <p className="small muted" style={{ marginTop: 8 }}>{queue.length - 7} more in Alerts and Family reports.</p>}
        </section>
        )}

        <section>
          <div className="hx-panel-title">
            <h2>Recent broadcasts</h2>
            <Link to="/comms/broadcasts">All broadcasts <ArrowRight size={13} /></Link>
          </div>
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

        <section>
          <div className="hx-panel-title"><h2>Activity</h2><span className="small muted">Live</span></div>
          {d.activity.length === 0 ? <Empty>No activity yet.</Empty> : (
            <ol className="hx-timeline">
              {d.activity.slice(0, 14).map((a) => {
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
      </aside>
      {initiating && <InitiateHurricaneDialog onClose={() => setInitiating(false)} />}
    </div>
  )
}

function ShelterCard({ s, onClose, onMessage }: { s: Shelter; onClose: () => void; onMessage: () => void }) {
  const level = shelterLevel(s)
  const free = Math.max(0, s.capacity.available_people)
  return (
    <div className="hx-float hx-shelter-card" aria-label={`${s.name} details`}>
      <div className="hd">
        <div>
          <h2>{s.name}</h2>
          <div className="small muted">{s.address}</div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close shelter details"><X size={16} /></button>
      </div>
      <div className="stats">
        <div><b className={`lvl-text-${level}`}>{level === 'full' ? 'Full' : free.toLocaleString()}</b><span>{level === 'full' ? 'no spaces free' : 'spaces free'}</span></div>
        <div><b>{(s.capacity.total_people - free).toLocaleString()}</b><span>of {s.capacity.total_people.toLocaleString()} sheltered</span></div>
      </div>
      <Meter value={occupancy(s)} level={level} thin />
      <div className="hx-res">{RESOURCE_KEYS.map((k) => <span key={k} className={`r-${s.resources[k] || 'unknown'}`}>{cap(k)}</span>)}</div>
      <div className="small muted">{LEVEL_TEXT[level]}, updated {timeAgo(s.updated_at)}</div>
      <div className="acts">
        <button className="btn btn-sm btn-primary" onClick={onMessage}>Message families here</button>
        <Link className="btn btn-sm" to={`/map?shelter=${encodeURIComponent(s.id)}&edit=1`}>Edit shelter</Link>
      </div>
    </div>
  )
}
