import { liveApi, setToken, ApiError } from './live.js'
import { mockApi, resetMockData } from './mock.js'

// VITE_USE_MOCK=true → everything in the browser (static demos, no server).
// Otherwise → HTTP client; in dev that hits the shared mock API unless
// HAVEN_API_URL points the proxy at the real backend (see vite.config.js).
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'
export const SHARED_MOCK = !USE_MOCK && import.meta.env.VITE_SHARED_MOCK === 'true'
export const api = USE_MOCK ? mockApi : liveApi
export { setToken, ApiError }

export async function resetDemoData() {
  if (USE_MOCK) resetMockData()
  else await liveApi.resetMock()
}
