import type {
  ActivityEntry,
  AlertPage,
  Disaster,
  Family,
  FamilyPage,
  FamilyPatch,
  Location,
  Plan,
  PlanPage,
  Preview,
  PreviewInput,
  Report,
  Session,
  Shelter,
  ShelterInput,
  ShelterPatch,
  Update,
  UpdateInput,
  UpdateList,
  User,
} from './types'

// Paths are relative to /api, which Vite proxies to the backend in development.

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

let token: string | null = null
export function setToken(value: string | null) {
  token = value
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'network_error', 'Could not reach the Haven server.')
  }

  if (res.status === 204) return null as T
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    // The Vite dev proxy answers with a bodiless 5xx when the backend is down.
    if (!data && res.status >= 500)
      throw new ApiError(
        res.status,
        'network_error',
        'Could not reach the Haven server. Is the backend running?',
      )
    if (res.status === 404 && !data?.error)
      throw new ApiError(
        404,
        'not_implemented',
        `${method} ${path.split('?')[0]} is not available on the server yet.`,
      )
    const err = data?.error
    throw new ApiError(
      res.status,
      err?.code || 'http_error',
      err?.message || `Request failed (${res.status}).`,
    )
  }
  return data as T
}

const q = (params: Record<string, string | number | null | undefined>) => {
  const s = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v != null) as [string, string][],
  ).toString()
  return s ? `?${s}` : ''
}
const e = encodeURIComponent

export const liveApi = {
  login: (email: string, password: string) =>
    request<Session>('POST', '/auth/login', { email, password }),
  logout: () => request<null>('POST', '/auth/logout'),
  me: () => request<User>('GET', '/me'),

  listDisasters: () =>
    request<{ disasters: Disaster[] }>('GET', '/disasters').then((d) => d.disasters),

  listFamilies: (disasterId: string, limit = 50, offset = 0) =>
    request<FamilyPage>('GET', `/families${q({ disaster_id: disasterId, limit, offset })}`),
  getFamily: (id: string) => request<Family>('GET', `/families/${e(id)}`),
  updateFamily: (id: string, patch: FamilyPatch) =>
    request<Family>('PATCH', `/families/${e(id)}`, patch),
  listPlans: (disasterId: string, limit = 1000, offset = 0) =>
    request<PlanPage>('GET', `/disasters/${e(disasterId)}/plans${q({ limit, offset })}`),
  getPlan: (id: string) => request<Plan | null>('GET', `/families/${e(id)}/plan`),
  generatePlan: (id: string) => request<Plan>('POST', `/families/${e(id)}/plan/generate`),

  listShelters: (disasterId: string) =>
    request<{ shelters: Shelter[] }>('GET', `/shelters${q({ disaster_id: disasterId })}`).then(
      (d) => d.shelters,
    ),
  createShelter: (shelter: ShelterInput) => request<Shelter>('POST', '/shelters', shelter),
  updateShelter: (id: string, patch: ShelterPatch) =>
    request<Shelter>('PATCH', `/shelters/${e(id)}`, patch),

  listUpdates: (disasterId: string) =>
    request<UpdateList>('GET', `/disasters/${e(disasterId)}/updates`).then((d) => d.updates),
  previewUpdate: (disasterId: string, body: PreviewInput) =>
    request<Preview>('POST', `/disasters/${e(disasterId)}/updates/preview`, body),
  publishUpdate: (disasterId: string, update: UpdateInput) =>
    request<Update>('POST', `/disasters/${e(disasterId)}/updates`, update),
  retractUpdate: (id: string) =>
    request<Update>('PATCH', `/updates/${e(id)}`, { status: 'retracted' }),

  listReports: (disasterId: string) =>
    request<{ reports: Report[] }>('GET', `/disasters/${e(disasterId)}/reports`).then(
      (d) => d.reports,
    ),

  listActivity: (disasterId: string) =>
    request<{ activity: ActivityEntry[] }>(
      'GET',
      `/disasters/${e(disasterId)}/activity?limit=50`,
    ).then((d) => d.activity),
  listAlerts: (disasterId: string) =>
    request<AlertPage>('GET', `/disasters/${e(disasterId)}/alerts?limit=1000`),
}

export type LiveApi = typeof liveApi
export type { Location }
