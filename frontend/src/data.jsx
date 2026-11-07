import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError } from './api/index.js'
import { useAuth } from './auth.jsx'

// One provider loads every collection for the selected disaster and polls it,
// so every page reads from the same snapshot.
const DataContext = createContext(null)
const POLL_MS = 12_000

const COLLECTIONS = {
  shelters: (d) => api.listShelters(d),
  updates: (d) => api.listUpdates(d),
  reports: (d) => api.listReports(d),
  organizations: (d) => api.listOrganizations(d),
  inventory: (d) => api.listInventory(d),
  needs: (d) => api.listNeeds(d),
  shipments: (d) => api.listShipments(d),
  activity: (d) => api.listActivity(d),
}
// These interfaces are retained for unavailable features, but the backend has
// no corresponding collections to poll yet.
const EMPTY = { ...Object.fromEntries(Object.keys(COLLECTIONS).map((k) => [k, []])), conversations: [], partnerAccounts: [], assistance: [] }

export function DataProvider({ children }) {
  const { expire } = useAuth()
  const [disasters, setDisasters] = useState([])
  const [disasterId, setDisasterId] = useState(() => {
    try {
      return localStorage.getItem('haven-disaster') || null
    } catch {
      return null
    }
  })
  const [resourceTypes, setResourceTypes] = useState([])
  const [data, setData] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [lastSync, setLastSync] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const current = useRef(disasterId)

  const fail = useCallback(
    (key, e) => {
      if (e instanceof ApiError && e.status === 401) return expire()
      setErrors((x) => ({ ...x, [key]: e.message }))
    },
    [expire],
  )

  useEffect(() => {
    api.listDisasters()
      .then((list) => {
        setDisasters(list)
        setDisasterId((cur) => (list.some((d) => d.id === cur) ? cur : (list.find((d) => d.status === 'active') || list[0])?.id ?? null))
      })
      .catch((e) => fail('disasters', e))
    api.listResourceTypes().then(setResourceTypes).catch((e) => fail('resource types', e))
  }, [fail])

  const refresh = useCallback(async () => {
    const d = current.current
    if (!d) return
    const results = await Promise.allSettled(Object.values(COLLECTIONS).map((fn) => fn(d)))
    if (current.current !== d) return // disaster switched mid-flight
    const next = {}
    const errs = {}
    Object.keys(COLLECTIONS).forEach((k, i) => {
      const r = results[i]
      if (r.status === 'fulfilled') next[k] = r.value
      else {
        if (r.reason instanceof ApiError && r.reason.status === 401) return expire()
        errs[k] = r.reason.message
      }
    })
    setData((prev) => ({ ...prev, ...next }))
    setErrors((prev) => ({ ...Object.fromEntries(Object.keys(COLLECTIONS).map((k) => [k, null])), disasters: prev.disasters, 'resource types': prev['resource types'], ...errs }))
    setLastSync(new Date().toISOString())
    setLoaded(true)
  }, [expire])

  useEffect(() => {
    current.current = disasterId
    if (!disasterId) return
    try {
      localStorage.setItem('haven-disaster', disasterId)
    } catch {
      /* ignore */
    }
    setData(EMPTY)
    setLoaded(false)
    refresh()
    const t = setInterval(refresh, POLL_MS)
    return () => clearInterval(t)
  }, [disasterId, refresh])

  // Run a mutation, then refresh everything so derived views stay consistent.
  const mutate = useCallback(
    async (fn) => {
      try {
        return await fn(api, current.current)
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) expire()
        throw e
      } finally {
        refresh()
      }
    },
    [refresh, expire],
  )

  const value = useMemo(() => {
    const rtById = Object.fromEntries(resourceTypes.map((r) => [r.id, r]))
    const site = (ref) => {
      if (!ref) return null
      if (ref.kind === 'shelter') return data.shelters.find((s) => s.id === ref.id) || null
      if (ref.kind === 'organization') return data.organizations.find((o) => o.id === ref.id) || null
      return null
    }
    return {
      ...data,
      disasters,
      disasterId,
      disaster: disasters.find((d) => d.id === disasterId) || null,
      setDisasterId,
      resourceTypes,
      rt: (id) => rtById[id] || { id, name: id, unit: '', category: 'other' },
      site,
      errors,
      lastSync,
      loaded,
      refresh,
      mutate,
    }
  }, [data, disasters, disasterId, resourceTypes, errors, lastSync, loaded, refresh, mutate])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export const useData = () => useContext(DataContext)
