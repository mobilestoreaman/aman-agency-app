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

// accessToken is intentionally NOT persisted to localStorage — it lives in
// memory only so XSS cannot exfiltrate a usable token. refreshToken and user
// are persisted so the session survives a page reload; the access token is
// silently recovered via the /auth/refresh flow on the first API call.
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
      // Persist only what is needed to restore the session — never the
      // short-lived access token (reduces XSS blast radius).
      partialize: (state) => ({
        user: state.user,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
)

/** Convenience selector: returns true if the logged-in user is admin */
export const useIsAdmin = () =>
  useAuthStore((s) => s.user?.role === 'admin')
