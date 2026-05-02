import { apiClient } from './client'
import type { ApiResponse, PaginatedResponse, Vendor } from '@/types'

export const vendorsApi = {
  list: (params?: { page?: number; limit?: number; search?: string }) =>
    apiClient.get<PaginatedResponse<Vendor>>('/vendors', { params }),

  getById: (id: string) =>
    apiClient.get<ApiResponse<Vendor>>(`/vendors/${id}`),

  create: (body: Omit<Vendor, 'id' | 'created_at' | 'updated_at' | 'payable_balance' | 'has_ledger'>) =>
    apiClient.post<ApiResponse<Vendor>>('/vendors', body),

  update: (id: string, body: Partial<Vendor>) =>
    apiClient.put<ApiResponse<Vendor>>(`/vendors/${id}`, body),

  delete: (id: string) => apiClient.delete(`/vendors/${id}`),
}
