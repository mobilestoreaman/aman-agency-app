import { format, parse, isValid } from 'date-fns'

/** DD-MM-YYYY — matches the backend's IST date format throughout */
export const DATE_FORMAT = 'dd-MM-yyyy'

/** Format a JS Date (or ISO string) to DD-MM-YYYY */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (!isValid(d)) return '—'
  return format(d, DATE_FORMAT)
}

/** Format a JS Date to DD-MM-YYYY HH:mm */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (!isValid(d)) return '—'
  return format(d, `${DATE_FORMAT} HH:mm`)
}

/** Parse a DD-MM-YYYY string back to a JS Date */
export function parseDate(str: string): Date | null {
  if (!str) return null
  const d = parse(str, DATE_FORMAT, new Date())
  return isValid(d) ? d : null
}

/** Today's date as DD-MM-YYYY string */
export function todayString(): string {
  return format(new Date(), DATE_FORMAT)
}

/**
 * Converts an HTML date-input value (YYYY-MM-DD) to the backend's DD-MM-YYYY format.
 * Returns undefined for empty/invalid strings instead of producing a malformed date.
 */
export function toApiDate(d: string): string | undefined {
  if (!d || typeof d !== 'string') return undefined
  const parts = d.split('-')
  if (parts.length !== 3 || parts[0].length !== 4) return undefined
  const [y, m, day] = parts
  if (!y || !m || !day) return undefined
  return `${day}-${m}-${y}`
}
