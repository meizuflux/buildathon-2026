import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Send, Users } from 'lucide-react'
import { api } from '../api'
import type { BroadcastTarget, Severity, Update } from '../api/types'
import { useData } from '../data'
import { BROADCAST_TEMPLATES, SEVERITIES } from '../lib/constants'
import { cap, fullTime, timeAgo } from '../lib/format'
import { SEV_TONE, errorMessage } from '../lib/ops'
import { Empty, Head, Seg } from '../components/ui'

type Draft = { title: string; message: string; severity: Severity; target: BroadcastTarget }
type HistoryFilter = 'all' | Severity

const blank: Draft = { title: '', message: '', severity: 'info', target: { type: 'all' } }
const SEVERITY_HELP: Record<Severity, string> = {
  info: 'General guidance and updates.',
  warning: 'Families should act soon to stay safe.',
  critical: 'Families must act now. You will be asked to confirm before it sends.',
}
const SEND_CLASS: Record<Severity, string> = { info: 'btn-primary', warning: 'btn-amber', critical: 'btn-danger' }

export default function Broadcasts() {
  const d = useData()
  const [params, setParams] = useSearchParams()
  const [f, setF] = useState<Draft>(blank)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<Update | null>(null)
  const [filter, setFilter] = useState<HistoryFilter>('all')
  const [templateId, setTemplateId] = useState('')
  const [reach, setReach] = useState<number | null>(null)
  const [reachError, setReachError] = useState(false)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF((x) => ({ ...x, [k]: v }))
  const target = f.target

  // ?to=<shelter id> preselects families assigned to that shelter.
  useEffect(() => {
    const to = params.get('to')
    if (to && d.shelters.some((s) => s.id === to)) {
      setF((x) => ({ ...x, target: { type: 'shelter', shelter_id: to } }))
      setParams({}, { replace: true })
    }
  }, [params, d.shelters, setParams])

  useEffect(() => {
    let current = true
    setReach(null)
    setReachError(false)
    if (d.disasterId)
      api.previewUpdate(d.disasterId, { target })
        .then((r) => { if (current) setReach(r.recipient_count) })
        .catch(() => { if (current) setReachError(true) })
    return () => { current = false }
  }, [d.disasterId, target])

  const applyTemplate = (id: string) => {
    const t = BROADCAST_TEMPLATES.find((x) => x.id === id)
    if (t) setF((x) => ({ ...x, title: t.title, message: t.message, severity: t.severity }))
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const where = target.type === 'shelter' ? 'families assigned to the selected shelter' : 'every family in this disaster'
    if (f.severity === 'critical' && !confirm(`Send a critical alert to ${where}?`)) return
    setBusy(true)
    try {
      const created = await d.mutate((client, disasterId) =>
        client.publishUpdate(disasterId, { title: f.title.trim(), message: f.message.trim(), severity: f.severity, target }),
      )
      setSent(created)
      setF(blank)
      setTemplateId('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const shelterName = (id: string) => d.shelters.find((s) => s.id === id)?.name || id
  const history = [...d.updates]
    .filter((u) => filter === 'all' || u.severity === filter)
    .sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''))

  return (
    <div className="hx-page">
      <Head title="Broadcasts" sub="Publish official updates to every family in this disaster or to families assigned to one shelter." />
      <div className="hx-bc">
        <form className={`hx-panel hx-compose hx-sev-${f.severity}`} onSubmit={submit}>
          <div className="hx-compose-head">
            <h2>New broadcast</h2>
            <div className="tpl">
              <label className="sr-only" htmlFor="hx-tpl">Template</label>
              <select id="hx-tpl" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="">Start from a template</option>
                {BROADCAST_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button type="button" className="btn" disabled={!templateId} onClick={() => applyTemplate(templateId)}>Apply</button>
            </div>
          </div>
          <div className="hx-field"><span>Severity</span>
            <Seg label="Severity" className="seg-block" value={f.severity} onChange={(v) => set('severity', v)} options={SEVERITIES.map((s) => [s, cap(s), `sev-${s}`] as const)} />
            <span className="hint">{SEVERITY_HELP[f.severity]}</span>
          </div>
          <label className="hx-field"><span>Title</span><input value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={120} required placeholder="Evacuation order: Zone A" /></label>
          <label className="hx-field">
            <span className="hx-field-row">Message <span className="hint">{f.message.length} of 600</span></span>
            <textarea rows={6} maxLength={600} value={f.message} onChange={(e) => set('message', e.target.value)} required placeholder="What should families do, and by when?" />
          </label>
          <label className="hx-field"><span>Who receives it</span>
            <select value={target.type === 'shelter' ? target.shelter_id : ''} onChange={(e) => set('target', e.target.value ? { type: 'shelter', shelter_id: e.target.value } : { type: 'all' })}>
              <option value="">All families in this disaster</option>
              {d.shelters.map((s) => <option key={s.id} value={s.id}>Families assigned to {s.name}</option>)}
            </select>
          </label>
          {error && <p className="notice notice-error" role="alert">{error}</p>}
          {sent && <p className="notice notice-ok" role="status">Sent “{sent.title}”.</p>}
          <div className="hx-sendbar">
            <span className="hx-reach">
              <Users size={16} aria-hidden="true" />
              {reach === null ? (reachError ? 'Recipient count unavailable' : 'Counting families…') : <span><b>{reach.toLocaleString()}</b> {reach === 1 ? 'family' : 'families'} will receive this</span>}
            </span>
            <button className={`btn ${SEND_CLASS[f.severity]}`} disabled={busy || !f.title.trim() || !f.message.trim()}>
              <Send size={14} aria-hidden="true" /> {busy ? 'Sending…' : `Send ${f.severity} broadcast`}
            </button>
          </div>
        </form>

        <section className="hx-panel hx-history">
          <div className="hx-panel-title" style={{ margin: 0 }}>
            <h2>Sent broadcasts <span className="muted" style={{ fontWeight: 400 }}>{d.updates.length}</span></h2>
            <select style={{ width: 'auto' }} value={filter} onChange={(e) => setFilter(e.target.value as HistoryFilter)} aria-label="Filter sent broadcasts">
              <option value="all">All severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </div>
          {history.length === 0 && <Empty>No broadcasts match.</Empty>}
          {history.map((u) => (
            <article key={u.id} className={`hx-sev-${u.severity}`}>
              <div className="r1">
                <span className={`badge ${SEV_TONE[u.severity]}`}>{cap(u.severity)}</span>
                <strong>{u.title}</strong>
              </div>
              <p>{u.message}</p>
              <div className="r3">
                <span className="hx-tag">{u.target?.type === 'shelter' ? `Families assigned to ${shelterName(u.target.shelter_id)}` : 'All families in this disaster'}</span>
                <span title={fullTime(u.published_at)}>Sent {timeAgo(u.published_at)}</span>
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  )
}
