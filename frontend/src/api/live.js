// Paths are relative to /api, which Vite proxies to the backend in development.

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

let token = null
export function setToken(value) {
  token = value
}

async function request(method, path, body) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  let res
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new ApiError(0, 'network_error', 'Could not reach the Haven server.')
  }

  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    // The Vite dev proxy answers with a bodiless 5xx when the backend is down.
    if (!data && res.status >= 500) throw new ApiError(res.status, 'network_error', 'Could not reach the Haven server. Is the backend running?')
    if (res.status === 404 && !data?.error) throw new ApiError(404, 'not_implemented', `${method} ${path.split('?')[0]} is not available on the server yet.`)
    const err = data?.error
    throw new ApiError(res.status, err?.code || 'http_error', err?.message || `Request failed (${res.status}).`)
  }
  return data
}

const q = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString()
  return s ? `?${s}` : ''
}
const e = encodeURIComponent

export const liveApi = {
  login: (email, password) => request('POST', '/auth/login', { email, password }),
  logout: () => request('POST', '/auth/logout'),
  me: () => request('GET', '/me'),

  listDisasters: () => request('GET', '/disasters').then((d) => d.disasters),

  listFamilies: (disasterId, limit = 50, offset = 0) => request('GET', `/families${q({ disaster_id: disasterId, limit, offset })}`),
  getFamily: (id) => request('GET', `/families/${e(id)}`),
  updateFamily: (id, patch) => request('PATCH', `/families/${e(id)}`, patch),
  listPlans: (disasterId, limit = 1000, offset = 0) => request('GET', `/disasters/${e(disasterId)}/plans${q({ limit, offset })}`),
  getPlan: (id) => request('GET', `/families/${e(id)}/plan`),
  generatePlan: (id) => request('POST', `/families/${e(id)}/plan/generate`),

  listShelters: (disasterId) => request('GET', `/shelters${q({ disaster_id: disasterId })}`).then((d) => d.shelters),
  createShelter: (shelter) => request('POST', '/shelters', shelter),
  updateShelter: (id, patch) => request('PATCH', `/shelters/${e(id)}`, patch),

  listUpdates: (disasterId) => request('GET', `/disasters/${e(disasterId)}/updates`).then((d) => d.updates),
  previewUpdate: (disasterId, body) => request('POST', `/disasters/${e(disasterId)}/updates/preview`, body),
  publishUpdate: (disasterId, update) => request('POST', `/disasters/${e(disasterId)}/updates`, update),
  retractUpdate: (id) => request('PATCH', `/updates/${e(id)}`, { status: 'retracted' }),

  listReports: (disasterId) => request('GET', `/disasters/${e(disasterId)}/reports`).then((d) => d.reports),


  listActivity: (disasterId) => request('GET', `/disasters/${e(disasterId)}/activity?limit=50`).then((d) => d.activity),
  listAlerts: (disasterId) => request('GET', `/disasters/${e(disasterId)}/alerts?limit=1000`),

}
