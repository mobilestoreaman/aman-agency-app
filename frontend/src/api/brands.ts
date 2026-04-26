import { apiClient } from './client'
import type { ApiResponse, Brand, PaginatedResponse, Product } from '@/types'

export const brandsApi = {
  list: (params?: { page?: number; limit?: number; search?: string }) =>
    apiClient.get<PaginatedResponse<Brand>>('/brands', { params }),

  getById: (id: string) =>
    apiClient.get<ApiResponse<Brand>>(`/brands/${id}`),

  getProducts: (id: string, params?: { page?: number; limit?: number }) =>
    apiClient.get<PaginatedResponse<Product>>(`/brands/${id}/products`, { params }),

  create: (body: { name: string; logo_url?: string }) =>
    apiClient.post<ApiResponse<Brand>>('/brands', body),

  update: (id: string, body: Partial<{ name: string; logo_url: string }>) =>
    apiClient.put<ApiResponse<Brand>>(`/brands/${id}`, body),

  delete: (id: string) => apiClient.delete(`/brands/${id}`),
}
