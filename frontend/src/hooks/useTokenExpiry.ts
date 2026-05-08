import { useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '@/store/authStore'

/**
 * Decode a JWT payload without verifying the signature (client-side only).
 * Returns the `exp` unix timestamp (seconds), or null if the token is missing
 * or malformed.
 */
function getTokenExp(token: string | null): number | null {
  if (!token) return null
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

/**
 * useTokenExpiry — proactively logs the user out when the refresh token expires.
 *
 * Mount this ONCE in AppShell (always rendered for authenticated users).
 *
 * Two complementary strategies:
 *
 * 1. Timer  — schedules a logout exactly at refresh-token expiry. Fires even
 *    when the user is actively using the app (e.g. no pending API calls).
 *
 * 2. Visibility guard — browsers throttle setTimeout when a tab is in the
 *    background (sometimes by minutes). When the user returns to the tab,
 *    the visibilitychange handler immediately checks whether the token has
 *    already expired and logs out synchronously if so.
 */
export function useTokenExpiry() {
  const refreshToken    = useAuthStore((s) => s.refreshToken)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const clearAuth       = useAuthStore((s) => s.clearAuth)
  const timerRef        = useRef<ReturnType<typeof setTimeout> | null>(null)

  const forceLogout = useCallback(() => {
    clearAuth()
    window.location.href = '/login'
  }, [clearAuth])

  // ── Strategy 1: schedule a timer at the exact expiry moment ────────────
  useEffect(() => {
    // Clear any existing timer before scheduling a new one
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    if (!isAuthenticated) return

    const exp = getTokenExp(refreshToken)
    if (!exp) return

    const msUntilExpiry = exp * 1000 - Date.now()

    if (msUntilExpiry <= 0) {
      // Already expired (can happen after a long background sleep)
      forceLogout()
      return
    }

    // Schedule logout at exact expiry
    // Note: setTimeout max is ~24.8 days. The refresh token TTL is 7 days,
    // well within range.
    timerRef.current = setTimeout(forceLogout, msUntilExpiry)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [refreshToken, isAuthenticated, forceLogout])

  // ── Strategy 2: re-check on tab focus (throttled-timer safety net) ─────
  useEffect(() => {
    if (!isAuthenticated) return

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return
      const exp = getTokenExp(refreshToken)
      if (exp && exp * 1000 <= Date.now()) {
        forceLogout()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [refreshToken, isAuthenticated, forceLogout])
}
