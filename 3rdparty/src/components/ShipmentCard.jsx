import { useState } from 'react'
import { ArrowRight, Clock } from 'lucide-react'
import { useData } from '../data.jsx'
import { PriorityBadge } from './ui.jsx'
import { SHIPMENT_LABEL } from '../lib/constants.js'
import { clock, isLate, timeAgo } from '../lib/format.js'

// One shipment, from this partner's point of view, with the actions they're allowed.
export default function ShipmentCard({ s }) {
  const d = useData()
  const [busy, setBusy] = useState(false)
  const outbound = d.mine(s.from)
  const late = isLate(s)

  const actions = []
  if (outbound && s.status === 'approved') actions.push({ status: 'in_transit', label: 'Mark departed', primary: true })
  if (outbound && s.status === 'requested') actions.push({ status: 'cancelled', label: 'Withdraw offer', confirm: 'Withdraw this offer?' })
  if (!outbound && s.status === 'in_transit') actions.push({ status: 'delivered', label: 'Confirm delivery', primary: true, confirm: `Confirm you received ${s.items.map((i) => `${i.quantity} ${d.rt(i.resource_type_id).unit} ${d.rt(i.resource_type_id).name.toLowerCase()}`).join(', ')}?` })

  async function act(a) {
    if (a.confirm && !confirm(a.confirm)) return
    setBusy(true)
    await d.mutate((api) => api.updateShipment(s.id, { status: a.status })).catch((e) => alert(e.message))
    setBusy(false)
  }

  return (
    <article className={`ship ship-${s.status} ${late ? 'late' : ''}`}>
      <div className="row-between">
        <span className={`badge ${outbound ? 'dir-out' : 'dir-in'}`}>{outbound ? 'Outgoing' : 'Incoming'}</span>
        <PriorityBadge priority={s.priority} />
      </div>
      <div className="ship-route">
        <span>{outbound ? 'You' : s.from.name}</span>
        <ArrowRight size={14} className="muted" />
        <span>{outbound ? s.to.name : 'You'}</span>
      </div>
      <ul className="ship-items">
        {s.items.map((i) => <li key={i.resource_type_id}><strong>{i.quantity}</strong> {d.rt(i.resource_type_id).unit} · {d.rt(i.resource_type_id).name}</li>)}
      </ul>
      {s.notes && <div className="muted small ship-notes">{s.notes}</div>}
      <div className="ship-status">
        <span className={`badge ship-${s.status}`}>{SHIPMENT_LABEL[s.status]}</span>
        <span className={`small ${late ? 'tone-alert' : 'muted'}`}>
          {late && <><Clock size={12} /> Late · </>}
          {s.status === 'delivered' ? `delivered ${timeAgo(s.updated_at)}` : s.eta ? `ETA ${clock(s.eta)}` : ''}
        </span>
      </div>
      {actions.length > 0 && (
        <div className="ship-actions">
          {actions.map((a) => (
            <button key={a.status} className={`btn btn-sm ${a.primary ? 'btn-primary' : 'btn-ghost danger'}`} disabled={busy} onClick={() => act(a)}>{a.label}</button>
          ))}
        </div>
      )}
    </article>
  )
}
