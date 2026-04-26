import { apiClient } from './client'
import type { ApiResponse, PaginatedResponse } from '@/types'
import type { TraceLog, TraceLogDetail, TraceLogFilters } from '@/types/logs'

export const logsApi = {
  list: (params?: TraceLogFilters) =>
    apiClient.get<PaginatedResponse<TraceLog>>('/admin/logs', { params }),

  getById: (id: string) =>
    apiClient.get<ApiResponse<TraceLogDetail>>(`/admin/logs/${id}`),

  getTrace: (traceId: string) =>
    apiClient.get<ApiResponse<TraceLog[]>>(`/admin/logs/trace/${traceId}`),

  export: (params?: TraceLogFilters & { format: 'csv' | 'json' }) =>
    apiClient.get('/admin/logs/export', { params, responseType: 'blob' }),
}
