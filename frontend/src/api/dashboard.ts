import { apiClient } from './client'
import type { ApiResponse, DashboardData, SearchResult } from '@/types'

export const dashboardApi = {
  get: () =>
    apiClient.get<ApiResponse<DashboardData>>('/dashboard'),
}

export const searchApi = {
  search: (params: { q: string; types?: string }) =>
    apiClient.get<ApiResponse<SearchResult[]>>('/search', { params }),
}
