import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useData } from '../data.jsx'
import { emptyShelter } from '../lib/constants.js'
import ShelterMap from '../components/ShelterMap.jsx'
import ShelterList from '../components/ShelterList.jsx'
import ShelterForm from '../components/ShelterForm.jsx'
import ReportsPanel from '../components/ReportsPanel.jsx'

export default function MapPage() {
  const d = useData()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState(params.get('tab') === 'reports' || params.get('report') ? 'reports' : 'shelters')
  const [selectedId, setSelectedId] = useState(params.get('shelter'))
  const [focus, setFocus] = useState(null)
  const [layers, setLayers] = useState({ shelters: true, organizations: true, reports: true, shipments: true })
  const [form, setForm] = useState(null) // { id|null, draft }

  // Deep links from other pages: ?shelter=… or ?report=…
  useEffect(() => {
    const sid = params.get('shelter')
    const rid = params.get('report')
    if (sid) {
      const s = d.shelters.find((x) => x.id === sid)
      if (s) {
        setSelectedId(sid)
        setTab('shelters')
        setFocus([s.location.latitude, s.location.longitude])
        setParams({}, { replace: true })
      }
    } else if (rid) {
      const r = d.reports.find((x) => x.id === rid)
      if (r) {
        setTab('reports')
        if (r.location) setFocus([r.location.latitude, r.location.longitude])
        setParams({}, { replace: true })
      }
    }
  }, [params, d.shelters, d.reports, setParams])

  const selectShelter = (id) => {
    setSelectedId(id)
    setTab('shelters')
    const s = d.shelters.find((x) => x.id === id)
    if (s) setFocus([s.location.latitude, s.location.longitude])
  }

  const openForm = (shelter) => {
    setTab('shelters')
    if (shelter) {
      const { id, updated_at, ...draft } = shelter // eslint-disable-line no-unused-vars
      setForm({ id: shelter.id, draft: structuredClone(draft) })
      setSelectedId(shelter.id)
      setFocus([shelter.location.latitude, shelter.location.longitude])
    } else {
      setForm({ id: null, draft: emptyShelter(d.disasterId) })
      setSelectedId(null)
    }
  }
  const setDraft = (fn) => setForm((f) => ({ ...f, draft: fn(f.draft) }))

  const saveShelter = async (draft) => {
    const { name, address, location, status, capacity, resources } = draft
    const capabilities = { ...draft.capabilities, special_care_notes: draft.capabilities.special_care_notes?.trim() || null }
    const saved = await d.mutate((api, disasterId) =>
      form.id
        ? api.updateShelter(form.id, { name, address, location, status, capacity, capabilities, resources })
        : api.createShelter({ ...draft, capabilities, disaster_id: disasterId }),
    )
    setForm(null)
    setSelectedId(saved.id)
  }

  return (
    <div className="map-page">
      <ShelterMap
        shelters={d.shelters}
        reports={d.reports}
        organizations={d.organizations}
        shipments={d.shipments}
        disasterId={d.disasterId}
        selectedId={selectedId}
        onSelect={selectShelter}
        focus={focus}
        layers={layers}
        setLayers={setLayers}
        picking={!!form}
        draftLocation={form?.draft.location}
        onPick={(loc) => setDraft((x) => ({ ...x, location: loc }))}
      />

      <aside className="side">
        <nav className="tabs" role="tablist">
          {[['shelters', `Shelters (${d.shelters.length})`], ['reports', `Family reports (${d.reports.length})`]].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''}
              onClick={() => { setTab(k); if (k !== 'shelters') setForm(null) }}>{label}</button>
          ))}
        </nav>
        {tab === 'shelters' && (form ? (
          <ShelterForm key={form.id || 'new'} draft={form.draft} setDraft={setDraft} isNew={!form.id} onCancel={() => setForm(null)} onSave={saveShelter} />
        ) : (
          <ShelterList shelters={d.shelters} selectedId={selectedId} onSelect={selectShelter} onEdit={openForm} onAdd={() => openForm(null)} />
        ))}
        {tab === 'reports' && (
          <ReportsPanel
            reports={d.reports}
            showOnMap={layers.reports}
            setShowOnMap={(v) => setLayers((l) => ({ ...l, reports: v }))}
            onLocate={(loc) => { setLayers((l) => ({ ...l, reports: true })); setFocus([loc.latitude, loc.longitude]) }}
          />
        )}
      </aside>
    </div>
  )
}
