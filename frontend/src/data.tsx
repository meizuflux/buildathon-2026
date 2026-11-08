import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { api, ApiError, type LiveApi } from './api'
import { useAuth } from './auth'
import type {
  ActivityEntry,
  AlertPage,
  Disaster,
  Report,
  Shelter,
  Update,
} from './api/types'

type Collections = {
  shelters: Shelter[]
  updates: Update[]
  reports: Report[]
  activity: ActivityEntry[]
  alerts: AlertPage | null
}

type CollectionKey = keyof Collections
type Errors = Record<string, string | null>

type DataContextValue = Collections & {
  disasters: Disaster[]
  disasterId: string | null
  disaster: Disaster | null
  setDisasterId: (id: string | null) => void
  errors: Errors
  lastSync: string | null
  loaded: boolean
  refresh: () => Promise<void>
  mutate: <T>(fn: (client: LiveApi, disasterId: string) => Promise<T>) => Promise<T>
}

// One provider loads every collection for the selected disaster and polls it,
// so every page reads from the same snapshot.
const DataContext = createContext<DataContextValue | null>(null)
const POLL_MS = 12_000

const COLLECTIONS: { [K in CollectionKey]: (disasterId: string) => Promise<Collections[K]> } = {
  shelters: (d) => api.listShelters(d),
  updates: (d) => api.listUpdates(d),
  reports: (d) => api.listReports(d),
  activity: (d) => api.listActivity(d),
  alerts: (d) => api.listAlerts(d),
}
const COLLECTION_KEYS = Object.keys(COLLECTIONS) as CollectionKey[]
const EMPTY: Collections = {
  shelters: [],
  updates: [],
  reports: [],
  activity: [],
  alerts: null,
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { expire } = useAuth()
  const [disasters, setDisasters] = useState<Disaster[]>([])
  const [disasterId, setDisasterId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('haven-disaster') || null
    } catch {
      return null
    }
  })
  const [data, setData] = useState<Collections>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const current = useRef<string | null>(disasterId)

  const fail = useCallback(
    (key: string, e: unknown) => {
      if (e instanceof ApiError && e.status === 401) return expire()
      setErrors((x) => ({
        ...x,
        [key]: e instanceof Error ? e.message : 'Unknown error',
      }))
    },
    [expire],
  )

  useEffect(() => {
    api
      .listDisasters()
      .then((list) => {
        setDisasters(list)
        setDisasterId((cur) =>
          list.some((d) => d.id === cur)
            ? cur
            : (list.find((d) => d.status === 'active') || list[0])?.id ?? null,
        )
      })
      .catch((e) => fail('disasters', e))
  }, [fail])

  const refresh = useCallback(async () => {
    const d = current.current
    if (!d) return
    const results = await Promise.allSettled(COLLECTION_KEYS.map((key) => COLLECTIONS[key](d)))
    if (current.current !== d) return // disaster switched mid-flight
    const next: Partial<Collections> = {}
    const errs: Errors = {}
    COLLECTION_KEYS.forEach((k, i) => {
      const r = results[i]
      if (r.status === 'fulfilled') {
        ;(next as Record<string, unknown>)[k] = r.value
      } else {
        if (r.reason instanceof ApiError && r.reason.status === 401) return expire()
        errs[k] = r.reason instanceof Error ? r.reason.message : 'Unknown error'
      }
    })
    setData((prev) => ({ ...prev, ...next }))
    setErrors((prev) => ({
      ...Object.fromEntries(COLLECTION_KEYS.map((k) => [k, null])),
      disasters: prev.disasters,
      ...errs,
    }))
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
    async <T,>(fn: (client: LiveApi, disasterId: string) => Promise<T>): Promise<T> => {
      try {
        return await fn(api, current.current as string)
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) expire()
        throw e
      } finally {
        refresh()
      }
    },
    [refresh, expire],
  )

  const value = useMemo<DataContextValue>(() => {
    return {
      ...data,
      disasters,
      disasterId,
      disaster: disasters.find((d) => d.id === disasterId) || null,
      setDisasterId,
      errors,
      lastSync,
      loaded,
      refresh,
      mutate,
    }
  }, [data, disasters, disasterId, errors, lastSync, loaded, refresh, mutate])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export const useData = () => {
  const context = useContext(DataContext)
  if (!context) throw new Error('useData must be used within a DataProvider')
  return context
}
