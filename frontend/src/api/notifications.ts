import { apiClient } from './client'
import type { ApiResponse, Notification, PaginatedResponse } from '@/types'

export const notificationsApi = {
  list: (params?: { page?: number; limit?: number; status?: string }) =>
    apiClient.get<PaginatedResponse<Notification>>('/notifications', { params }),

  unreadCount: () =>
    apiClient.get<ApiResponse<{ count: number }>>('/notifications/unread-count'),

  create: (body: { type: string; title: string; body: string; recipient_email?: string }) =>
    apiClient.post<ApiResponse<Notification>>('/notifications', body),

  markRead: (id: string) =>
    apiClient.patch<ApiResponse<Notification>>(`/notifications/${id}/read`),

  dismiss: (id: string) =>
    apiClient.patch<ApiResponse<Notification>>(`/notifications/${id}/dismiss`),

  markAllRead: () =>
    apiClient.patch('/notifications/read-all'),

  delete: (id: string) => apiClient.delete(`/notifications/${id}`),
}
