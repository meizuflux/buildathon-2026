import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { http } from '../services/api/client';
import { session } from '../services/api/session';
import { userSchema, loginSchema } from '../services/api/masterSchemas';
import { config } from '../constants/config';
type User = z.infer<typeof userSchema>;
const AuthContext = createContext({ user: null as User | null, ready: false, error: '', authenticate: async (_email: string, _password: string, _register: boolean) => {}, signOut: async () => {} });
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null); const [ready, setReady] = useState(false); const [error, setError] = useState(''); const client = useQueryClient();
  useEffect(() => { let live = true; void (async () => { try { if (config.mode === 'api' && await session.getToken()) { const me = await http('/api/me', userSchema); if (me.role !== 'family') throw new Error('Use a family account in this app.'); if (live) setUser(me); } } catch (e) { await session.setToken(null); if (live) setError(e instanceof Error ? e.message : 'Please sign in again.'); } finally { if (live) setReady(true); } })(); return () => { live = false; }; }, []);
  async function authenticate(email: string, password: string, register: boolean) {
    setError(''); const body = { email: email.trim(), password };
    if (register) await http('/api/auth/register', z.object({ user_id: z.string(), role: z.literal('family') }), { method: 'POST', body });
    const login = await http('/api/auth/login', loginSchema, { method: 'POST', body });
    if (login.user.role !== 'family') throw new Error('Use a family account in the mobile app.');
    await session.setToken(login.access_token); client.clear(); setUser(login.user);
  }
  async function signOut() {
    try { await http('/api/auth/logout', z.null(), { method: 'POST' }); } finally { await session.setToken(null); setUser(null); client.clear(); }
  }
  return <AuthContext.Provider value={{ user, ready, error, authenticate, signOut }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
