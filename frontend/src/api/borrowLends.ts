import { apiClient } from './client'
import type { ApiResponse, BorrowLend, PaginatedResponse, BorrowLendStatus, BorrowLendType } from '@/types'

export const borrowLendsApi = {
  list: (params?: {
    page?:      number
    limit?:     number
    type?:      BorrowLendType
    status?:    BorrowLendStatus
    search?:    string
    from_date?: string
    to_date?:   string
  }) => apiClient.get<PaginatedResponse<BorrowLend>>('/borrow-lends', { params }),

  get: (id: string) =>
    apiClient.get<ApiResponse<BorrowLend>>(`/borrow-lends/${id}`),

  create: (body: {
    type:                  BorrowLendType
    device_id:             string
    customer_id?:          string
    party_name:            string
    party_phone?:          string
    borrow_date:           string
    expected_return_date?: string
    notes?:                string
  }) => apiClient.post<ApiResponse<BorrowLend>>('/borrow-lends', body),

  update: (id: string, body: {
    party_name?:           string
    party_phone?:          string
    expected_return_date?: string
    notes?:                string
  }) => apiClient.put<ApiResponse<BorrowLend>>(`/borrow-lends/${id}`, body),

  markReturned: (id: string, payload: {
    resolution_type:   'device' | 'payment'
    settlement_amount?: number
    notes?:            string
  }) => apiClient.patch<ApiResponse<BorrowLend>>(`/borrow-lends/${id}/return`, payload),

  markOverdue: (id: string) =>
    apiClient.patch<ApiResponse<BorrowLend>>(`/borrow-lends/${id}/overdue`, {}),

  delete: (id: string) => apiClient.delete(`/borrow-lends/${id}`),
}
