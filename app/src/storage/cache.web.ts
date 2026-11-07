import type { CacheStore } from './cache';
// Expo SQLite powers native offline storage; browser preview uses localStorage.
export const cache: CacheStore = {
  async get<T>(key: string) { const value = localStorage.getItem(`haven:${key}`); return value ? JSON.parse(value) as T : null; },
  async set(key, value) { localStorage.setItem(`haven:${key}`, JSON.stringify(value)); },
  async remove(key) { localStorage.removeItem(`haven:${key}`); },
};
