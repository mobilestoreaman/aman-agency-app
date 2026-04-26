import { apiClient } from './client'
import type { ApiResponse, AuthTokens, LoginRequest, LoginResponse, User } from '@/types'

export const authApi = {
  login: (body: LoginRequest) =>
    apiClient.post<ApiResponse<LoginResponse>>('/auth/login', body),

  refresh: (refresh_token: string) =>
    apiClient.post<ApiResponse<{ access_token: string }>>('/auth/refresh', { refresh_token }),

  logout: () => apiClient.post('/auth/logout'),

  me: () => apiClient.get<ApiResponse<User>>('/auth/me'),

  changePassword: (body: { current_password: string; new_password: string }) =>
    apiClient.post('/auth/change-password', body),

  listUsers: (params?: { page?: number; limit?: number }) =>
    apiClient.get('/users', { params }),

  createUser: (body: { name: string; email: string; password: string; role: string }) =>
    apiClient.post('/users', body),

  updateUser: (id: string, body: Partial<{ name: string; role: string; is_active: boolean }>) =>
    apiClient.patch(`/users/${id}`, body),
}
