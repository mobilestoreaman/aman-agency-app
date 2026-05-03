/**
 * Utilities for the optional custom bill-number suffix feature.
 *
 * The backend accepts an optional `custom_bill_suffix` (digits only, 1–8 chars).
 * When provided, the bill number becomes BILL-DD-MM-YYYY-<suffix>.
 * When omitted, the backend auto-generates a 6-char hex suffix.
 */

/** Allowed characters: digits only, maximum 8 characters. */
const SUFFIX_RE = /^\d{1,8}$/

/**
 * Returns an error message string if the suffix is invalid, or `null` if it is
 * valid (or empty, which means "auto-generate").
 */
export function validateBillSuffix(value: string): string | null {
  if (value === '') return null // empty = auto-generate, always valid
  if (!/^\d+$/.test(value)) return 'Bill number must contain digits only'
  if (value.length > 8) return 'Bill number can be at most 8 digits'
  return null
}

/**
 * Strips any non-digit characters and trims to 8 chars.
 * Safe to use in an `onChange` handler to prevent invalid input from being typed.
 */
export function sanitizeBillSuffix(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 8)
}

/**
 * Returns the preview bill number that will be generated for today's date,
 * given a suffix.  Purely cosmetic — the authoritative number is always
 * assigned server-side.
 *
 * Format: BILL-DD-MM-YYYY-<suffix>
 */
export function previewBillNumber(suffix: string): string {
  if (!suffix) return ''
  const now = new Date()
  const dd   = String(now.getDate()).padStart(2, '0')
  const mm   = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = String(now.getFullYear())
  return `BILL-${dd}-${mm}-${yyyy}-${suffix}`
}
