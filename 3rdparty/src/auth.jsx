import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, setToken, ApiError } from './api.js'

const AuthContext = createContext(null)
const KEY = 'haven-partner-session'

function read() {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY))
    return s && new Date(s.expires_at) > new Date() ? s : null
  } catch {
    return null
  }
}
function write(s) {
  try {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s))
    else sessionStorage.removeItem(KEY)
  } catch {
    /* session lasts for this page only */
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    const s = read()
    if (s) setToken(s.access_token)
    return s
  })

  const clear = useCallback(() => {
    setToken(null)
    write(null)
    setSession(null)
  }, [])

  // Re-validate on load (the operator may have disabled this login).
  useEffect(() => {
    if (!session) return
    api.me()
      .then((user) => setSession((s) => {
        const next = { ...s, user }
        write(next)
        return next
      }))
      .catch((e) => { if (e instanceof ApiError && e.status === 401) clear() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = useCallback(async (email, password) => {
    const res = await api.login(email, password)
    if (res.user.role !== 'partner') {
      setToken(res.access_token)
      await api.logout().catch(() => {})
      setToken(null)
      throw new ApiError(403, 'not_partner', res.user.role === 'operator'
        ? 'Operator accounts use the government dashboard, not the partner portal.'
        : 'This portal is for shelters and relief organizations. Families use the Haven mobile app.')
    }
    if (!res.user.site) throw new ApiError(403, 'no_site', 'This login is not linked to a shelter or organization yet. Contact your operations center.')
    setToken(res.access_token)
    write(res)
    setSession(res)
  }, [])

  const logout = useCallback(async () => {
    await api.logout().catch(() => {})
    clear()
  }, [clear])

  const passwordChanged = useCallback(() => {
    setSession((s) => {
      const next = { ...s, user: { ...s.user, must_change_password: false } }
      write(next)
      return next
    })
  }, [])

  return (
    <AuthContext.Provider value={{ user: session?.user ?? null, login, logout, expire: clear, passwordChanged }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
