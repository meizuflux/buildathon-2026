export const config = {
  mode: process.env.EXPO_PUBLIC_DATA_MODE === 'mock' ? 'mock' as const : 'api' as const,
  baseUrl: (process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, ''),
  changesPath: process.env.EXPO_PUBLIC_CHANGES_PATH ?? '/api/v1/changes',
  timeoutMs: 15000,
};
