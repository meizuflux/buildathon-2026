// Family account session: restores a saved token, signs in or registers, and signs out.
import React, { createContext, useContext, useEffect, useState } from 'react';
import { z } from 'zod';
import { http } from '../services/api/client';
import { session } from '../services/api/session';

const userSchema = z.object({ id: z.string(), role: z.enum(['family', 'operator']), family_id: z.string().nullable() });
const loginSchema = z.object({ access_token: z.string(), expires_at: z.string(), user: userSchema });
type User = z.infer<typeof userSchema>;

interface Auth {
  user: User | null;
  ready: boolean;
  error: string;
  authenticate: (email: string, password: string, register: boolean) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<Auth>({ user: null, ready: false, error: '', authenticate: async () => {}, signOut: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        if (await session.getToken()) {
          const me = await http('/api/me', userSchema);
          if (me.role !== 'family') throw new Error('Use a family account in this app.');
          if (live) setUser(me);
        }
      } catch (e) {
        await session.setToken(null);
        if (live) setError(e instanceof Error ? e.message : 'Please sign in again.');
      } finally {
        if (live) setReady(true);
      }
    })();
    return () => { live = false; };
  }, []);

  async function authenticate(email: string, password: string, register: boolean) {
    setError('');
    const body = { email: email.trim(), password };
    if (register) await http('/api/auth/register', z.object({ user_id: z.string(), role: z.literal('family') }), { method: 'POST', body });
    const login = await http('/api/auth/login', loginSchema, { method: 'POST', body });
    if (login.user.role !== 'family') throw new Error('Use a family account in this app.');
    await session.setToken(login.access_token);
    setUser(login.user);
  }

  async function signOut() {
    try { await http('/api/auth/logout', z.null(), { method: 'POST' }); }
    finally { await session.setToken(null); setUser(null); }
  }

  return <AuthContext.Provider value={{ user, ready, error, authenticate, signOut }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
