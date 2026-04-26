import { apiClient } from './client'
import type {
  ApiResponse, CreditSummary, RevenueSummary, SalesByPeriodPoint, StockValuation,
  ProfitLossReport, ProductPerformanceEntry, CustomerInsightEntry, InventoryHealthReport, CashFlowEntry,
} from '@/types'

export const reportsApi = {
  revenue: (params?: { from?: string; to?: string }) =>
    apiClient.get<ApiResponse<RevenueSummary>>('/reports/revenue', { params }),

  stockValuation: () =>
    apiClient.get<ApiResponse<StockValuation>>('/reports/stock-valuation'),

  creditSummary: () =>
    apiClient.get<ApiResponse<CreditSummary>>('/reports/credit-summary'),

  salesByPeriod: (params?: { from?: string; to?: string; group_by?: 'daily' | 'weekly' | 'monthly' }) =>
    apiClient.get<ApiResponse<SalesByPeriodPoint[]>>('/reports/sales-by-period', { params }),

  profitLoss: (params?: { from?: string; to?: string; group_by?: string }) =>
    apiClient.get<ApiResponse<ProfitLossReport>>('/reports/profit-loss', { params }),

  productPerformance: (params?: { from?: string; to?: string }) =>
    apiClient.get<ApiResponse<ProductPerformanceEntry[]>>('/reports/product-performance', { params }),

  customerInsights: (params?: { from?: string; to?: string }) =>
    apiClient.get<ApiResponse<CustomerInsightEntry[]>>('/reports/customer-insights', { params }),

  inventoryHealth: () =>
    apiClient.get<ApiResponse<InventoryHealthReport>>('/reports/inventory-health'),

  cashFlow: (params?: { from?: string; to?: string; group_by?: string }) =>
    apiClient.get<ApiResponse<CashFlowEntry[]>>('/reports/cash-flow', { params }),
}
