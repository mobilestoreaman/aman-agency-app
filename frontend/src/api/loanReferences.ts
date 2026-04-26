import { apiClient } from './client'
import type { ApiResponse, LoanReference, PaginatedResponse, LoanStatus } from '@/types'

export const loanReferencesApi = {
  list: (params?: {
    page?:    number
    limit?:   number
    search?:  string
    status?:  LoanStatus
    provider?: string
  }) => apiClient.get<PaginatedResponse<LoanReference>>('/loan-references', { params }),

  get: (id: string) =>
    apiClient.get<ApiResponse<LoanReference>>(`/loan-references/${id}`),

  create: (body: {
    customer_id:         string
    sale_id?:            string
    provider:            string
    loan_account_number: string
    loan_amount:         number
    emi_amount?:         number
    tenure_months?:      number
    disbursed_date?:     string   // DD-MM-YYYY
    notes?:              string
  }) => apiClient.post<ApiResponse<LoanReference>>('/loan-references', body),

  update: (id: string, body: {
    provider?:            string
    loan_account_number?: string
    loan_amount?:         number
    emi_amount?:          number
    tenure_months?:       number
    disbursed_date?:      string
    notes?:               string
  }) => apiClient.put<ApiResponse<LoanReference>>(`/loan-references/${id}`, body),

  changeStatus: (id: string, status: LoanStatus) =>
    apiClient.patch<ApiResponse<LoanReference>>(`/loan-references/${id}/status`, { status }),

  delete: (id: string) => apiClient.delete(`/loan-references/${id}`),
}
