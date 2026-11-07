import { useState } from 'react'
import { useData } from '../data.jsx'
import { Empty, PageHead, Segmented } from '../components/ui.jsx'
import ShipmentCard from '../components/ShipmentCard.jsx'

const ORDER = { in_transit: 0, approved: 1, requested: 2, delivered: 3, cancelled: 4 }

export default function Shipments() {
  const d = useData()
  const [view, setView] = useState('active')
  const filter = (list) => list
    .filter((s) => (view === 'active' ? ['requested', 'approved', 'in_transit'].includes(s.status) : ['delivered', 'cancelled'].includes(s.status)))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.updated_at.localeCompare(a.updated_at))
  const inbound = filter(d.inbound)
  const outbound = filter(d.outbound)

  return (
    <div className="page">
      <PageHead title="Shipments" subtitle={d.isOrg
        ? 'Deliveries to you, and supplies you are sending. Mark shipments departed when they leave, so operations can track them.'
        : 'Supplies on their way to you. Confirm delivery when they arrive — it closes out your request automatically.'}>
        <Segmented value={view} onChange={setView} label="Show" options={[['active', 'Active'], ['history', 'History']]} />
      </PageHead>

      <div className={d.isOrg ? 'two-col' : ''}>
        <section>
          <h2 className="section-title">Incoming ({inbound.length})</h2>
          {inbound.length === 0 ? <Empty>{view === 'active' ? 'Nothing on its way to you.' : 'No past deliveries.'}</Empty> : (
            <div className="ship-grid">{inbound.map((s) => <ShipmentCard key={s.id} s={s} />)}</div>
          )}
        </section>
        {d.isOrg && (
          <section>
            <h2 className="section-title">Outgoing ({outbound.length})</h2>
            {outbound.length === 0 ? <Empty>{view === 'active' ? 'No outgoing shipments. Offer stock from Help nearby.' : 'No past shipments.'}</Empty> : (
              <div className="ship-grid">{outbound.map((s) => <ShipmentCard key={s.id} s={s} />)}</div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
