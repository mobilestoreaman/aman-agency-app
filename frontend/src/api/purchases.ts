import { apiClient } from './client'
import type { ApiResponse, PaginatedResponse, Purchase } from '@/types'

export interface CreatePurchaseItemPayload {
  product_id:     string
  imei1:          string
  imei2?:         string
  condition:      'new' | 'used' | 'refurbished'
  color?:         string
  storage?:       string
  purchase_price: number
  selling_price?: number
}

export interface CreatePurchasePayload {
  vendor_id:    string
  items:        CreatePurchaseItemPayload[]
  notes?:       string
  purchased_at?: string  // ISO 8601
}

export interface UpdatePurchasePayload {
  vendor_id?:    string
  items?:        CreatePurchaseItemPayload[]
  notes?:        string
  purchased_at?: string  // ISO 8601
}

export interface ReceivePurchasePayload {
  notes?: string
}

export const purchasesApi = {
  list: (params?: { page?: number; limit?: number; search?: string; status?: string; vendor_id?: string; from_date?: string; to_date?: string }) =>
    apiClient.get<PaginatedResponse<Purchase>>('/purchases', { params }),

  getById: (id: string) =>
    apiClient.get<ApiResponse<Purchase>>(`/purchases/${id}`),

  create: (body: CreatePurchasePayload) =>
    apiClient.post<ApiResponse<Purchase>>('/purchases', body),

  update: (id: string, body: UpdatePurchasePayload) =>
    apiClient.put<ApiResponse<Purchase>>(`/purchases/${id}`, body),

  // Marks a purchase as received and materialises Device documents for each line item.
  receive: (id: string, body: ReceivePurchasePayload = {}) =>
    apiClient.patch<ApiResponse<Purchase>>(`/purchases/${id}/receive`, body),

  delete: (id: string) => apiClient.delete(`/purchases/${id}`),
}
