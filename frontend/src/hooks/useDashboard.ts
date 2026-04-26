import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '@/api/dashboard'

export const dashboardKeys = {
  all:  ['dashboard'] as const,
  data: () => [...dashboardKeys.all, 'data'] as const,
}

export function useDashboard() {
  return useQuery({
    queryKey: dashboardKeys.data(),
    queryFn: () => dashboardApi.get().then((r) => r.data.data),
    refetchInterval: 5 * 60_000,   // refresh every 5 min
    staleTime:       2 * 60_000,
  })
}
