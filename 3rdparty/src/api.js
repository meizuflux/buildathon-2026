// HTTP client for the Haven API, as used by a partner (shelter / organization)
// account. Endpoints and permissions follow the Part 2 contract §10
// (frontend/docs/api-contract-part-2.md on the frontend branch).

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

let token = null
export const setToken = (t) => { token = t }

async function request(method, path, body) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  let res
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new ApiError(0, 'network_error', "Can't reach Haven. Check your connection.")
  }
  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    if (!data && res.status >= 500) throw new ApiError(res.status, 'network_error', "Can't reach the Haven server. Is it running?")
    throw new ApiError(res.status, data?.error?.code || 'http_error', data?.error?.message || `Request failed (${res.status}).`)
  }
  return data
}

const q = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString()
  return s ? `?${s}` : ''
}
const e = encodeURIComponent
const rid = () => crypto.randomUUID()

export const api = {
  login: (email, password) => request('POST', '/auth/login', { email, password }),
  logout: () => request('POST', '/auth/logout'),
  me: () => request('GET', '/me'),
  changePassword: (current_password, new_password) => request('POST', '/auth/change-password', { current_password, new_password }),

  listDisasters: () => request('GET', '/disasters').then((d) => d.disasters),
  listResourceTypes: () => request('GET', '/resource-types').then((d) => d.resource_types),

  listShelters: (disasterId) => request('GET', `/shelters${q({ disaster_id: disasterId })}`).then((d) => d.shelters),
  updateShelter: (id, patch) => request('PATCH', `/shelters/${e(id)}`, patch),

  listOrganizations: (disasterId) => request('GET', `/organizations${q({ disaster_id: disasterId })}`).then((d) => d.organizations),
  updateOrganization: (id, patch) => request('PATCH', `/organizations/${e(id)}`, patch),
  listInventory: (disasterId) => request('GET', `/inventory${q({ disaster_id: disasterId })}`).then((d) => d.items),
  setInventory: (orgId, items) => request('PATCH', `/organizations/${e(orgId)}/inventory`, { items }).then((d) => d.items),

  listNeeds: (disasterId) => request('GET', `/needs${q({ disaster_id: disasterId })}`).then((d) => d.needs),
  createNeed: (need) => request('POST', '/needs', need),
  updateNeed: (id, patch) => request('PATCH', `/needs/${e(id)}`, patch),

  listShipments: (disasterId) => request('GET', `/shipments${q({ disaster_id: disasterId })}`).then((d) => d.shipments),
  createShipment: (s) => request('POST', '/shipments', s),
  updateShipment: (id, patch) => request('PATCH', `/shipments/${e(id)}`, patch),

  listUpdates: (disasterId) => request('GET', `/disasters/${e(disasterId)}/updates`).then((d) => d.updates),

  // Citizen assistance (Part 2 §11)
  listAssistanceRequests: (disasterId) => request('GET', `/assistance-requests${q({ disaster_id: disasterId })}`).then((d) => d.requests),
  claimAssistanceRequest: (id, body) => request('POST', `/assistance-requests/${e(id)}/claim`, body),
  updateAssistanceRequest: (id, patch) => request('PATCH', `/assistance-requests/${e(id)}`, patch),

  listConversations: (disasterId) => request('GET', `/conversations${q({ disaster_id: disasterId })}`).then((d) => d.conversations),
  createConversation: (body) => request('POST', '/conversations', { ...body, client_request_id: rid() }),
  listMessages: (id) => request('GET', `/conversations/${e(id)}/messages`).then((d) => d.messages),
  sendMessage: (id, body) => request('POST', `/conversations/${e(id)}/messages`, { body, client_request_id: rid() }),
  markConversationRead: (id) => request('POST', `/conversations/${e(id)}/read`),
}
