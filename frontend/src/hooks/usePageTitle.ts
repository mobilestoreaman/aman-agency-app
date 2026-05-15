import { useEffect } from 'react'

const APP_NAME = 'New Aman Agency'

/**
 * Sets the browser tab title for the current page.
 * Falls back to the app name when no title is provided.
 *
 * Usage: usePageTitle('Sales')  →  "Sales | New Aman Agency"
 */
export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} | ${APP_NAME}` : APP_NAME
    return () => {
      document.title = APP_NAME
    }
  }, [title])
}
