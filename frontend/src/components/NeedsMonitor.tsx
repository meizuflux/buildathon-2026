import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check, RefreshCw, TriangleAlert } from 'lucide-react'
import { useData } from '../data'
import { REQUIREMENTS, REQ_LABEL, useEvacuationPreview } from '../lib/evac'
import { Empty } from './ui'

function Row({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className={`hx-check ${ok ? 'ok' : 'bad'}`}>
      {ok ? <Check size={15} aria-label="OK" /> : <TriangleAlert size={15} aria-label="Needs attention" />}
      <span>{children}</span>
    </li>
  )
}

// Active phase only: how well the published (personalized) assignments cover household needs.
export default function NeedsMonitor() {
  const d = useData()
  const { preview, loading, error, reload } = useEvacuationPreview(d.disasterId, true)
  const m = preview?.personalized
  const naive = preview?.naive
  return (
    <section aria-label="Needs monitor">
      <div className="hx-panel-title">
        <h2>Needs monitor</h2>
        <button className="icon-btn" onClick={reload} disabled={loading} aria-label="Refresh needs monitor" title="Refresh"><RefreshCw size={14} /></button>
      </div>
      {error ? (
        <p className="notice notice-error" role="alert">Needs monitor could not be loaded: {error}</p>
      ) : !m ? (
        <p className="muted">{loading ? 'Loading needs…' : 'No data yet.'}</p>
      ) : m.households === 0 ? <Empty>No households registered.</Empty> : (
        <>
          <ul className="hx-checks-list">
            {REQUIREMENTS.map((r) => m.needs.find((n) => n.requirement === r)).filter((n) => n && n.households > 0).map((n) => n && (
              <Row key={n.requirement} ok={n.unmet_households === 0}>
                {REQ_LABEL[n.requirement]} <b>{n.households - n.unmet_households} / {n.households}</b> met
              </Row>
            ))}
            <Row ok={m.overcrowded_shelters === 0}>Shelters over capacity <b>{m.overcrowded_shelters}</b></Row>
            <Row ok={m.people_over_capacity === 0}>People over capacity <b>{m.people_over_capacity.toLocaleString()}</b></Row>
            <Row ok={m.idle_shelters === 0}>Idle shelters <b>{m.idle_shelters}</b></Row>
          </ul>
          {naive && (
            <p className="small muted" style={{ marginTop: 10 }}>
              Nearest-shelter routing would leave {naive.unmet_households.toLocaleString()} households with unmet needs and {naive.people_over_capacity.toLocaleString()} people over capacity.{' '}
              <Link to="/evacuation-preview">Compare in the preview</Link>
            </p>
          )}
        </>
      )}
    </section>
  )
}
