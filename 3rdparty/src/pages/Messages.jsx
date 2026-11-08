import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PenSquare, Send } from 'lucide-react'
import { useData } from '../data.jsx'
import { api } from '../api.js'
import { Empty, Modal, PageHead } from '../components/ui.jsx'
import { fullTime, timeAgo } from '../lib/format.js'

export default function Messages() {
  const d = useData()
  const { id } = useParams()
  const navigate = useNavigate()
  const [compose, setCompose] = useState(false)
  const active = d.conversations.find((c) => c.id === id)

  return (
    <div className="page page-fill">
      <PageHead title="Messages" subtitle="Your direct line to the operations center.">
        <button className="btn btn-primary" onClick={() => setCompose(true)}><PenSquare size={15} /> New message</button>
      </PageHead>
      <div className={`inbox ${id ? 'has-thread' : ''}`}>
        <aside className="inbox-list">
          <ul>
            {d.conversations.length === 0 && <Empty>No conversations yet.</Empty>}
            {d.conversations.map((c) => (
              <li key={c.id}>
                <Link to={`/messages/${c.id}`} className={`conv ${c.id === id ? 'active' : ''} ${c.unread_count ? 'unread' : ''}`}>
                  <div className="conv-body">
                    <div className="row-between"><span className="conv-name">{c.subject}</span><span className="muted small nowrap">{timeAgo(c.last_message_at)}</span></div>
                    <div className="conv-preview muted">{c.last_message_preview}</div>
                  </div>
                  {c.unread_count > 0 && <span className="nav-badge tone-info">{c.unread_count}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </aside>
        {active ? <Thread key={active.id} conv={active} /> : <div className="thread thread-empty"><Empty>Pick a conversation or start a new one.</Empty></div>}
      </div>
      {compose && <Compose onClose={() => setCompose(false)} onCreated={(c) => navigate(`/messages/${c.id}`)} />}
    </div>
  )
}

function Thread({ conv }) {
  const d = useData()
  const [messages, setMessages] = useState([])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef(null)
  const count = useRef(0)

  const load = useCallback(async () => {
    const list = await api.listMessages(conv.id).catch(() => null)
    if (!list) return
    setMessages(list)
    if (list.length !== count.current) {
      count.current = list.length
      requestAnimationFrame(() => end.current?.scrollIntoView({ block: 'end' }))
    }
  }, [conv.id])

  useEffect(() => {
    load()
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    if (conv.unread_count > 0) api.markConversationRead(conv.id).then(d.refresh).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.id, conv.unread_count, messages.length])

  async function send(e) {
    e?.preventDefault()
    const text = body.trim()
    if (!text) return
    setBusy(true)
    try {
      await api.sendMessage(conv.id, text)
      setBody('')
      await load()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="thread">
      <header className="thread-head">
        <Link to="/messages" className="back-sm">‹ All</Link>
        <div><div className="thread-name">{conv.subject}</div><div className="muted small">with Operations center</div></div>
      </header>
      <ol className="messages">
        {messages.map((m) => {
          const mine = m.sender.kind !== 'operator'
          return (
            <li key={m.id} className={`msg ${mine ? 'mine' : ''}`}>
              <div className="bubble">{m.body}</div>
              <div className="msg-meta muted small" title={fullTime(m.created_at)}>{mine ? 'You' : 'Operations'} · {timeAgo(m.created_at)}</div>
            </li>
          )
        })}
        <li ref={end} aria-hidden="true" />
      </ol>
      <form className="composer" onSubmit={send}>
        <textarea rows={2} value={body} placeholder="Message operations…" onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
        <button className="btn btn-primary" disabled={busy || !body.trim()} aria-label="Send"><Send size={16} /></button>
      </form>
    </section>
  )
}

function Compose({ onClose, onCreated }) {
  const d = useData()
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const c = await d.mutate((api, disasterId) => api.createConversation({ disaster_id: disasterId, participant: { kind: d.site.kind, id: d.site.id }, subject: subject || 'Message from partner', message }))
      onCreated(c)
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <Modal title="Message the operations center" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label className="field"><span>Subject</span><input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Generator failing" /></label>
        <label className="field"><span>Message</span><textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} required /></label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !message.trim()}>{busy ? 'Sending…' : 'Send'}</button>
        </div>
      </form>
    </Modal>
  )
}
