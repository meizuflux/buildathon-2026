// Haven donation API client for the citizen app.
// On a physical device, 127.0.0.1 is the phone itself: pass your machine's LAN IP as apiBase.
export const API_BASE = 'http://127.0.0.1:8000';
// Demo region (fictional Tampa scenario); matches DEMO_CENTER in backend/src/haven/demo_data.py.
export const DEMO_CENTER = { lat: 27.9506, lng: -82.4572 };

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(path, { apiBase = API_BASE, token, method = 'GET', body } = {}) {
  const headers = { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const response = await fetch(`${apiBase}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, data?.error?.code, data?.error?.message ?? `Request failed (${response.status})`);
  }
  return data;
}

// items: [{ resource_type_id, quantity }]
export const createRequest = ({ items, latitude, longitude, address = '', notes = '' }, options) =>
  request('/api/requests', { ...options, method: 'POST', body: { items, latitude, longitude, address, notes } });

export const myRequests = (options) => request('/api/requests/mine', options);

export const cancelRequest = (id, options) =>
  request(`/api/requests/${encodeURIComponent(id)}/cancel`, { ...options, method: 'POST' });

// Donate items; the server picks the best drop-off hub. Returns the pledge with `hub` and `match`.
export const createDonation = ({ items, latitude, longitude, notes = '' }, options) =>
  request('/api/pledges', { ...options, method: 'POST', body: { items, latitude, longitude, notes } });

export const myPledges = (options) => request('/api/pledges/mine', options);

export const cancelPledge = (id, options) =>
  request(`/api/pledges/${encodeURIComponent(id)}/cancel`, { ...options, method: 'POST' });

// { active, base_cap, resource_types: { [resource_type_id]: { cap, level, pressure } } }
export const requestLimits = (options) => request('/api/requests/limits', options);

// Custom items outside the catalog, reviewed by a government worker. kind: 'donation' | 'request'
export const createCustom = ({ kind, description, quantity = 1, latitude, longitude, notes = '' }, options) =>
  request('/api/custom-submissions', {
    ...options,
    method: 'POST',
    body: { kind, description, quantity, latitude, longitude, notes },
  });

export const myCustom = (options) => request('/api/custom-submissions/mine', options);

export const cancelCustom = (id, options) =>
  request(`/api/custom-submissions/${encodeURIComponent(id)}/cancel`, { ...options, method: 'POST' });
