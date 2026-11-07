// Haven donation API client for the citizen app.
// On a physical device, 127.0.0.1 is the phone itself: pass your machine's LAN IP as apiBase.
export const API_BASE = 'http://127.0.0.1:8000';
// Demo region (Jakarta); matches DEMO_CENTER in backend/src/haven/demo_data.py. Used only when GPS is unavailable.
export const DEMO_CENTER = { lat: -6.19, lng: 106.835 };

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

// filter: { needs: category } for hubs that want a donation, { has: category } for hubs that can give one.
export function fetchNearbyHubs(lat, lng, { radiusKm = 25, needs, has, ...options } = {}) {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng), radius_km: String(radiusKm) });
  if (needs) params.set('needs', needs);
  if (has) params.set('has', has);
  return request(`/api/hubs/nearby?${params}`, options);
}

// items: [{ category, quantity }]
export const createRequest = ({ items, latitude, longitude, address = '', notes = '' }, options) =>
  request('/api/requests', { ...options, method: 'POST', body: { items, latitude, longitude, address, notes } });

export const myRequests = (options) => request('/api/requests/mine', options);

export const cancelRequest = (id, options) =>
  request(`/api/requests/${encodeURIComponent(id)}/cancel`, { ...options, method: 'POST' });

export const createPledge = (hubId, { items, notes = '' }, options) =>
  request(`/api/hubs/${encodeURIComponent(hubId)}/pledges`, { ...options, method: 'POST', body: { items, notes } });

export const myPledges = (options) => request('/api/pledges/mine', options);

export const cancelPledge = (id, options) =>
  request(`/api/pledges/${encodeURIComponent(id)}/cancel`, { ...options, method: 'POST' });

// { active, base_cap, categories: { [category]: { cap, level, pressure } } }
export const requestLimits = (options) => request('/api/requests/limits', options);
