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
  clearAuth: () => void
}

// Tokens are stored in localStorage via zustand's persist middleware (keyed
// under 'aman-auth'). This is the standard SPA approach; the trade-off is that
// localStorage is accessible to JS. Mitigate by keeping dependencies minimal and
// ensuring the backend returns short-lived access tokens (< 15 min).
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      setAuth: (user, accessToken, refreshToken) => {
        // zustand persist writes to localStorage automatically on set().
        set({ user, accessToken, refreshToken, isAuthenticated: true })
      },

      setAccessToken: (token) => {
        set({ accessToken: token })
      },

      clearAuth: () => {
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false })
      },
    }),
    {
      name: 'aman-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
)

/** Convenience selector: returns true if the logged-in user is admin */
export const useIsAdmin = () =>
  useAuthStore((s) => s.user?.role === 'admin')
