import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, setToken, ApiError } from './api'
import type { Session, User } from './api/types'

type AuthContextValue = {
  user: User | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  expire: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)
const KEY = 'haven-operator-session'

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => {
    const s = readSession()
    if (s && new Date(s.expires_at) > new Date()) {
      setToken(s.access_token)
      return s
    }
    return null
  })

  const clear = useCallback(() => {
    setToken(null)
    try {
      sessionStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
    setSession(null)
  }, [])

  // Re-validate a stored session on load; drop it if the server rejects it.
  useEffect(() => {
    if (!session) return
    api.me().catch((e) => {
      if (e instanceof ApiError && e.status === 401) clear()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password)
    setToken(res.access_token)
    if (res.user.role !== 'operator') {
      await api.logout().catch(() => {})
      setToken(null)
      throw new ApiError(
        403,
        'not_operator',
        'This dashboard is for government operators. Family accounts use the Haven mobile app.',
      )
    }
    try {
      sessionStorage.setItem(KEY, JSON.stringify(res))
    } catch {
      /* session lasts for this page only */
    }
    setSession(res)
  }, [])

  const logout = useCallback(async () => {
    await api.logout().catch(() => {})
    clear()
  }, [clear])

  return (
    <AuthContext.Provider value={{ user: session?.user ?? null, login, logout, expire: clear }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
