import { apiClient } from './client'
import type { ApiResponse, BulkMarkPaidResponse, PaginatedResponse, PaymentPromise } from '@/types'

export interface CreatePaymentPromisePayload {
  customer_id:     string
  sale_id?:        string
  amount_promised: number
  promised_date:   string  // YYYY-MM-DD
  notes?:          string
}

export interface ReschedulePayload {
  new_date:         string   // YYYY-MM-DD
  amount_promised?: number
  notes?:           string
}

export const paymentPromisesApi = {
  list: (params?: {
    customer_id?: string
    status?:      string
    search?:      string
    from_date?:   string
    to_date?:     string
    page?:        number
    limit?:       number
  }) =>
    apiClient.get<PaginatedResponse<PaymentPromise>>('/payment-promises', { params }),

  create: (body: CreatePaymentPromisePayload) =>
    apiClient.post<ApiResponse<PaymentPromise>>('/payment-promises', body),

  reschedule: (id: string, body: ReschedulePayload) =>
    apiClient.patch<ApiResponse<PaymentPromise>>(`/payment-promises/${id}/reschedule`, body),

  markPaid: (id: string, notes?: string) =>
    apiClient.patch<ApiResponse<PaymentPromise>>(`/payment-promises/${id}/paid`, { notes }),

  markBroken: (id: string) =>
    apiClient.patch<ApiResponse<PaymentPromise>>(`/payment-promises/${id}/broken`),

  bulkMarkPaid: (ids: string[]) =>
    apiClient.post<ApiResponse<BulkMarkPaidResponse>>('/payment-promises/bulk-paid', { ids }),
}
