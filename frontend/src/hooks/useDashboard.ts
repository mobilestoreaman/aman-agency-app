import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '@/api/dashboard'

export const dashboardKeys = {
  all:         ['dashboard'] as const,
  data:        () => [...dashboardKeys.all, 'data'] as const,
  closing:     () => [...dashboardKeys.all, 'closing'] as const,
  performance: () => [...dashboardKeys.all, 'my-performance'] as const,
}

export function useDashboard() {
  return useQuery({
    queryKey: dashboardKeys.data(),
    queryFn: () => dashboardApi.get().then((r) => r.data.data),
    refetchInterval: 5 * 60_000,   // refresh every 5 min
    staleTime:       2 * 60_000,
  })
}

export function useClosingSummary() {
  return useQuery({
    queryKey: dashboardKeys.closing(),
    queryFn: () => dashboardApi.closingSummary().then(r => r.data.data),
    staleTime: 5 * 60 * 1000,
  })
}

export function useStaffPerformance() {
  return useQuery({
    queryKey: dashboardKeys.performance(),
    queryFn: () => dashboardApi.myPerformance().then(r => r.data.data),
    staleTime: 2 * 60 * 1000,
  })
}
