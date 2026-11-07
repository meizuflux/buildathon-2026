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

// status: 'completed' | 'cancelled'. capacityPct resets the hub's capacity when completed.
export const closePickup = (pickupId, status, capacityPct, options) =>
  request(`/api/pickups/${encodeURIComponent(pickupId)}`, {
    ...options,
    method: 'PATCH',
    body: JSON.stringify(capacityPct == null ? { status } : { status, capacity_pct: capacityPct }),
  });

// supplies: [{ category, quantity, target }]
export const updateInventory = (hubId, capacityPct, supplies, options) =>
  request(`/api/hubs/${encodeURIComponent(hubId)}/inventory`, {
    ...options,
    method: 'PUT',
    body: JSON.stringify({ capacity_pct: capacityPct, supplies }),
  });

// Citizen supply requests (operator workflow).
export const fetchRequests = ({ status, assignedToMe } = {}, options) => {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (assignedToMe) params.set('assigned_to_me', 'true');
  return request(`/api/requests?${params}`, options);
};

// method: 'delivery' | 'pickup'
export const claimRequest = (requestId, hubId, method, options) =>
  request(`/api/requests/${encodeURIComponent(requestId)}/claim`, {
    ...options,
    method: 'POST',
    body: JSON.stringify({ hub_id: hubId, method }),
  });

export const releaseRequest = (requestId, options) =>
  request(`/api/requests/${encodeURIComponent(requestId)}/release`, { ...options, method: 'POST' });

export const fulfillRequest = (requestId, options) =>
  request(`/api/requests/${encodeURIComponent(requestId)}/fulfill`, { ...options, method: 'POST' });

// Drop-off pledges (hub staff and operators).
export const fetchHub = (hubId, options) => request(`/api/hubs/${encodeURIComponent(hubId)}`, options);

export const fetchHubPledges = (hubId, status = 'pending', options) =>
  request(`/api/hubs/${encodeURIComponent(hubId)}/pledges?status=${status}`, options);

export const receivePledge = (pledgeId, options) =>
  request(`/api/pledges/${encodeURIComponent(pledgeId)}/receive`, { ...options, method: 'POST' });

export const noShowPledge = (pledgeId, options) =>
  request(`/api/pledges/${encodeURIComponent(pledgeId)}/no-show`, { ...options, method: 'POST' });
