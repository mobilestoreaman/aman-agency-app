import { apiClient } from './client'
import type { ApiResponse, CreditLedgerEntry, Customer, PaginatedResponse } from '@/types'

export const customersApi = {
  list: (params?: { page?: number; limit?: number; search?: string; credit?: string }) =>
    apiClient.get<PaginatedResponse<Customer>>('/customers', { params }),

  getById: (id: string) =>
    apiClient.get<ApiResponse<Customer>>(`/customers/${id}`),

  create: (body: { name: string; phone: string; address?: string; notes?: string }) =>
    apiClient.post<ApiResponse<Customer>>('/customers', body),

  update: (id: string, body: Partial<Customer>) =>
    apiClient.put<ApiResponse<Customer>>(`/customers/${id}`, body),

  delete: (id: string) => apiClient.delete(`/customers/${id}`),

  getLedger: (id: string, params?: { page?: number; limit?: number }) =>
    apiClient.get<PaginatedResponse<CreditLedgerEntry>>(`/customers/${id}/ledger`, { params }),

  recordPayment: (id: string, body: { amount: number; notes?: string }) =>
    apiClient.post<ApiResponse<CreditLedgerEntry>>(`/customers/${id}/payments`, body),

  recordAdjustment: (id: string, body: { amount: number; notes?: string }) =>
    apiClient.post<ApiResponse<CreditLedgerEntry>>(`/customers/${id}/adjustments`, body),
}
