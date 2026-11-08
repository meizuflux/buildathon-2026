import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownToLine, ArrowRight, Boxes, CircleHelp, ClipboardList, Clock3, PackageCheck, Plus, Search, Truck } from 'lucide-react'
import { PageHeader } from '../components/ui.jsx'
import { useData } from '../data.jsx'
import { buildLogisticsPreview } from '../lib/logisticsPreview.js'

const SECTIONS = {
  needs: { title: 'Needs', subtitle: 'Requests for supplies and support across the response.', icon: ClipboardList, action: 'Add need' },
  dispatch: { title: 'Dispatch', subtitle: 'A preview of how deliveries could move from request to arrival.', icon: Truck, action: 'Create dispatch' },
  inventory: { title: 'Inventory', subtitle: 'A preview of supplies and quantities at local staging sites.', icon: Boxes, action: 'Add inventory' },
}

export default function Logistics({ section = 'needs' }) {
  const d = useData()
  const current = SECTIONS[section] ? section : 'needs'
  const config = SECTIONS[current]
  const preview = useMemo(() => {
    if (!d.loaded || !d.disasterId || d.errors.shelters) return null
    return buildLogisticsPreview(d.shelters)
  }, [d.loaded, d.disasterId, d.errors.shelters, d.shelters])
  const liveReady = !!preview && !d.errors.shelters
  return (
    <div className="page logistics-page">
      <PageHeader title={config.title} subtitle={config.subtitle}>
        <span className="badge logistics-wip">Work in progress</span>
        <button className="btn btn-primary" disabled><Plus size={15} />{config.action}</button>
      </PageHeader>

      <section className="logistics-preview-note" aria-label="Preview information">
        <div className="logistics-preview-icon"><CircleHelp size={19} /></div>
        <div>
          <strong>Preview only</strong>
          <p>Shelter details are live. Requests and delivery stages are examples; actions are not available yet.</p>
        </div>
        <span className="badge logistics-example-badge">Example data</span>
      </section>

      <div className="logistics-tabs" aria-label="Logistics sections">
        {Object.entries(SECTIONS).map(([key, item]) => {
          const TabIcon = item.icon
          return <Link key={key} to={`/logistics/${key}`} className={`logistics-tab ${key === current ? 'active' : ''}`} aria-current={key === current ? 'page' : undefined}>
            <TabIcon size={16} />{item.title}<ArrowRight size={13} className="logistics-tab-arrow" />
          </Link>
        })}
      </div>

      <div className="logistics-live-summary" aria-label="Live shelter summary">
        <div><span>Live shelters</span><strong>{liveReady ? preview.shelterCount : '—'}</strong></div>
        <div><span>Reserved spaces</span><strong>{liveReady ? preview.occupiedPeople.toLocaleString() : '—'}</strong></div>
        <span className="logistics-live-indicator"><i />From current shelter details</span>
      </div>

      {d.errors.shelters ? <PreviewState title="Shelter details unavailable" message="Shelter details could not be loaded. Try refreshing the page." />
        : !d.disasterId ? <PreviewState title="Choose a response area" message="Select a disaster area to view its shelter details and request examples." />
          : !d.loaded ? <PreviewState title="Loading shelter details" message="This preview will appear when shelter details are ready." loading />
            : preview.shelterCount === 0 ? <PreviewState title="No active shelters yet" message="Active shelter details will appear here when they are available." />
              : <>
                {current === 'needs' && <NeedsPreview needs={preview.needs} />}
                {current === 'dispatch' && <DispatchPreview groups={preview.dispatchGroups} />}
                {current === 'inventory' && <InventoryPreview stock={preview.stock} />}
              </>}
    </div>
  )
}

function PreviewState({ title, message, loading = false }) {
  return <section className="card-panel logistics-state" aria-live="polite">
    <div className={`logistics-state-mark ${loading ? 'is-loading' : ''}`}><Boxes size={20} /></div>
    <div><h2>{title}</h2><p className="muted">{message}</p></div>
  </section>
}

function PlaceholderStats({ items }) {
  return <section className="logistics-stats" aria-label="Example summary">
    {items.map(([label, note]) => <div className="logistics-stat" key={label}>
      <span className="logistics-stat-label">{label}</span><strong>—</strong><span className="muted small">{note}</span>
    </div>)}
  </section>
}

function PreviewTools({ placeholder, filters = ['All statuses', 'All locations'] }) {
  return <div className="toolbar logistics-tools">
    <label className="logistics-search"><Search size={15} /><input type="search" placeholder={placeholder} disabled aria-label={placeholder} /></label>
    {filters.map((filter) => <select key={filter} disabled aria-label={filter}><option>{filter}</option></select>)}
    <span className="muted small">Filters are part of this preview.</span>
  </div>
}

