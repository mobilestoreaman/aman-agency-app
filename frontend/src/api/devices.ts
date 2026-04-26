import { apiClient } from './client'
import type { ApiResponse, Device, DeviceStatus, PaginatedResponse, StockSummary } from '@/types'

export const devicesApi = {
  list: (params?: { page?: number; limit?: number; search?: string; status?: DeviceStatus; product_id?: string; sort_available_first?: boolean }) =>
    apiClient.get<PaginatedResponse<Device>>('/devices', { params }),

  getById: (id: string) =>
    apiClient.get<ApiResponse<Device>>(`/devices/${id}`),

  getByIMEI: (imei: string) =>
    apiClient.get<ApiResponse<Device>>(`/devices/imei/${imei}`),

  stockSummary: () =>
    apiClient.get<ApiResponse<StockSummary>>('/stock/summary'),

  create: (body: Omit<Device, 'id' | 'product_name' | 'brand_name' | 'created_at' | 'updated_at' | 'status'>) =>
    apiClient.post<ApiResponse<Device>>('/devices', body),

  update: (id: string, body: Partial<Device>) =>
    apiClient.put<ApiResponse<Device>>(`/devices/${id}`, body),

  changeStatus: (id: string, status: DeviceStatus, notes?: string) =>
    apiClient.patch<ApiResponse<Device>>(`/devices/${id}/status`, { status, notes }),

  delete: (id: string) => apiClient.delete(`/devices/${id}`),
}
