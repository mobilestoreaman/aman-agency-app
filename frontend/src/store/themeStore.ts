import { useEffect } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark' | 'system'

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

// ── Helper: apply theme class to <html> ──────────────────────────────────────

function applyTheme(theme: Theme) {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)

  document.documentElement.classList.toggle('dark', isDark)
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'system' as Theme,

      setTheme: (theme: Theme) => {
        set({ theme })
        applyTheme(theme)
      },
    }),
    { name: 'aman-theme' },
  ),
)

// ── Derived helper ───────────────────────────────────────────────────────────

export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// ── useThemeInit — call once at app root ─────────────────────────────────────
// Applies the persisted theme on mount and subscribes to OS-level changes
// when the user has chosen 'system'. Safe to call multiple times (idempotent).

export function useThemeInit() {
  useEffect(() => {
    // Apply the persisted preference immediately on first render.
    applyTheme(useThemeStore.getState().theme)

    // When the user picks 'system', mirror OS preference changes in real time.
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handleOsChange = () => {
      if (useThemeStore.getState().theme === 'system') {
        applyTheme('system')
      }
    }
    mq.addEventListener('change', handleOsChange)
    return () => mq.removeEventListener('change', handleOsChange)
  }, [])
}