function NeedsPreview({ needs }) {
  return <>
    <PlaceholderStats items={[[ 'Open requests', 'Example count' ], [ 'Urgent', 'Example count' ], [ 'Awaiting review', 'Example count' ], [ 'Recently updated', 'Example time' ]]} />
    <section className="card-panel logistics-panel">
      <div className="panel-title"><div><h2>Recent requests</h2><p className="muted small">Every row below is an example.</p></div><button className="btn btn-sm" disabled><ArrowDownToLine size={14} />Export</button></div>
      <PreviewTools placeholder="Search example requests" filters={['All priorities', 'All statuses']} />
      <div className="table-scroll"><table className="table logistics-table">
        <thead><tr><th>Request</th><th>Location</th><th>Priority</th><th>Status</th><th>Details</th><th aria-label="Actions" /></tr></thead>
        <tbody>{needs.map((row) => <tr key={row.id}>
          <td><strong>{row.request}</strong><span className="logistics-secondary">{row.reference} · {row.quantity} · Example request</span></td>
          <td><Link to={`/map?shelter=${encodeURIComponent(row.shelterId)}`}>{row.site}</Link><span className="logistics-secondary">Live shelter details</span></td>
          <td><span className={`logistics-priority priority-${row.priority.toLowerCase()}`}>{row.priority}</span></td>
          <td><span className="logistics-status"><i />{row.status}</span></td>
          <td><span className={`chip res-${row.availability || 'unknown'}`}>{row.availability || 'unknown'}</span><span className="logistics-secondary">{row.note}</span></td>
          <td><button className="btn btn-sm" disabled>Review</button></td>
        </tr>)}</tbody>
      </table></div>
      <div className="logistics-table-foot"><span>Showing {needs.length} example request{needs.length === 1 ? '' : 's'}</span><div><button className="btn btn-sm" disabled>Previous</button><button className="btn btn-sm" disabled>Next</button></div></div>
    </section>
  </>
}

function DispatchPreview({ groups }) {
  return <>
    <PlaceholderStats items={[[ 'Planned deliveries', 'Example count' ], [ 'In transit', 'Example count' ], [ 'Arriving today', 'Example count' ], [ 'Completed', 'Example count' ]]} />
    <section className="logistics-panel">
      <div className="logistics-board-heading"><div><h2>Delivery board</h2><p className="muted small">Example deliveries shown across each step.</p></div><button className="btn btn-sm" disabled><Clock3 size={14} />Timeline</button></div>
      <div className="logistics-board">
        {groups.map((group) => <section className={`logistics-column column-${group.key}`} key={group.key}>
          <header><span><i />{group.label}</span><span className="logistics-column-count">{group.rows.length}</span></header>
          <div className="logistics-cards">{group.rows.map((row) => <article className="logistics-delivery-card" key={row.id}>
            <div className="logistics-delivery-top"><strong>{row.id}</strong><span className="badge logistics-example-badge">Example</span></div>
            <h3>{row.item}</h3>
            <div className="logistics-route"><span>{row.from}</span><ArrowRight size={14} /><span>{row.to}</span></div>
            <div className="logistics-delivery-foot"><span>{row.eta}</span><button className="icon-btn" aria-label="Delivery actions" disabled>···</button></div>
          </article>)}</div>
        </section>)}
      </div>
    </section>
    <p className="logistics-footnote"><PackageCheck size={15} /> Example delivery steps are shown for illustration. No deliveries are being tracked here.</p>
  </>
}

function InventoryPreview({ stock }) {
  return <>
    <PlaceholderStats items={[[ 'Supply types', 'Example count' ], [ 'Items available', 'Example total' ], [ 'Held for requests', 'Example total' ], [ 'Low stock', 'Example count' ]]} />
    <section className="card-panel logistics-panel">
      <div className="panel-title"><div><h2>Supply overview</h2><p className="muted small">Availability comes from live shelter details. Quantity and reserved counts are not tracked.</p></div><div className="logistics-panel-actions"><button className="btn btn-sm" disabled><ArrowDownToLine size={14} />Import</button><button className="btn btn-sm" disabled><Plus size={14} />Add item</button></div></div>
      <PreviewTools placeholder="Search shelter supplies" filters={['All categories', 'All locations']} />
      <div className="table-scroll"><table className="table logistics-table inventory-table">
        <thead><tr><th>Supply</th><th>Location</th><th>Availability</th><th className="num">Quantity</th><th className="num">Reserved</th><th>Updated</th><th aria-label="Actions" /></tr></thead>
        <tbody>{stock.map((row) => <tr key={row.id}>
          <td><strong>{row.item}</strong><span className="logistics-secondary">{row.category}</span></td>
          <td>{row.location}<span className="logistics-secondary">Live shelter details</span></td>
          <td><span className={`chip res-${row.availability || 'unknown'}`}>{row.availability || 'unknown'}</span></td>
          <td className="num"><strong>{row.quantity}</strong></td>
          <td className="num">{row.held}</td>
          <td className="muted small">{row.updated}</td>
          <td><button className="btn btn-sm" disabled>Edit</button></td>
        </tr>)}</tbody>
      </table></div>
      <div className="logistics-table-foot"><span>Showing {stock.length} live shelter resource{stock.length === 1 ? '' : 's'}</span><button className="btn btn-sm" disabled>View all supplies</button></div>
    </section>
  </>
}
