import { apiClient } from './client'
import type { ApiResponse, PaginatedResponse, VendorLedgerEntry } from '@/types'

export const vendorLedgerApi = {
  // ── Global listing ─────────────────────────────────────────────────────────
  // GET /vendor-ledger — supports optional vendor_id / date / search filters
  list: (params?: {
    page?:      number
    limit?:     number
    vendor_id?: string
    from_date?: string   // DD-MM-YYYY
    to_date?:   string   // DD-MM-YYYY
    search?:    string   // regex on vendor_name or reference
    type?:      string   // purchase|payment|adjustment|reversal
  }) => apiClient.get<PaginatedResponse<VendorLedgerEntry>>('/vendor-ledger', { params }),

  // ── Per-vendor listing ──────────────────────────────────────────────────────
  // GET /vendors/:id/ledger
  listByVendor: (vendorId: string, params?: {
    page?:  number
    limit?: number
    type?:  string
  }) => apiClient.get<PaginatedResponse<VendorLedgerEntry>>(`/vendors/${vendorId}/ledger`, { params }),

  // ── Write operations ────────────────────────────────────────────────────────
  // Add a manual entry:
  //   type='payment'    → POST /vendors/:id/payments    (reduces payable)
  //   type='adjustment' → POST /vendors/:id/adjustments (admin only, manual correction)
  addEntry: (body: {
    vendor_id:    string
    type:         'payment' | 'adjustment' | 'opening_balance'
    amount:       number
    notes?:       string
    purchase_id?: string
  }) => {
    if (body.type === 'payment') {
      return apiClient.post<ApiResponse<VendorLedgerEntry>>(
        `/vendors/${body.vendor_id}/payments`,
        { amount: body.amount, notes: body.notes, purchase_id: body.purchase_id || undefined },
      )
    }
    if (body.type === 'opening_balance') {
      return apiClient.post<ApiResponse<VendorLedgerEntry>>(
        `/vendors/${body.vendor_id}/opening-balance`,
        { amount: body.amount, notes: body.notes },
      )
    }
    // 'adjustment' → POST /vendors/:id/adjustments (admin only)
    return apiClient.post<ApiResponse<VendorLedgerEntry>>(
      `/vendors/${body.vendor_id}/adjustments`,
      { amount: body.amount, notes: body.notes || 'Manual adjustment' },
    )
  },
}
