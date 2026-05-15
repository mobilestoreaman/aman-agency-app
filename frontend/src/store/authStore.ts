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

// Neither accessToken nor refreshToken is persisted to localStorage.
// Both live in memory only so XSS cannot exfiltrate usable tokens.
// Only the lightweight user object and isAuthenticated flag are persisted
// so that the UI can show the user's name/role on reload without a round-trip.
// On page load the app immediately calls /auth/refresh (with the httpOnly
// cookie or in-memory refresh token from the last active tab) to re-issue
// the access token before any authenticated API call fires.
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
      // Persist only the user profile and auth flag — never tokens.
      // Persisting a refresh token in localStorage exposes it to XSS; an
      // attacker who injects a script can read it and mint fresh access tokens
      // indefinitely. The memory-only refresh token is acceptable because it is
      // cleared on tab/window close and cannot be read cross-origin.
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
)

/** Convenience selector: returns true if the logged-in user is admin */
export const useIsAdmin = () =>
  useAuthStore((s) => s.user?.role === 'admin')
