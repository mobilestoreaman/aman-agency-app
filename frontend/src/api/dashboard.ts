import { apiClient } from './client'
import type { ApiResponse, DashboardData, DailyClosingResponse, StaffPerformanceResponse, SearchResult } from '@/types'

export const dashboardApi = {
  get: () =>
    apiClient.get<ApiResponse<DashboardData>>('/dashboard'),

  closingSummary: () =>
    apiClient.get<ApiResponse<DailyClosingResponse>>('/dashboard/closing'),

  myPerformance: () =>
    apiClient.get<ApiResponse<StaffPerformanceResponse>>('/dashboard/my-performance'),
}

export const searchApi = {
  search: (params: { q: string; types?: string }) =>
    apiClient.get<ApiResponse<SearchResult[]>>('/search', { params }),
}
