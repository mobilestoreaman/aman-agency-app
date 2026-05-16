import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { billsApi } from '@/api/bills'
import { getApiError } from '@/utils/error'
import type { BillStatus } from '@/types'

export const billKeys = {
  all:    ['bills'] as const,
  list:   (p?: object) => [...billKeys.all, 'list', p] as const,
  detail: (id: string) => [...billKeys.all, 'detail', id] as const,
}

export const BILL_STATUS_LABELS: Record<BillStatus, string> = {
  draft:   'Draft',
  issued:  'Issued',
  voided:  'Voided',
}

interface BillParams {
  page?:           number
  limit?:          number
  status?:         BillStatus | ''
  search?:         string
  from_date?:      string
  to_date?:        string
  customer_phone?: string
}

export function useBills(params?: BillParams) {
  return useQuery({
    queryKey: billKeys.list(params),
    queryFn:  () => billsApi.list(params).then((r) => r.data),
    staleTime: 30_000,
  })
}

export function useBill(id: string) {
  return useQuery({
    queryKey: billKeys.detail(id),
    queryFn:  () => billsApi.getById(id).then((r) => r.data.data),
    enabled:  !!id,
  })
}

export function useBillBySaleId(saleId: string) {
  return useQuery({
    queryKey: [...billKeys.all, 'by-sale', saleId],
    queryFn:  () => billsApi.getBySaleId(saleId).then((r) => r.data.data),
    enabled:  !!saleId,
  })
}

export function useCreateBill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof billsApi.create>[0]) =>
      billsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: billKeys.all })
      qc.invalidateQueries({ queryKey: ['sales'] }) // sale detail shows associated bill
      toast.success('Bill created')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useIssueBill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => billsApi.issue(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: billKeys.all })
      qc.invalidateQueries({ queryKey: ['sales'] })
      toast.success('Bill issued')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useVoidBill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      billsApi.void(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: billKeys.all })
      qc.invalidateQueries({ queryKey: ['sales'] })
      toast.success('Bill voided')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

/** Opens the printable HTML invoice in a new tab using an authenticated fetch. */
export function useOpenBillInvoice() {
  return (id: string) => billsApi.openInvoice(id).catch((e) => toast.error(getApiError(e)))
}

/** Sends the invoice link to the customer via WhatsApp. */
export function useSendBillWhatsApp() {
  return useMutation({
    mutationFn: (id: string) => billsApi.sendWhatsApp(id),
    onSuccess: () => toast.success('Invoice link sent via WhatsApp'),
    onError: (e) => toast.error(getApiError(e)),
  })
}
