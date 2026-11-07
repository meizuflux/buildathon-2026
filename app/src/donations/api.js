// Haven donation hub API client for the citizen app.
// On a physical device, 127.0.0.1 is the phone itself: pass your machine's LAN IP as apiBase.
export const API_BASE = 'http://127.0.0.1:8000';
// Placeholder demo region (Houston, TX); matches DEMO_CENTER in backend/src/haven/demo_data.py.
export const DEMO_CENTER = { lat: 29.7604, lng: -95.3698 };

export async function fetchNearbyHubs(lat, lng, { apiBase = API_BASE, radiusKm = 25 } = {}) {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng), radius_km: String(radiusKm) });
  const response = await fetch(`${apiBase}/api/hubs/nearby?${params}`);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  }
  return response.json();
}
