import { useQuery } from '@tanstack/react-query'
import { logsApi } from '@/api/logs'
import type { TraceLogFilters } from '@/types/logs'

export const LOG_LEVEL_COLORS = {
  DEBUG: 'text-gray-500',
  INFO: 'text-blue-600',
  WARN: 'text-yellow-600',
  ERROR: 'text-red-600',
}

export const LOG_LEVEL_BADGE_VARIANT = {
  DEBUG: 'secondary',
  INFO: 'default',
  WARN: 'warning',
  ERROR: 'destructive',
} as const

export function useLogs(filters: TraceLogFilters, autoRefresh = true) {
  return useQuery({
    queryKey: ['logs', filters],
    queryFn: () => logsApi.list(filters).then(r => r.data),
    staleTime: 10_000,
    refetchInterval: autoRefresh ? 30_000 : false,
  })
}

export function useLogDetail(id: string | null) {
  return useQuery({
    queryKey: ['log', id],
    queryFn: () => logsApi.getById(id!).then(r => r.data.data),
    enabled: !!id,
  })
}

export function useTraceTimeline(traceId: string | null) {
  return useQuery({
    queryKey: ['trace', traceId],
    queryFn: () => logsApi.getTrace(traceId!).then(r => r.data.data),
    enabled: !!traceId,
  })
}
