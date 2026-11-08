export const config = {
  /** Haven backend. For a phone on the same network, set this to your computer's LAN IP. */
  baseUrl: (process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, ''),
  timeoutMs: 15000,
};
