import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Building2, Home, PackagePlus, PenSquare, Send, Truck, User } from 'lucide-react'
import { useData } from '../data.jsx'
import { api } from '../api/index.js'
import { Empty, Modal, PageHeader, SiteSelect } from '../components/ui.jsx'
import ShipmentDialog from '../components/ShipmentDialog.jsx'
import NeedDialog from '../components/NeedDialog.jsx'
import { fullTime, timeAgo } from '../lib/format.js'

const KIND_ICON = { shelter: Home, organization: Building2, family: User }
const QUICK = ['Acknowledged — on it.', 'Dispatching now. Will confirm ETA.', 'Please send your current headcount.', 'Can you confirm what you need most?']

export default function Messages() {
  const d = useData()
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [kind, setKind] = useState('all')
  const [compose, setCompose] = useState(null)

  // ?to=family:family_014 → open existing thread with that participant, or start one.
  useEffect(() => {
    const to = params.get('to')
    if (!to || !d.loaded) return
    const [k, ...rest] = to.split(':')
    const pid = rest.join(':')
    const existing = d.conversations.find((c) => c.participant.kind === k && c.participant.id === pid)
    if (existing) navigate(`/comms/messages/${existing.id}`, { replace: true })
    else {
      setCompose({ participant: { kind: k, id: pid }, subject: params.get('subject') || '' })
      setParams({}, { replace: true })
    }
  }, [params, d.loaded, d.conversations, navigate, setParams])

  const list = d.conversations.filter((c) => kind === 'all' || (kind === 'unread' ? c.unread_count > 0 : c.participant.kind === kind))
  const active = d.conversations.find((c) => c.id === id)

  return (
    <div className="page page-fill">
      <PageHeader title="Messages" subtitle="Direct threads with shelters, relief organizations and families.">
        <button className="btn btn-primary" onClick={() => setCompose({})}><PenSquare size={15} /> New message</button>
      </PageHeader>

      <div className="inbox">
        <aside className="inbox-list">
          <div className="filters inbox-filters">
            {[['all', 'All'], ['unread', 'Unread'], ['shelter', 'Shelters'], ['organization', 'Orgs'], ['family', 'Families']].map(([k, label]) => (
              <button key={k} className={`filter ${kind === k ? 'on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>{label}</button>
            ))}
          </div>
          <ul>
            {list.length === 0 && <Empty>No conversations.</Empty>}
            {list.map((c) => {
              const Icon = KIND_ICON[c.participant.kind] || User
              return (
                <li key={c.id}>
                  <Link to={`/comms/messages/${c.id}`} className={`conv ${c.id === id ? 'active' : ''} ${c.unread_count ? 'unread' : ''}`}>
                    <Icon size={16} className="conv-icon" aria-hidden="true" />
                    <div className="conv-body">
                      <div className="row-between">
                        <span className="conv-name">{c.participant.name}</span>
                        <span className="muted small nowrap">{timeAgo(c.last_message_at)}</span>
                      </div>
                      <div className="conv-subject">{c.subject}</div>
                      <div className="conv-preview muted">{c.last_message_preview}</div>
                    </div>
                    {c.unread_count > 0 && <span className="nav-badge tone-info">{c.unread_count}</span>}
                  </Link>
                </li>
              )
            })}
          </ul>
        </aside>

        {active ? <Thread key={active.id} conv={active} /> : (
          <div className="thread thread-empty"><Empty>Select a conversation, or start a new one.</Empty></div>
        )}
      </div>

      {compose && <ComposeDialog initial={compose} onClose={() => setCompose(null)} onCreated={(c) => navigate(`/comms/messages/${c.id}`)} />}
    </div>
  )
}

function Thread({ conv }) {
  const d = useData()
  const [messages, setMessages] = useState([])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState(null)
  const end = useRef(null)
  const lastCount = useRef(0)

  const load = useCallback(async () => {
    const list = await api.listMessages(conv.id).catch(() => null)
    if (!list) return
    setMessages(list)
    if (list.length !== lastCount.current) {
      lastCount.current = list.length
      requestAnimationFrame(() => end.current?.scrollIntoView({ block: 'end' }))
    }
  }, [conv.id])

  useEffect(() => {
    load()
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [load])

  // Mark read when opened and whenever new participant messages arrive while open.
  useEffect(() => {
    if (conv.unread_count > 0) d.mutate((a) => a.markConversationRead(conv.id)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.id, conv.unread_count, messages.length])

  async function send(text) {
    const value = (text ?? body).trim()
    if (!value) return
    setBusy(true)
    try {
      await api.sendMessage(conv.id, value)
      setBody('')
      await load()
      d.refresh()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  const p = conv.participant
  const site = d.site(p)
  const siteLink = p.kind === 'organization' ? `/organizations/${p.id}` : p.kind === 'shelter' ? `/map?shelter=${p.id}` : null

  return (
    <section className="thread">
      <header className="thread-head">
        <div>
          <div className="thread-name">{siteLink ? <Link to={siteLink}>{p.name}</Link> : p.name}</div>
          <div className="muted small">
            {conv.subject}
            {site?.contact?.phone && <> · {site.contact.name} · <a href={`tel:${site.contact.phone}`}>{site.contact.phone}</a></>}
            {site?.capacity && <> · {site.capacity.available_people}/{site.capacity.total_people} spaces free</>}
          </div>
        </div>
        {p.kind !== 'family' && (
          <div className="page-actions">
            <button className="btn btn-sm" onClick={() => setDialog('need')}><PackagePlus size={14} /> Log need</button>
            <button className="btn btn-sm" onClick={() => setDialog('ship')}><Truck size={14} /> Send resources</button>
          </div>
        )}
      </header>

      <ol className="messages">
        {messages.map((m) => (
          <li key={m.id} className={`msg ${m.sender.kind === 'operator' ? 'mine' : ''}`}>
            <div className="bubble">{m.body}</div>
            <div className="msg-meta muted small" title={fullTime(m.created_at)}>
              {m.sender.kind === 'operator' ? 'You (operator)' : m.sender.name} · {timeAgo(m.created_at)}
            </div>
          </li>
        ))}
        <li ref={end} aria-hidden="true" />
      </ol>

      <div className="quick">
        {QUICK.map((q) => <button key={q} className="filter" onClick={() => send(q)} disabled={busy}>{q}</button>)}
      </div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send() }}>
        <textarea rows={2} value={body} placeholder={`Message ${p.name}…  (Enter to send, Shift+Enter for a new line)`}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
        <button className="btn btn-primary" disabled={busy || !body.trim()} aria-label="Send"><Send size={16} /></button>
      </form>

      {dialog === 'ship' && <ShipmentDialog initial={{ to: { kind: p.kind, id: p.id } }} onClose={() => setDialog(null)}
        onCreated={(s) => send(`Dispatched ${s.items.map((i) => `${i.quantity} ${d.rt(i.resource_type_id).unit} ${d.rt(i.resource_type_id).name.toLowerCase()}`).join(', ')} from ${s.from.name}. ETA ${new Date(s.eta).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`)} />}
      {dialog === 'need' && <NeedDialog initial={{ requester: { kind: p.kind, id: p.id } }} onClose={() => setDialog(null)} />}
    </section>
  )
}

function ComposeDialog({ initial, onClose, onCreated }) {
  const d = useData()
  const [kind, setKind] = useState(initial.participant?.kind === 'family' ? 'family' : 'site')
  const [site, setSite] = useState(initial.participant?.kind !== 'family' ? initial.participant || null : null)
  const [familyId, setFamilyId] = useState(initial.participant?.kind === 'family' ? initial.participant.id : '')
  const [subject, setSubject] = useState(initial.subject || '')
  const [message, setMessage] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    const participant = kind === 'family' ? (familyId.trim() ? { kind: 'family', id: familyId.trim() } : null) : site
    if (!participant) return setError('Choose a recipient.')
    setBusy(true)
    try {
      const c = await d.mutate((api, disasterId) => api.createConversation({ disaster_id: disasterId, participant, subject: subject || '(no subject)', message }))
      onCreated(c)
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title="New message" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <span>Recipient type</span>
          <div className="filters">
            <button type="button" className={`filter ${kind === 'site' ? 'on' : ''}`} onClick={() => setKind('site')}>Shelter or organization</button>
            <button type="button" className={`filter ${kind === 'family' ? 'on' : ''}`} onClick={() => setKind('family')}>Family</button>
          </div>
        </div>
        {kind === 'site' ? (
          <label className="field"><span>To</span>
            <SiteSelect value={site} onChange={setSite} shelters={d.shelters} organizations={d.organizations} required />
          </label>
        ) : (
          <label className="field"><span>Family ID</span>
            <input value={familyId} onChange={(e) => setFamilyId(e.target.value)} placeholder="family_014" list="family-ids" required />
            <datalist id="family-ids">{[...new Set(d.reports.map((r) => r.family_id))].map((f) => <option key={f} value={f} />)}</datalist>
          </label>
        )}
        <label className="field"><span>Subject</span><input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Transport for wheelchair users" /></label>
        <label className="field"><span>Message</span><textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} required /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !message.trim()}>{busy ? 'Sending…' : 'Send'}</button>
        </div>
      </form>
    </Modal>
  )
}
