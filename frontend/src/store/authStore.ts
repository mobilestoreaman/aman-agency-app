import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean

  setAuth: (user: User, accessToken: string, refreshToken: string) => void
  setAccessToken: (token: string) => void
  /** Called after a successful token refresh — persists BOTH the new access and
   *  refresh tokens (the backend rotates the refresh token on every refresh). */
  setTokens: (accessToken: string, refreshToken: string) => void
  clearAuth: () => void
}

// accessToken lives in memory only (never persisted) — it's short-lived and
// re-issued from the refresh token on every page load, so there is no benefit
// to storing it and some risk if it were persisted.
//
// refreshToken IS persisted to localStorage so that page refreshes don't
// silently log the user out. This is a deliberate trade-off: localStorage is
// readable by any same-origin JS (XSS risk), but the alternative — losing the
// session on every reload — is unacceptable UX. The proper long-term fix is to
// store the refresh token in an httpOnly cookie set by the backend, which would
// make it invisible to JavaScript entirely. Until that backend change is made,
// localStorage is the pragmatic choice.
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      setAuth: (user, accessToken, refreshToken) => {
        set({ user, accessToken, refreshToken, isAuthenticated: true })
      },

      setAccessToken: (token) => {
        set({ accessToken: token })
      },

      setTokens: (accessToken, refreshToken) => {
        set({ accessToken, refreshToken })
      },

      clearAuth: () => {
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false })
      },
    }),
    {
      name: 'aman-auth',
      // Persist user profile, auth flag, and refresh token.
      // accessToken is intentionally excluded — it's memory-only and re-issued
      // from the refresh token by the 401 interceptor on every page load.
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        refreshToken: state.refreshToken,
      }),
    },
  ),
)

/** Convenience selector: returns true if the logged-in user is admin */
export const useIsAdmin = () =>
  useAuthStore((s) => s.user?.role === 'admin')
