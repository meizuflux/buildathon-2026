// Haven donation hub API client for the government dashboard.
export const API_BASE = import.meta.env?.VITE_API_BASE ?? 'http://127.0.0.1:8000';

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(path, { apiBase = API_BASE, token, ...init } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const response = await fetch(`${apiBase}${path}`, { ...init, headers });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, body?.error?.code, body?.error?.message ?? `Request failed (${response.status})`);
  }
  return body;
}

export const fetchHubs = (minCapacity = 0, options) =>
  request(`/api/hubs?min_capacity=${minCapacity}`, options);

export const dispatchPickup = (hubId, notes = '', options) =>
  request(`/api/hubs/${encodeURIComponent(hubId)}/pickups`, {
    ...options,
    method: 'POST',
    body: JSON.stringify({ notes }),
  });
