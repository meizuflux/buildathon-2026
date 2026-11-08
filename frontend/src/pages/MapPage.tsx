import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useData } from '../data'
import { api } from '../api'
import { emptyShelter } from '../lib/constants'
import ShelterMap from '../components/ShelterMap'
import ShelterList from '../components/ShelterList'
import ShelterForm from '../components/ShelterForm'
import type { Family, FamilyPage, MapLayers, Shelter, ShelterInput } from '../api/types'

type ShelterFormState = { id: string | null; draft: ShelterInput }

export default function MapPage() {
  const d = useData()
  const [params, setParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState<string | null>(params.get('shelter'))
  const [focus, setFocus] = useState<[number, number] | null>(null)
  const [layers, setLayers] = useState<MapLayers>({ shelters: true, families: true, reports: true })
  const [families, setFamilies] = useState<Family[]>([])
  const [familyError, setFamilyError] = useState<string | null>(null)
  const [form, setForm] = useState<ShelterFormState | null>(null)

  useEffect(() => {
    let active = true
    let loading = false
    setFamilies([])
    setFamilyError(null)
    const disasterId = d.disasterId
    if (!disasterId || !layers.families) return () => { active = false }
    const id: string = disasterId
    async function loadFamilies() {
      if (loading) return
      loading = true
      try {
        let offset = 0
        let page: FamilyPage
        const all: Family[] = []
        do {
          page = await api.listFamilies(id, 1000, offset)
          all.push(...page.families)
          offset += page.families.length
        } while (page.families.length && offset < page.total)
        if (active) { setFamilies(all); setFamilyError(null) }
      } catch (error) {
        if (active) setFamilyError(error instanceof Error ? error.message : 'Unknown error')
      } finally { loading = false }
    }
    loadFamilies()
    const timer = setInterval(loadFamilies, 12_000)
    return () => { active = false; clearInterval(timer) }
  }, [d.disasterId, layers.families])

  // Deep links from other pages: ?shelter=… or ?report=…
  useEffect(() => {
    const sid = params.get('shelter')
    const rid = params.get('report')
    if (sid) {
      const s = d.shelters.find((x) => x.id === sid)
      if (s) {
        setSelectedId(sid)
        setFocus([s.location.latitude, s.location.longitude])
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
  }, [params, d.shelters, d.reports, setParams])

  const selectShelter = (id: string) => {
    setSelectedId(id)
    const s = d.shelters.find((x) => x.id === id)
    if (s) setFocus([s.location.latitude, s.location.longitude])
  }

  const openForm = (shelter: Shelter | null) => {
    if (shelter) {
      const draft: ShelterInput = {
        disaster_id: shelter.disaster_id,
        name: shelter.name,
        address: shelter.address,
        location: shelter.location,
        status: shelter.status,
        capacity: shelter.capacity,
        capabilities: shelter.capabilities,
        resources: shelter.resources,
      }
      setForm({ id: shelter.id, draft: structuredClone(draft) })
      setSelectedId(shelter.id)
      setFocus([shelter.location.latitude, shelter.location.longitude])
    } else {
      setForm({ id: null, draft: emptyShelter(d.disasterId as string) })
      setSelectedId(null)
    }
  }
  const setDraft = (fn: (draft: ShelterInput) => ShelterInput) => setForm((f) => (f ? { ...f, draft: fn(f.draft) } : f))

  const saveShelter = async (draft: ShelterInput) => {
    if (!form) return
    const currentForm = form
    const { name, address, location, status, capacity, resources } = draft
    const capabilities = { ...draft.capabilities, special_care_notes: draft.capabilities.special_care_notes?.trim() || null }
    const saved = await d.mutate((api, disasterId) =>
      currentForm.id
        ? api.updateShelter(currentForm.id, { name, address, location, status, capacity, capabilities, resources })
        : api.createShelter({ ...draft, capabilities, disaster_id: disasterId }),
    )
    setForm(null)
    setSelectedId(saved.id)
  }

  return (
    <div className="map-page">
      <ShelterMap
        shelters={d.shelters}
        families={families}
        familyError={familyError}
        reports={d.reports}
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
        <>
          {form ? (
            <ShelterForm key={form.id || 'new'} draft={form.draft} setDraft={setDraft} isNew={!form.id} onCancel={() => setForm(null)} onSave={saveShelter} />
          ) : (
            <ShelterList shelters={d.shelters} selectedId={selectedId} onSelect={selectShelter} onEdit={openForm} onAdd={() => openForm(null)} />
          )}
        </>
      </aside>
    </div>
  )
}
