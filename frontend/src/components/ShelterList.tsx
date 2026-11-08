import { useMemo, useState } from 'react'
import { RESOURCE_KEYS } from '../lib/constants'
import { LEVEL_LABEL, cap, shelterLevel, timeAgo } from '../lib/format'
import type { Shelter } from '../api/types'

const FILTERS: Record<string, { label: string; test: (s: Shelter) => boolean }> = {
  accepting: { label: 'Has space', test: (s) => s.status === 'open' && s.capacity.available_people > 0 },
  pets: { label: 'Pets', test: (s) => s.capabilities.pets_allowed },
  children: { label: 'Children', test: (s) => s.capabilities.child_friendly },
  wheelchair: { label: 'Wheelchair', test: (s) => s.capabilities.wheelchair_accessible },
  medical: { label: 'Medical staff', test: (s) => s.capabilities.medical_staff?.length > 0 },
  shortage: { label: 'Shortages', test: (s) => Object.values(s.resources).some((v) => v === 'limited' || v === 'unavailable') },
}

export default function ShelterList({ shelters, selectedId, onSelect, onEdit, onAdd }: {
  shelters: Shelter[]
  selectedId: string | null
  onSelect: (id: string) => void
  onEdit: (shelter: Shelter) => void
  onAdd: () => void
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<string[]>([])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return shelters
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q))
      .filter((s) => active.every((f) => FILTERS[f].test(s)))
  }, [shelters, query, active])

  const toggle = (f: string) => setActive((a) => (a.includes(f) ? a.filter((x) => x !== f) : [...a, f]))

  return (
    <div className="panel-body">
      <div className="panel-toolbar">
        <input
          className="search"
          type="search"
          placeholder="Search shelters"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search shelters"
        />
        <button className="btn btn-primary" onClick={onAdd}>+ Add shelter</button>
      </div>
      <div className="filters" role="group" aria-label="Filter shelters">
        {Object.entries(FILTERS).map(([k, f]) => (
          <button key={k} className={`filter ${active.includes(k) ? 'on' : ''}`} aria-pressed={active.includes(k)} onClick={() => toggle(k)}>
            {f.label}
          </button>
        ))}
      </div>

      <ul className="list">
        {shown.length === 0 && <li className="empty">No shelters match.</li>}
        {shown.map((s) => {
          const level = shelterLevel(s)
          const { total_people: total, available_people: avail } = s.capacity
          const pct = total ? Math.min(100, ((total - Math.max(0, avail)) / total) * 100) : 0
          return (
            <li key={s.id} className={`card shelter ${s.id === selectedId ? 'selected' : ''}`}>
              <button className="card-main" onClick={() => onSelect(s.id)}>
                <div className="card-head">
                  <span className={`dot lvl-${level}`} aria-hidden="true" />
                  <span className="card-title">{s.name}</span>
                  <span className={`badge lvl-${level}`}>{LEVEL_LABEL[level]}</span>
                </div>
                <div className="card-sub">{s.address}</div>
                <div className="cap-row">
                  <div className="meter meter-sm" aria-hidden="true"><span className={`lvl-bg-${level}`} style={{ width: `${pct}%` }} /></div>
                  <span className="cap-text"><strong>{avail}</strong> / {total} spaces free</span>
                </div>
                <div className="chips">
                  {RESOURCE_KEYS.map((k) => (
                    <span key={k} className={`chip res-${s.resources[k] || 'unknown'}`} title={`${cap(k)}: ${s.resources[k] || 'unknown'}`}>
                      {cap(k)}
                    </span>
                  ))}
                </div>
                <div className="chips caps">
                  {s.capabilities.pets_allowed && <span className="tag">Pets</span>}
                  {s.capabilities.child_friendly && <span className="tag">Children</span>}
                  {s.capabilities.wheelchair_accessible && <span className="tag">Wheelchair</span>}
                  {s.capabilities.medical_staff?.map((m) => <span key={m} className="tag tag-med">{cap(m)}</span>)}
                </div>
                {s.capabilities.special_care_notes && <div className="card-note">{s.capabilities.special_care_notes}</div>}
              </button>
              <div className="card-foot">
                <span className="muted">Updated {timeAgo(s.updated_at)}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => onEdit(s)}>Edit</button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
