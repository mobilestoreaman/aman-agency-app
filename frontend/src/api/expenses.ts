import { apiClient } from './client'
import type { ApiResponse, Expense, ExpenseSummary, PaginatedResponse } from '@/types'

export const expensesApi = {
  list: (params?: { page?: number; limit?: number; category?: string; search?: string; from?: string; to?: string }) =>
    apiClient.get<PaginatedResponse<Expense>>('/expenses', { params }),

  getById: (id: string) =>
    apiClient.get<ApiResponse<Expense>>(`/expenses/${id}`),

  summary: (params?: { from?: string; to?: string }) =>
    apiClient.get<ApiResponse<ExpenseSummary>>('/expenses/summary', { params }),

  create: (body: Omit<Expense, 'id' | 'created_by' | 'created_at' | 'updated_at'>) =>
    apiClient.post<ApiResponse<Expense>>('/expenses', body),

  update: (id: string, body: Partial<Expense>) =>
    apiClient.put<ApiResponse<Expense>>(`/expenses/${id}`, body),

  delete: (id: string) => apiClient.delete(`/expenses/${id}`),
}
