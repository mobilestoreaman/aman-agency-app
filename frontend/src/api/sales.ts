import { apiClient } from './client'
import type { ApiResponse, PaginatedResponse, Sale, CreditLedgerEntry } from '@/types'

export const salesApi = {
  // ── Sales ──────────────────────────────────────────────────────────────────
  list: (params?: {
    page?:        number
    limit?:   number
    search?:      string
    status?:      string
    customer_id?: string
    from_date?:   string
    to_date?:     string
  }) => apiClient.get<PaginatedResponse<Sale>>('/sales', { params }),

  get: (id: string) =>
    apiClient.get<ApiResponse<Sale>>(`/sales/${id}`),

  create: (body: {
    customer_id:           string
    items:                 { device_id: string; sale_price: number }[]
    amount_paid:           number
    payment_mode?:         string
    finance_provider?:     string
    finance_company_name?: string
    notes?:                string
    sold_at?:              string  // ISO 8601 — defaults to now if omitted
  }) => apiClient.post<ApiResponse<Sale>>('/sales', body),

  cancel: (id: string) =>
    apiClient.patch<ApiResponse<Sale>>(`/sales/${id}/cancel`, {}),

  // ── Credit ledger ──────────────────────────────────────────────────────────
  // Global listing — GET /credit-ledger (supports optional customer_id / date filters)
  creditLedger: (params?: {
    page?:        number
    limit?:       number
    customer_id?: string
    from_date?:   string   // DD-MM-YYYY
    to_date?:     string   // DD-MM-YYYY
    search?:      string   // regex on customer_name or reference
  }) => apiClient.get<PaginatedResponse<CreditLedgerEntry>>('/credit-ledger', { params }),

  // Add a manual entry:
  //   type='payment'  → POST /customers/:id/payments    (reduces balance)
  //   type='credit'   → POST /customers/:id/adjustments (increases balance, admin only)
  addCreditEntry: (body: {
    customer_id: string
    type:        string
    amount:      number
    notes?:      string
    sale_id?:    string
  }) => {
    if (body.type === 'payment') {
      return apiClient.post<ApiResponse<CreditLedgerEntry>>(
        `/customers/${body.customer_id}/payments`,
        { amount: body.amount, notes: body.notes, sale_id: body.sale_id || undefined },
      )
    }
    // 'adjustment' → POST /customers/:id/adjustments (positive amount = customer owes more)
    return apiClient.post<ApiResponse<CreditLedgerEntry>>(
      `/customers/${body.customer_id}/adjustments`,
      { amount: body.amount, notes: body.notes || 'Manual credit entry' },
    )
  },
}
