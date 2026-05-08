import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { salesApi } from '@/api/sales'
import { getApiError } from '@/utils/error'
import type { SaleStatus, PaymentMode } from '@/types'

export const saleKeys = {
  all:    ['sales'] as const,
  list:   (p?: object) => [...saleKeys.all, 'list', p] as const,
  detail: (id: string) => [...saleKeys.all, 'detail', id] as const,
}

export const PAYMENT_MODES: PaymentMode[] = ['cash', 'upi', 'card', 'bank_transfer', 'credit', 'emi']

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  cash:          'Cash',
  upi:           'UPI',
  card:          'Card',
  bank_transfer: 'Bank Transfer',
  credit:        'Credit',
  emi:           'Finance/EMI',
}

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  completed: 'Completed',
  cancelled: 'Cancelled',
}

interface SaleParams {
  page?:        number
  limit?:   number
  search?:      string
  customer_id?: string
  status?:      SaleStatus
  from_date?:   string  // DD-MM-YYYY
  to_date?:     string  // DD-MM-YYYY
}

export function useSales(params?: SaleParams) {
  return useQuery({
    queryKey:  saleKeys.list(params),
    queryFn:   () => salesApi.list(params).then((r) => r.data),
    staleTime: 30_000,
  })
}

export function useSale(id: string) {
  return useQuery({
    queryKey: saleKeys.detail(id),
    queryFn:  () => salesApi.get(id).then((r) => r.data.data),
    enabled:  !!id,
  })
}

export interface SaleItemPayload {
  device_id:  string
  sale_price: number
}

export interface CreateSalePayload {
  customer_id:           string
  items:                 SaleItemPayload[]
  amount_paid:           number
  payment_mode?:         'cash' | 'upi' | 'card' | 'bank_transfer' | 'credit' | 'emi'
  finance_provider?:     string  // required when payment_mode='emi'
  finance_company_name?: string  // required when finance_provider='other'
  notes?:                string
  sold_at?:              string  // ISO 8601
}

export function useCreateSale() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateSalePayload) => salesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: saleKeys.all })
      // Device statuses will have changed — refresh devices + dashboard
      qc.invalidateQueries({ queryKey: ['devices'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
      toast.success('Sale recorded successfully')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useCancelSale() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => salesApi.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: saleKeys.all })
      qc.invalidateQueries({ queryKey: ['devices'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
      // A cancelled sale with a balance triggers a credit ledger reversal entry
      // and may affect open payment promises — refresh both.
      qc.invalidateQueries({ queryKey: ['credit-ledger'] })
      qc.invalidateQueries({ queryKey: ['payment-promises'] })
      // An EMI sale that is cancelled had an auto-created loan reference —
      // invalidate so the loan reference list reflects the cancellation.
      qc.invalidateQueries({ queryKey: ['loan-references'] })
      toast.success('Sale cancelled')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}
