import { liveApi, setToken, ApiError } from './live.js'
import { mockApi, resetMockData } from './mock.js'

export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'
export const api = USE_MOCK ? mockApi : liveApi
export { setToken, ApiError, resetMockData }
