import { useState } from 'react'
import { MapPin, Users } from 'lucide-react'
import { useData } from '../data.jsx'
import { PageHeader, Segmented, Empty } from '../components/ui.jsx'
import TargetPicker from '../components/TargetPicker.jsx'
import { AUDIENCE_NEEDS, BROADCAST_TEMPLATES, SEVERITIES } from '../lib/constants.js'
import { cap, fullTime, timeAgo } from '../lib/format.js'

const blank = { title: '', message: '', severity: 'info', target: { type: 'all' } }

export default function Broadcasts() {
  const d = useData()
  const [f, setF] = useState(blank)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(null)
  const [filter, setFilter] = useState('all')
  const [templateId, setTemplateId] = useState('')
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))

  const target = f.target

  const applyTemplate = (id) => {
    const t = BROADCAST_TEMPLATES.find((x) => x.id === id)
    if (t) setF((x) => ({ ...x, title: t.title, message: t.message, severity: t.severity }))
  }

  async function submit(e) {
    e.preventDefault()
    setError(null)
    const where = target.type === 'shelter' ? 'families assigned to the selected shelter' : 'every family in this disaster'
    if (f.severity === 'critical' && !confirm(`Publish a CRITICAL alert to ${where}?`)) return
    setBusy(true)
    try {
      const created = await d.mutate((api, disasterId) => api.publishUpdate(disasterId, {
        title: f.title.trim(), message: f.message.trim(), severity: f.severity, target,
      }))
      setSent(created)
      setF(blank)
      setTemplateId('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const history = [...d.updates]
    .filter((u) => filter === 'all' || (filter === 'published' && !u.status) || u.status === filter || u.severity === filter)
    .sort((a, b) => (b.published_at || b.scheduled_for || '').localeCompare(a.published_at || a.scheduled_for || ''))
  const totals = { sent: d.updates.length }

  return (
    <div className="page">
      <PageHeader title="Broadcasts" subtitle="Publish official updates for all families or those currently assigned to a shelter." />

      <div className="broadcast-grid">
        <form className="card-panel compose" onSubmit={submit}>
          <div className="broadcast-compose-header">
            <h2>New broadcast</h2>
            <div className="broadcast-template">
              <div className="broadcast-template-controls">
                <label className="field">
                  <span className="sr-only">Broadcast template</span>
                  <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                    <option value="">Choose a template…</option>
                    {BROADCAST_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
                <button type="button" className="btn" disabled={!templateId} onClick={() => applyTemplate(templateId)}>Apply</button>
              </div>
            </div>
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

          <div className={`preview sev-border-${f.severity}`}>
            <div className="preview-label muted small">Family app preview</div>
            <div><span className={`badge sev-${f.severity}`}>{cap(f.severity)}</span> <strong>{f.title || 'Title'}</strong></div>
            <p>{f.message || 'Your message will appear here.'}</p>
          </div>

          {error && <p className="error" role="alert">{error}</p>}
          {sent && <p className="success" role="status">Published "{sent.title}".</p>}
          <div className="form-actions">
            <span className="reach-est"><Users size={15} /> <strong>—</strong> recipient count unavailable</span>
            <button className={`btn ${f.severity === 'critical' ? 'btn-danger' : 'btn-primary'}`} disabled={busy || !f.title.trim() || !f.message.trim()}>
              {busy ? 'Sending…' : `Send ${f.severity} broadcast`}
            </button>
          </div>
        </form>

        <section className="card-panel">
          <div className="panel-title">
            <h2>History</h2>
            <select className="select-sm" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter history">
              <option value="all">All</option>
              <option value="published">Live</option>
              <option value="scheduled" disabled>Scheduled (unavailable)</option>
              <option value="retracted" disabled>Retracted (unavailable)</option>
              <option value="expired" disabled>Expired (unavailable)</option>
              <option value="critical">Critical only</option>
            </select>
          </div>
          <div className="mini-stats">
            <div><strong>{totals.sent}</strong><span>sent</span></div>
            <div><strong>—</strong><span>deliveries</span></div>
            <div><strong>—</strong><span>read rate</span></div>
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
                    <span className={`badge st-${u.status}`}>{u.status ? (u.status === 'published' ? 'Live' : cap(u.status)) : 'Published'}</span>
                  </div>
                  <p className="report-msg">{u.message}</p>
                  <div className="tags">
                    <span className="tag"><MapPin size={11} /> {u.target?.type === 'shelter' ? `Families assigned to ${d.shelters.find((s) => s.id === u.target.shelter_id)?.name || u.target.shelter_id}` : 'All families in this disaster'}</span>
                    {(u.audience?.needs || []).map((n) => <span key={n} className="tag">{AUDIENCE_NEEDS[n]}</span>)}
                  </div>
                  <div className="reach">
                    {u.read_count != null && <div className="meter meter-sm"><span style={{ width: `${pct}%` }} /></div>}
                    <span className="muted small nowrap">{u.read_count == null ? 'Read count unavailable' : `${u.read_count}/${u.recipient_count} read (${pct}%)`}</span>
                  </div>
                  <div className="card-foot flush">
                    <span className="muted small" title={fullTime(u.published_at || u.scheduled_for)}>
                      {u.status === 'scheduled' ? `Sends ${timeAgo(u.scheduled_for)}` : `Sent ${timeAgo(u.published_at)}`}
                      {u.expires_at && ` · expires ${timeAgo(u.expires_at)}`}
                    </span>
                    <button className="btn btn-ghost btn-sm danger" disabled title="Unavailable with the current server">Retract</button>
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
