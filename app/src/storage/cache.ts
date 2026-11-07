import * as SQLite from 'expo-sqlite';
export interface CacheStore { get<T>(key: string): Promise<T | null>; set(key: string, value: unknown): Promise<void>; remove(key: string): Promise<void> }
let connection: Promise<SQLite.SQLiteDatabase> | undefined;
async function db() {
  connection ??= SQLite.openDatabaseAsync('haven.db').then(async d => { await d.execAsync('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)'); return d; });
  return connection;
}
export const cache: CacheStore = {
  async get<T>(key: string) { const row = await (await db()).getFirstAsync<{ value: string }>('SELECT value FROM cache WHERE key = ?', key); return row ? JSON.parse(row.value) as T : null; },
  async set(key, value) { await (await db()).runAsync('INSERT OR REPLACE INTO cache (key, value) VALUES (?, ?)', key, JSON.stringify(value)); },
  async remove(key) { await (await db()).runAsync('DELETE FROM cache WHERE key = ?', key); },
};
