import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { adapter } from '../services/adapters';
import { cache } from '../storage/cache';
import { config } from '../constants/config';
import { ApiError } from '../services/api/http';
import { affectedQueries } from '../utils/changes';
const entities = ['household', 'plan', 'alerts', 'requests', 'updates', 'reports', 'history', 'messages'];
type Snapshot = { key: readonly unknown[]; data: unknown; at: number };
const SyncContext = createContext({ ready: false, online: true, lastSync: null as string | null, syncing: false, syncError: '', storageError: '', refresh: async () => {} });
export const useSyncContext = () => useContext(SyncContext);
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const client = useQueryClient();
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [active, setActive] = useState(AppState.currentState !== 'background');
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [storageError, setStorageError] = useState('');
  const hydrated = useRef(false);
  const namespace = `queries:${config.mode}:${config.baseUrl}`;
  useEffect(() => {
    let live = true;
    void (async () => {
      try { const snapshots = await cache.get<Snapshot[]>(namespace); if (!live) return; snapshots?.forEach(s => client.setQueryData(s.key, s.data, { updatedAt: s.at })); setLastSync(await cache.get<string>(`${namespace}:sync`)); }
      catch { if (live) setStorageError('Offline storage is unavailable. Saved information may not persist.'); }
      finally { if (live) { hydrated.current = true; setReady(true); } }
    })();
    return () => { live = false; };
  }, [client, namespace]);
  useEffect(() => client.getQueryCache().subscribe(event => {
    if (!hydrated.current || event.type !== 'updated' || event.action.type !== 'success') return;
    const snapshots: Snapshot[] = client.getQueryCache().getAll().filter(q => entities.includes(String(q.queryKey[0])) && q.state.data !== undefined).map(q => ({ key: q.queryKey, data: q.state.data, at: q.state.dataUpdatedAt }));
    void cache.set(namespace, snapshots).catch(() => setStorageError('Unable to save offline information.'));
  }), [client, namespace]);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => { const connected = state.isConnected !== false && state.isInternetReachable !== false; setOnline(connected); onlineManager.setOnline(connected); });
    const subscription = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => { unsubscribe(); subscription.remove(); };
  }, []);
  const refresh = useCallback(async () => {
    setSyncing(true);
    try {
      await client.invalidateQueries({ predicate: q => entities.includes(String(q.queryKey[0])), refetchType: 'active' });
      if (client.getQueryCache().getAll().some(q => q.isActive() && q.state.status === 'error')) throw new Error('Some information could not be refreshed. Review the cached timestamps and try again.');
      const stamp = new Date().toISOString(); setLastSync(stamp); setSyncError(''); await cache.set(`${namespace}:sync`, stamp).catch(() => setStorageError('Unable to save the synchronization time.'));
    } catch (e) { setSyncError(e instanceof Error ? e.message : 'Unable to refresh.'); } finally { setSyncing(false); }
  }, [client, namespace]);
  useEffect(() => {
    if (!ready || !online || !active) return;
    const controller = new AbortController();
    let cursor: string | undefined;
    const seen = new Set<string>();
    const delay = (ms: number) => new Promise<void>(resolve => { const finish = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', finish); resolve(); }; const timer = setTimeout(finish, ms); controller.signal.addEventListener('abort', finish, { once: true }); });
    void (async () => {
      await refresh();
      let failures = 0;
      while (!controller.signal.aborted) {
        try {
          const started = Date.now();
          const batch = await adapter.watchForChanges(cursor, controller.signal);
          if (controller.signal.aborted) return;
          cursor = batch.cursor;
          const changed = affectedQueries(batch, seen);
          if (changed.size) await client.invalidateQueries({ predicate: q => changed.has(String(q.queryKey[0])) });
          const failed = client.getQueryCache().getAll().some(q => q.isActive() && q.state.status === 'error');
          if (failed) setSyncError('Some information could not be refreshed. Saved data may be outdated. Use Refresh to retry.');
          else if (changed.size || failures > 0) setSyncError('');
          failures = 0;
          // Protect against a server that returns empty responses without waiting.
          if (!batch.events.length && Date.now() - started < 1000) await delay(3000);
          // An unsupported live endpoint stays visible as a manual-refresh notice.
        } catch (error) {
          if (controller.signal.aborted) return;
          if (error instanceof ApiError && [404, 405, 501].includes(error.status)) { setSyncError('Live updates are unavailable. Use Refresh to check for changes.'); return; }
          setSyncError(error instanceof Error ? error.message : 'Live connection interrupted. Retrying…');
          await delay(Math.min(60000, 1500 * 2 ** Math.min(failures++, 6)) + Math.random() * 500);
          if (!controller.signal.aborted) await refresh();
        }
      }
    })();
    return () => controller.abort();
  }, [ready, online, active, client, refresh]);
  return <SyncContext.Provider value={{ ready, online, lastSync, syncing, syncError, storageError, refresh }}>{children}</SyncContext.Provider>;
}
