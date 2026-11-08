import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import type { MapLayers, Shelter, ShelterInput } from '../api/types'
import { useData } from '../data'
import { RESOURCE_KEYS, emptyShelter } from '../lib/constants'
import { cap, timeAgo } from '../lib/format'
import { LEVEL_TEXT, capabilityTags, occupancy, shelterLevel } from '../lib/ops'
import OpsMap, { LayerPanel } from '../components/OpsMap'
import ShelterEditor from '../components/ShelterEditor'
import { Empty, Meter, useAllFamilies } from '../components/ui'

type FilterKey = 'accepting' | 'pets' | 'children' | 'wheelchair' | 'medical' | 'shortage'
const FILTERS: Record<FilterKey, { label: string; test: (s: Shelter) => boolean }> = {
  accepting: { label: 'Has space', test: (s) => s.status === 'open' && s.capacity.available_people > 0 },
  pets: { label: 'Pets', test: (s) => s.capabilities.pets_allowed },
  children: { label: 'Children', test: (s) => s.capabilities.child_friendly },
  wheelchair: { label: 'Wheelchair', test: (s) => s.capabilities.wheelchair_accessible },
  medical: { label: 'Medical staff', test: (s) => s.capabilities.medical_staff.length > 0 },
  shortage: { label: 'Shortages', test: (s) => Object.values(s.resources).some((v) => v === 'limited' || v === 'unavailable') },
}
const FILTER_KEYS = Object.keys(FILTERS) as FilterKey[]

type Form = { id: string | null; draft: ShelterInput }

