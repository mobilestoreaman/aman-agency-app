import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { borrowLendsApi } from '@/api/borrowLends'
import { getApiError } from '@/utils/error'
import { dashboardKeys } from './useDashboard'
import type { BorrowLendType, BorrowLendStatus } from '@/types'

export const borrowLendKeys = {
  all:    ['borrow-lends'] as const,
  list:   (p?: object) => [...borrowLendKeys.all, 'list', p] as const,
  detail: (id: string) => [...borrowLendKeys.all, 'detail', id] as const,
}

export const BORROW_LEND_TYPE_LABELS: Record<BorrowLendType, string> = {
  borrow: 'Borrowed',
  lend:   'Lent out',
}

export const BORROW_LEND_STATUS_LABELS: Record<BorrowLendStatus, string> = {
  active:   'Active',
  returned: 'Returned',
  overdue:  'Overdue',
}

interface BorrowLendParams {
  page?:      number
  limit?:     number
  search?:    string
  type?:      BorrowLendType
  status?:    BorrowLendStatus
  from_date?: string
  to_date?:   string
}

export function useBorrowLends(params?: BorrowLendParams) {
  return useQuery({
    queryKey:  borrowLendKeys.list(params),
    queryFn:   () => borrowLendsApi.list(params).then((r) => r.data),
    staleTime: 60_000,
  })
}

export interface CreateBorrowLendPayload {
  type:                  BorrowLendType
  device_id:             string
  customer_id?:          string
  party_name:            string
  party_phone?:          string
  borrow_date:           string   // DD-MM-YYYY
  expected_return_date?: string
  notes?:                string
}

export function useCreateBorrowLend() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateBorrowLendPayload) => borrowLendsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: borrowLendKeys.all })
      qc.invalidateQueries({ queryKey: ['devices'] })   // device status changes
      qc.invalidateQueries({ queryKey: dashboardKeys.all })
      toast.success('Entry recorded')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useUpdateBorrowLend() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; party_name?: string; party_phone?: string; expected_return_date?: string; notes?: string }) =>
      borrowLendsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: borrowLendKeys.all })
      qc.invalidateQueries({ queryKey: dashboardKeys.all })
      toast.success('Entry updated')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export interface MarkReturnedPayload {
  id:                string
  resolution_type:   'device' | 'payment'
  settlement_amount?: number
  notes?:            string
}

export function useMarkReturned() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, resolution_type, settlement_amount, notes }: MarkReturnedPayload) =>
      borrowLendsApi.markReturned(id, { resolution_type, settlement_amount, notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: borrowLendKeys.all })
      qc.invalidateQueries({ queryKey: ['devices'] })
      qc.invalidateQueries({ queryKey: dashboardKeys.all })
      toast.success('Marked as returned')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useMarkOverdue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => borrowLendsApi.markOverdue(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: borrowLendKeys.all })
      qc.invalidateQueries({ queryKey: dashboardKeys.all })
      toast.success('Marked as overdue')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useDeleteBorrowLend() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => borrowLendsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: borrowLendKeys.all })
      qc.invalidateQueries({ queryKey: ['devices'] })
      qc.invalidateQueries({ queryKey: dashboardKeys.all })
      toast.success('Entry deleted')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}
