import { useQuery } from '@tanstack/react-query'
import { reportsApi } from '@/api/reports'

export const reportKeys = {
  all:            ['reports'] as const,
  revenue:        (p?: object) => [...reportKeys.all, 'revenue', p] as const,
  stockValuation: () => [...reportKeys.all, 'stock-valuation'] as const,
  creditSummary:  () => [...reportKeys.all, 'credit-summary'] as const,
  salesByPeriod:  (p?: object) => [...reportKeys.all, 'sales-by-period', p] as const,
}

export function useRevenueReport(params?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: reportKeys.revenue(params),
    queryFn:  () => reportsApi.revenue(params).then((r) => r.data.data),
    staleTime: 60_000,
  })
}

export function useStockValuation() {
  return useQuery({
    queryKey: reportKeys.stockValuation(),
    queryFn:  () => reportsApi.stockValuation().then((r) => r.data.data),
    staleTime: 60_000,
  })
}

export function useCreditSummary() {
  return useQuery({
    queryKey: reportKeys.creditSummary(),
    queryFn:  () => reportsApi.creditSummary().then((r) => r.data.data),
    staleTime: 60_000,
  })
}

export function useSalesByPeriod(params?: { from?: string; to?: string; group_by?: 'daily' | 'weekly' | 'monthly' }) {
  return useQuery({
    queryKey: reportKeys.salesByPeriod(params),
    queryFn:  () => reportsApi.salesByPeriod(params).then((r) => r.data.data),
    staleTime: 60_000,
  })
}

export function useProfitLoss(params?: { from?: string; to?: string; group_by?: string }) {
  return useQuery({
    queryKey: [...reportKeys.all, 'profit-loss', params] as const,
    queryFn: () => reportsApi.profitLoss(params).then((r) => r.data.data),
    staleTime: 60_000,
  })
}

export function useProductPerformance(params?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: [...reportKeys.all, 'product-performance', params] as const,
    queryFn: () => reportsApi.productPerformance(params).then((r) => r.data.data),
    staleTime: 60_000,
  })
}

export function useCustomerInsights(params?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: [...reportKeys.all, 'customer-insights', params] as const,
    queryFn: () => reportsApi.customerInsights(params).then((r) => r.data.data),
    staleTime: 60_000,
  })
}

export function useInventoryHealth() {
  return useQuery({
    queryKey: [...reportKeys.all, 'inventory-health'] as const,
    queryFn: () => reportsApi.inventoryHealth().then((r) => r.data.data),
    staleTime: 60_000,
  })
}

export function useCashFlow(params?: { from?: string; to?: string; group_by?: string }) {
  return useQuery({
    queryKey: [...reportKeys.all, 'cash-flow', params] as const,
    queryFn: () => reportsApi.cashFlow(params).then((r) => r.data.data),
    staleTime: 60_000,
  })
}
