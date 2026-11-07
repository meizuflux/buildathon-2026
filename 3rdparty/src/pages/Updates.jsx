import { useData } from '../data.jsx'
import { Empty, PageHead } from '../components/ui.jsx'
import { cap, fullTime, timeAgo } from '../lib/format.js'

export default function Updates() {
  const d = useData()
  const list = [...d.updates].sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''))
  return (
    <div className="page narrow">
      <PageHead title="Official updates" subtitle={`Broadcasts from the operations center for ${d.disaster?.name || 'this disaster'}. Families receive these too — expect questions about them.`} />
      <div className="stack">
        {list.length === 0 && <Empty>No official updates yet.</Empty>}
        {list.map((u) => (
          <article key={u.id} className={`card-panel upd sev-border-${u.severity}`}>
            <div className="row-between">
              <span><span className={`badge sev-${u.severity}`}>{cap(u.severity)}</span> <strong>{u.title}</strong></span>
              <span className="muted small" title={fullTime(u.published_at)}>{timeAgo(u.published_at)}</span>
            </div>
            <p>{u.message}</p>
            {u.target?.type === 'radius' && <div className="muted small">Sent to: {u.target.label}</div>}
          </article>
        ))}
      </div>
    </div>
  )
}
