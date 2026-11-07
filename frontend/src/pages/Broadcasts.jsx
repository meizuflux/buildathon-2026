import { useEffect, useMemo, useState } from 'react'
import { MapPin, Users } from 'lucide-react'
import { useData } from '../data.jsx'
import { api } from '../api/index.js'
import { PageHeader, Segmented, Empty } from '../components/ui.jsx'
import TargetPicker from '../components/TargetPicker.jsx'
import { AUDIENCE_NEEDS, BROADCAST_TEMPLATES, SEVERITIES } from '../lib/constants.js'
import { cap, fullTime, timeAgo } from '../lib/format.js'

const blank = { title: '', message: '', severity: 'info', target: { type: 'all' }, needs: [], when: 'now', scheduled_for: '', expires_in: '' }

export default function Broadcasts() {
  const d = useData()
  const [f, setF] = useState(blank)
  const [reach, setReach] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(null)
  const [filter, setFilter] = useState('all')
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))

  const target = useMemo(() => {
    if (f.target.type !== 'radius') return { type: 'all' }
    const { center, radius_km, label } = f.target
    return { type: 'radius', center, radius_km, label }
  }, [f.target])

  // Live reach estimate (Part 2 §6 preview endpoint), debounced.
  useEffect(() => {
    if (!d.disasterId) return
    let alive = true
    const t = setTimeout(() => {
      api.previewUpdate(d.disasterId, { target, audience: { needs: f.needs } })
        .then((r) => alive && setReach(r.recipient_count))
        .catch(() => alive && setReach(null))
    }, 250)
    return () => { alive = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.disasterId, target, f.needs])

  const applyTemplate = (id) => {
    const t = BROADCAST_TEMPLATES.find((x) => x.id === id)
    if (t) setF((x) => ({ ...x, title: t.title, message: t.message, severity: t.severity }))
  }

  async function submit(e) {
    e.preventDefault()
    setError(null)
    if (f.when === 'later' && !f.scheduled_for) return setError('Pick a time to send.')
    const where = target.type === 'radius' ? target.label : 'every family in this disaster'
    if (f.severity === 'critical' && !confirm(`Send a CRITICAL alert to ${reach ?? 'all'} families (${where})?`)) return
    setBusy(true)
    try {
      const created = await d.mutate((api, disasterId) => api.publishUpdate(disasterId, {
        title: f.title.trim(), message: f.message.trim(), severity: f.severity, target, audience: { needs: f.needs },
        scheduled_for: f.when === 'later' ? new Date(f.scheduled_for).toISOString() : null,
        expires_at: f.expires_in ? new Date(Date.now() + Number(f.expires_in) * 3600_000).toISOString() : null,
      }))
      setSent(created)
      setF(blank)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const retract = async (u) => {
    if (!confirm(`Retract "${u.title}"? Families will no longer see it.`)) return
    await d.mutate((api) => api.retractUpdate(u.id)).catch((err) => alert(err.message))
  }

  const history = [...d.updates]
    .filter((u) => filter === 'all' || u.status === filter || u.severity === filter)
    .sort((a, b) => (b.published_at || b.scheduled_for || '').localeCompare(a.published_at || a.scheduled_for || ''))
  const totals = d.updates.reduce((a, u) => ({ sent: a.sent + (u.status !== 'scheduled' ? 1 : 0), reached: a.reached + (u.status !== 'scheduled' ? u.recipient_count : 0), read: a.read + u.read_count }), { sent: 0, reached: 0, read: 0 })

  return (
    <div className="page">
      <PageHeader title="Broadcasts" subtitle="Official updates pushed to families' Haven app — everyone, or a targeted area and audience." />

      <div className="broadcast-grid">
        <form className="card-panel compose" onSubmit={submit}>
          <div className="panel-title">
            <h2>New broadcast</h2>
            <select className="select-sm" value="" onChange={(e) => applyTemplate(e.target.value)} aria-label="Use a template">
              <option value="">Use a template…</option>
              {BROADCAST_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <div className="field">
            <span>Severity</span>
            <Segmented value={f.severity} onChange={(v) => set('severity', v)} label="Severity" options={SEVERITIES.map((s) => [s, cap(s), `sev-${s}`])} />
          </div>
          <label className="field">
            <span>Title</span>
            <input value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={120} required placeholder="Evacuation order: Zone A" />
          </label>
          <label className="field">
            <span>Message <span className="muted">({f.message.length}/600)</span></span>
            <textarea rows={4} maxLength={600} value={f.message} onChange={(e) => set('message', e.target.value)} required placeholder="What should families do, and by when?" />
          </label>

          <fieldset>
            <legend><MapPin size={12} /> Where</legend>
            <TargetPicker target={f.target} setTarget={(t) => set('target', t)} shelters={d.shelters} />
          </fieldset>

          <fieldset>
            <legend><Users size={12} /> Who</legend>
            <p className="hint">Leave all unchecked to reach every family in the area. Otherwise, families matching <em>any</em> checked need.</p>
            <div className="filters">
              {Object.entries(AUDIENCE_NEEDS).map(([k, label]) => (
                <button type="button" key={k} className={`filter ${f.needs.includes(k) ? 'on' : ''}`} aria-pressed={f.needs.includes(k)}
                  onClick={() => set('needs', f.needs.includes(k) ? f.needs.filter((x) => x !== k) : [...f.needs, k])}>{label}</button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>When</legend>
            <div className="row">
              <div className="field">
                <Segmented size="sm" value={f.when} onChange={(v) => set('when', v)} label="Send time" options={[['now', 'Send now'], ['later', 'Schedule']]} />
                {f.when === 'later' && <input type="datetime-local" value={f.scheduled_for} onChange={(e) => set('scheduled_for', e.target.value)} style={{ marginTop: 8 }} />}
              </div>
              <label className="field">
                <span>Expires after (hours, optional)</span>
                <input type="number" min="1" value={f.expires_in} onChange={(e) => set('expires_in', e.target.value)} placeholder="Never" />
              </label>
            </div>
          </fieldset>

          <div className={`preview sev-border-${f.severity}`}>
            <div className="preview-label muted small">Family app preview</div>
            <div><span className={`badge sev-${f.severity}`}>{cap(f.severity)}</span> <strong>{f.title || 'Title'}</strong></div>
            <p>{f.message || 'Your message will appear here.'}</p>
          </div>

          {error && <p className="error" role="alert">{error}</p>}
          {sent && <p className="success" role="status">{sent.status === 'scheduled' ? 'Scheduled' : 'Sent'} "{sent.title}" to {sent.recipient_count} families.</p>}
          <div className="form-actions">
            <span className="reach-est"><Users size={15} /> <strong>{reach ?? '—'}</strong> families will receive this</span>
            <button className={`btn ${f.severity === 'critical' ? 'btn-danger' : 'btn-primary'}`} disabled={busy || !f.title.trim() || !f.message.trim()}>
              {busy ? 'Sending…' : f.when === 'later' ? 'Schedule broadcast' : `Send ${f.severity} broadcast`}
            </button>
          </div>
        </form>

        <section className="card-panel">
          <div className="panel-title">
            <h2>History</h2>
            <select className="select-sm" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter history">
              <option value="all">All</option>
              <option value="published">Live</option>
              <option value="scheduled">Scheduled</option>
              <option value="retracted">Retracted</option>
              <option value="expired">Expired</option>
              <option value="critical">Critical only</option>
            </select>
          </div>
          <div className="mini-stats">
            <div><strong>{totals.sent}</strong><span>sent</span></div>
            <div><strong>{totals.reached.toLocaleString()}</strong><span>deliveries</span></div>
            <div><strong>{totals.reached ? Math.round((totals.read / totals.reached) * 100) : 0}%</strong><span>read rate</span></div>
          </div>
          <ul className="list">
            {history.length === 0 && <Empty>No broadcasts match.</Empty>}
            {history.map((u) => {
              const pct = u.recipient_count ? Math.round((u.read_count / u.recipient_count) * 100) : 0
              return (
                <li key={u.id} className={`card update sev-border-${u.severity} ${u.status === 'retracted' ? 'is-retracted' : ''}`}>
                  <div className="card-head">
                    <span className={`badge sev-${u.severity}`}>{cap(u.severity)}</span>
                    <span className="card-title">{u.title}</span>
                    <span className={`badge st-${u.status}`}>{u.status === 'published' ? 'Live' : cap(u.status)}</span>
                  </div>
                  <p className="report-msg">{u.message}</p>
                  <div className="tags">
                    <span className="tag"><MapPin size={11} /> {u.target?.type === 'radius' ? u.target.label : 'Entire area'}</span>
                    {(u.audience?.needs || []).map((n) => <span key={n} className="tag">{AUDIENCE_NEEDS[n]}</span>)}
                  </div>
                  <div className="reach">
                    <div className="meter meter-sm"><span style={{ width: `${pct}%` }} /></div>
                    <span className="muted small nowrap">{u.read_count}/{u.recipient_count} read ({pct}%)</span>
                  </div>
                  <div className="card-foot flush">
                    <span className="muted small" title={fullTime(u.published_at || u.scheduled_for)}>
                      {u.status === 'scheduled' ? `Sends ${timeAgo(u.scheduled_for)}` : `Sent ${timeAgo(u.published_at)}`}
                      {u.expires_at && ` · expires ${timeAgo(u.expires_at)}`}
                    </span>
                    {['published', 'scheduled'].includes(u.status) && <button className="btn btn-ghost btn-sm danger" onClick={() => retract(u)}>Retract</button>}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}
