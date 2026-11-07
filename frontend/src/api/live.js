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
const rid = () => crypto.randomUUID()

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

  listResourceTypes: () => request('GET', '/resource-types').then((d) => d.resource_types),

  listOrganizations: (disasterId) => request('GET', `/organizations${q({ disaster_id: disasterId })}`).then((d) => d.organizations),
  createOrganization: (org) => request('POST', '/organizations', org),
  updateOrganization: (id, patch) => request('PATCH', `/organizations/${e(id)}`, patch),

  listInventory: (disasterId) => request('GET', `/inventory${q({ disaster_id: disasterId })}`).then((d) => d.items),
  setInventory: (orgId, items) => request('PATCH', `/organizations/${e(orgId)}/inventory`, { items }).then((d) => d.items),

  listNeeds: (disasterId) => request('GET', `/needs${q({ disaster_id: disasterId })}`).then((d) => d.needs),
  createNeed: (need) => request('POST', '/needs', need),
  updateNeed: (id, patch) => request('PATCH', `/needs/${e(id)}`, patch),

  listShipments: (disasterId) => request('GET', `/shipments${q({ disaster_id: disasterId })}`).then((d) => d.shipments),
  createShipment: (shipment) => request('POST', '/shipments', shipment),
  updateShipment: (id, patch) => request('PATCH', `/shipments/${e(id)}`, patch),

  listConversations: (disasterId) => request('GET', `/conversations${q({ disaster_id: disasterId })}`).then((d) => d.conversations),
  createConversation: (body) => request('POST', '/conversations', { ...body, client_request_id: rid() }),
  listMessages: (id) => request('GET', `/conversations/${e(id)}/messages`).then((d) => d.messages),
  sendMessage: (id, body) => request('POST', `/conversations/${e(id)}/messages`, { body, client_request_id: rid() }),
  markConversationRead: (id) => request('POST', `/conversations/${e(id)}/read`),

  listActivity: (disasterId) => request('GET', `/disasters/${e(disasterId)}/activity?limit=50`).then((d) => d.activity),
  listAlerts: (disasterId) => request('GET', `/disasters/${e(disasterId)}/alerts?limit=1000`),

  // Citizen assistance (Part 2 §11)
  listAssistanceRequests: (disasterId) => request('GET', `/assistance-requests${q({ disaster_id: disasterId })}`).then((d) => d.requests),
  updateAssistanceRequest: (id, patch) => request('PATCH', `/assistance-requests/${e(id)}`, patch),

  // Partner portal accounts (Part 2 §10)
  listPartnerAccounts: (disasterId) => request('GET', `/partner-accounts${q({ disaster_id: disasterId })}`).then((d) => d.accounts),
  createPartnerAccount: (body) => request('POST', '/partner-accounts', body),
  updatePartnerAccount: (id, patch) => request('PATCH', `/partner-accounts/${e(id)}`, patch),
  resetPartnerPassword: (id) => request('POST', `/partner-accounts/${e(id)}/reset-password`),

}
