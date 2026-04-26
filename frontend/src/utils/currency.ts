/** Format a number as Indian Rupee (₹) with comma separators */
export function formatCurrency(
  amount: number | null | undefined,
  symbol = '₹',
): string {
  if (amount == null || isNaN(amount)) return `${symbol}0.00`
  return `${symbol}${new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`
}

/** Compact format for large numbers: ₹1.2L, ₹4.5Cr */
export function formatCurrencyCompact(amount: number | null | undefined): string {
  if (amount == null || isNaN(amount)) return '₹0'
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(2)}Cr`
  if (amount >= 100_000)    return `₹${(amount / 100_000).toFixed(2)}L`
  if (amount >= 1_000)      return `₹${(amount / 1_000).toFixed(1)}K`
  return `₹${amount.toFixed(0)}`
}
