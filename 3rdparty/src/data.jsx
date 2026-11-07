import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError } from './api.js'
import { useAuth } from './auth.jsx'

// Loads everything this partner can see and polls it, so changes made by the
// operations center (approvals, dispatches, messages, broadcasts) show up live.
const DataContext = createContext(null)
const POLL_MS = 8_000

export function DataProvider({ children }) {
  const { user, expire } = useAuth()
  const site = user.site
  const isOrg = site.kind === 'organization'
  const [disasterId, setDisasterId] = useState(null)
  const [disaster, setDisaster] = useState(null)
  const [resourceTypes, setResourceTypes] = useState([])
  const [data, setData] = useState({ shelters: [], organizations: [], inventory: [], needs: [], shipments: [], updates: [], conversations: [], assistance: [] })
  const [error, setError] = useState(null)
  const [lastSync, setLastSync] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const busy = useRef(false)

  const handle = useCallback((e) => {
    if (e instanceof ApiError && e.status === 401) expire()
    else setError(e.message)
  }, [expire])

  // Find which disaster this site belongs to.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [disasters, types] = await Promise.all([api.listDisasters(), api.listResourceTypes()])
        setResourceTypes(types)
        for (const d of disasters) {
          const list = isOrg ? await api.listOrganizations(d.id) : await api.listShelters(d.id)
          if (list.some((x) => x.id === site.id)) {
            if (alive) { setDisasterId(d.id); setDisaster(d) }
            return
          }
        }
        if (alive) setError('Your site is not part of an active disaster right now.')
      } catch (e) {
        handle(e)
      }
    })()
    return () => { alive = false }
  }, [site.id, isOrg, handle])

  const refresh = useCallback(async () => {
    if (!disasterId || busy.current) return
    busy.current = true
    try {
      const [shelters, organizations, inventory, needs, shipments, updates, conversations, assistance] = await Promise.all([
        api.listShelters(disasterId),
        api.listOrganizations(disasterId),
        isOrg ? api.listInventory(disasterId) : Promise.resolve([]),
        api.listNeeds(disasterId),
        api.listShipments(disasterId),
        api.listUpdates(disasterId),
        api.listConversations(disasterId),
        isOrg ? api.listAssistanceRequests(disasterId) : Promise.resolve([]),
      ])
      setData({ shelters, organizations, inventory, needs, shipments, updates, conversations, assistance })
      setError(null)
      setLastSync(new Date().toISOString())
      setLoaded(true)
    } catch (e) {
      handle(e)
    } finally {
      busy.current = false
    }
  }, [disasterId, isOrg, handle])

  useEffect(() => {
    if (!disasterId) return
    refresh()
    const t = setInterval(refresh, POLL_MS)
    return () => clearInterval(t)
  }, [disasterId, refresh])

  const mutate = useCallback(async (fn) => {
    try {
      return await fn(api, disasterId)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) expire()
      throw e
    } finally {
      busy.current = false
      await refresh() // so callers see fresh data when the mutation resolves
    }
  }, [disasterId, refresh, expire])

  const value = useMemo(() => {
    const rtById = Object.fromEntries(resourceTypes.map((r) => [r.id, r]))
    const me = (isOrg ? data.organizations : data.shelters).find((x) => x.id === site.id) || null
    const mine = (ref) => ref && ref.kind === site.kind && ref.id === site.id
    return {
      ...data,
      site,
      isOrg,
      me,
      mine,
      disasterId,
      disaster,
      resourceTypes,
      rt: (id) => rtById[id] || { id, name: id, unit: '', category: 'other' },
      siteOf: (ref) => (ref?.kind === 'shelter' ? data.shelters : data.organizations).find((x) => x.id === ref?.id) || null,
      myNeeds: data.needs.filter((n) => mine(n.requester)),
      citizenApproved: isOrg && !!me?.citizen_assistance,
      nearbyCitizens: data.assistance.filter((a) => a.redacted),
      myCitizens: data.assistance.filter((a) => !a.redacted && mine(a.assigned_to)),
      inbound: data.shipments.filter((s) => mine(s.to)),
      outbound: data.shipments.filter((s) => mine(s.from)),
      error,
      lastSync,
      loaded,
      refresh,
      mutate,
    }
  }, [data, site, isOrg, disasterId, disaster, resourceTypes, error, lastSync, loaded, refresh, mutate])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export const useData = () => useContext(DataContext)
