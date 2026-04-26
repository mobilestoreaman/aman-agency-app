import { apiClient } from './client'
import type { ApiResponse, PaginatedResponse, Product } from '@/types'

export interface CreateProductPayload {
  brand_id: string
  model_name: string
  variant: { ram: string; storage: string }
  color: string
  screen_size?: string
  barcode: string
  barcode_type?: string
  accessories?: {
    has_charger?: boolean
    has_earphones?: boolean
    has_cable?: boolean
    has_box?: boolean
  }
  images?: string[]  // up to 3 uploaded photo URLs
}

export interface UpdateProductPayload {
  brand_id?: string
  model_name?: string
  variant?: { ram: string; storage: string }
  color?: string
  screen_size?: string
  barcode?: string
  barcode_type?: string
  accessories?: {
    has_charger?: boolean
    has_earphones?: boolean
    has_cable?: boolean
    has_box?: boolean
  }
  images?: string[]  // pass to update; omit to leave unchanged
}

export const productsApi = {
  list: (params?: { page?: number; limit?: number; search?: string; brand_id?: string }) =>
    apiClient.get<PaginatedResponse<Product>>('/products', { params }),

  getById: (id: string) =>
    apiClient.get<ApiResponse<Product>>(`/products/${id}`),

  getByBarcode: (barcode: string) =>
    apiClient.get<ApiResponse<Product>>(`/products/barcode/${barcode}`),

  create: (body: CreateProductPayload) =>
    apiClient.post<ApiResponse<Product>>('/products', body),

  update: (id: string, body: UpdateProductPayload) =>
    apiClient.put<ApiResponse<Product>>(`/products/${id}`, body),

  delete: (id: string) => apiClient.delete(`/products/${id}`),
}
