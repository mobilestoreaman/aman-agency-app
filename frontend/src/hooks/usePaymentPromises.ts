import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { paymentPromisesApi, type CreatePaymentPromisePayload, type ReschedulePayload } from '@/api/paymentPromises'
import { getApiError } from '@/api/client'


export const promiseKeys = {
  all:    ['payment-promises'] as const,
  list:   (p?: object) => [...promiseKeys.all, 'list', p] as const,
}

export interface PromiseListParams {
  customer_id?: string
  status?:      string
  search?:      string
  from_date?:   string
  to_date?:     string
  page?:        number
  limit?:       number
}

export function usePaymentPromises(params?: PromiseListParams) {
  return useQuery({
    queryKey: promiseKeys.list(params),
    queryFn:  () => paymentPromisesApi.list(params).then((r) => r.data),
  })
}

export function useCreatePaymentPromise() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreatePaymentPromisePayload) => paymentPromisesApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: promiseKeys.all })
      toast.success('Payment promise recorded.')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useReschedulePromise() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & ReschedulePayload) =>
      paymentPromisesApi.reschedule(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: promiseKeys.all })
      toast.success('Promise rescheduled. New reminder set.')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useMarkPromisePaid() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      paymentPromisesApi.markPaid(id, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: promiseKeys.all })
      toast.success('Promise marked as paid.')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useMarkPromiseBroken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => paymentPromisesApi.markBroken(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: promiseKeys.all })
      toast.success('Promise marked as broken.')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useBulkMarkPaid() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => paymentPromisesApi.bulkMarkPaid(ids).then(r => r.data.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: promiseKeys.all })
      toast.success(`${data.updated} promise${data.updated !== 1 ? 's' : ''} marked as paid`)
    },
    onError: () => toast.error('Bulk update failed'),
  })
}
