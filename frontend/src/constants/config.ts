export const config = {
  mode: process.env.EXPO_PUBLIC_DATA_MODE === 'api' ? 'api' as const : 'mock' as const,
  baseUrl: (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, ''),
  changesPath: process.env.EXPO_PUBLIC_CHANGES_PATH ?? '/api/v1/changes',
  timeoutMs: 15000,
};