export default function MapPage() {
  const d = useData()
  const [params, setParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState<string | null>(params.get('shelter'))
  const [focus, setFocus] = useState<[number, number] | null>(null)
  const [layers, setLayers] = useState<MapLayers>({ shelters: true, families: true, reports: true })
  const [form, setForm] = useState<Form | null>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<FilterKey[]>([])
  const { families, error: familyError } = useAllFamilies(d.disasterId, layers.families)

  const openForm = useCallback((shelter: Shelter | null) => {
    if (shelter) {
      setForm({
        id: shelter.id,
        draft: {
          disaster_id: shelter.disaster_id,
          name: shelter.name,
          address: shelter.address,
          location: shelter.location,
          status: shelter.status,
          capacity: shelter.capacity,
          capabilities: shelter.capabilities,
          resources: shelter.resources,
        },
      })
      setSelectedId(shelter.id)
      setFocus([shelter.location.latitude, shelter.location.longitude])
    } else if (d.disasterId) {
      setForm({ id: null, draft: emptyShelter(d.disasterId) })
      setSelectedId(null)
    }
  }, [d.disasterId])

  // Deep links from other pages: ?shelter=…[&edit=1] or ?report=…
  useEffect(() => {
    const sid = params.get('shelter')
    const rid = params.get('report')
    if (sid) {
      const s = d.shelters.find((x) => x.id === sid)
      if (s) {
        setSelectedId(sid)
        setFocus([s.location.latitude, s.location.longitude])
        if (params.get('edit')) openForm(s)
        setParams({}, { replace: true })
      }
    } else if (rid) {
      const r = d.reports.find((x) => x.id === rid)
      if (r) {
        setLayers((l) => ({ ...l, reports: true }))
        if (r.location) setFocus([r.location.latitude, r.location.longitude])
        setParams({}, { replace: true })
      }
    }
  }, [params, d.shelters, d.reports, setParams, openForm])

  const select = (id: string) => {
    setSelectedId(id)
    const s = d.shelters.find((x) => x.id === id)
    if (s) setFocus([s.location.latitude, s.location.longitude])
    document.getElementById(`hx-sh-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }
  const setDraft = (fn: (draft: ShelterInput) => ShelterInput) => setForm((f) => (f ? { ...f, draft: fn(f.draft) } : f))
  const save = async (draft: ShelterInput) => {
    if (!form) return
    const id = form.id
    const { name, address, location, status, capacity, resources } = draft
    const capabilities = { ...draft.capabilities, special_care_notes: draft.capabilities.special_care_notes?.trim() || null }
    const saved = await d.mutate((client, disasterId) =>
      id
        ? client.updateShelter(id, { name, address, location, status, capacity, capabilities, resources })
        : client.createShelter({ ...draft, capabilities, disaster_id: disasterId }),
    )
    setForm(null)
    setSelectedId(saved.id)
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return d.shelters
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q))
      .filter((s) => active.every((f) => FILTERS[f].test(s)))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [d.shelters, query, active])
  const toggle = (f: FilterKey) => setActive((a) => (a.includes(f) ? a.filter((x) => x !== f) : [...a, f]))

  return (
    <div className="hx-mappage">
      <div className="hx-mapcol">
        <OpsMap shelters={d.shelters} families={families} reports={d.reports} layers={layers} fitKey={d.disasterId}
          selectedId={selectedId} onSelect={select} focus={focus}
          picking={!!form} draftLocation={form?.draft.location} onPick={(loc) => setDraft((x) => ({ ...x, location: loc }))} />
        {form ? <div className="hx-float hx-banner">Click the map to place the shelter</div>
          : <LayerPanel layers={layers} setLayers={setLayers} familyError={familyError} />}
      </div>

      <aside className="hx-side">
        {form ? (
          <ShelterEditor key={form.id || 'new'} draft={form.draft} setDraft={setDraft} isNew={!form.id} onCancel={() => setForm(null)} onSave={save} />
        ) : (
          <>
            <div className="hx-list-head">
              <div className="r">
                <h2>Shelters <span className="muted" style={{ fontWeight: 400 }}>{d.shelters.length}</span></h2>
                <button className="btn btn-primary btn-sm" onClick={() => openForm(null)} disabled={!d.disasterId}><Plus size={14} /> Add shelter</button>
              </div>
              <label className="hx-search"><Search size={15} /><input type="search" placeholder="Search by name or address" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search shelters" /></label>
              <div className="chips" role="group" aria-label="Filter shelters">
                {FILTER_KEYS.map((k) => <button key={k} className="chip" aria-pressed={active.includes(k)} onClick={() => toggle(k)}>{FILTERS[k].label}</button>)}
              </div>
            </div>
            <ul className="hx-shelters">
              {shown.length === 0 && <Empty>No shelters match.</Empty>}
              {shown.map((s) => {
                const level = shelterLevel(s)
                return (
                  <li key={s.id} id={`hx-sh-${s.id}`} className={s.id === selectedId ? 'sel' : ''}>
                    <button className="main" onClick={() => select(s.id)}>
                      <div className="r1"><span className="nm">{s.name}</span><span className={`lv lvl-text-${level}`}>{LEVEL_TEXT[level]}</span></div>
                      <div className="addr">{s.address}</div>
                      <div className="cap"><Meter value={occupancy(s)} level={level} thin /><span><b>{Math.max(0, s.capacity.available_people).toLocaleString()}</b> of {s.capacity.total_people.toLocaleString()} free</span></div>
                      <div className="hx-res">{RESOURCE_KEYS.map((k) => <span key={k} className={`r-${s.resources[k] || 'unknown'}`} title={`${cap(k)}: ${s.resources[k] || 'unknown'}`}>{cap(k)}</span>)}</div>
                      <div className="hx-tags">
                        {capabilityTags(s).map((t) => <span key={t} className="hx-tag">{t}</span>)}
                        {s.capabilities.medical_staff.map((m) => <span key={m} className="hx-tag med">{cap(m)}</span>)}
                      </div>
                      {s.capabilities.special_care_notes && <div className="hx-note">{s.capabilities.special_care_notes}</div>}
                    </button>
                    <div className="foot">
                      <span>Updated {timeAgo(s.updated_at)}</span>
                      <span style={{ display: 'flex', gap: 6 }}>
                        <Link className="btn btn-ghost btn-sm" to={`/comms/broadcasts?to=${encodeURIComponent(s.id)}`}>Message</Link>
                        <button className="btn btn-sm" onClick={() => openForm(s)}>Edit</button>
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </aside>
    </div>
  )
}
