import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { purchasesApi, type CreatePurchasePayload, type UpdatePurchasePayload, type ReceivePurchasePayload } from '@/api/purchases'
import { getApiError } from '@/utils/error'

export const purchaseKeys = {
  all:    ['purchases'] as const,
  list:   (p?: object) => [...purchaseKeys.all, 'list', p] as const,
  detail: (id: string) => [...purchaseKeys.all, 'detail', id] as const,
}

export type { CreatePurchasePayload, UpdatePurchasePayload, ReceivePurchasePayload }

interface PurchaseParams {
  page?:      number
  limit?: number
  search?:    string
  vendor_id?: string
  from_date?: string
  to_date?:   string
}

export function usePurchases(params?: PurchaseParams) {
  return useQuery({
    queryKey:  purchaseKeys.list(params),
    queryFn:   () => purchasesApi.list(params).then((r) => r.data),
    staleTime: 60_000,
  })
}

export function usePurchase(id: string) {
  return useQuery({
    queryKey: purchaseKeys.detail(id),
    queryFn:  () => purchasesApi.getById(id).then((r) => r.data.data),
    enabled:  !!id,
  })
}

export function useCreatePurchase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreatePurchasePayload) => purchasesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: purchaseKeys.all })
      // NOTE: devices are NOT created at purchase time — only after receiving.
      // Do not invalidate 'devices' here.
      toast.success('Purchase recorded — click "Receive Stock" to add devices to inventory.')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useUpdatePurchase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: UpdatePurchasePayload & { id: string }) =>
      purchasesApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: purchaseKeys.all })
      toast.success('Purchase updated')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useReceivePurchase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      purchasesApi.receive(id, { notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: purchaseKeys.all })
      // Receiving creates Device documents — refresh inventory everywhere.
      qc.invalidateQueries({ queryKey: ['devices'] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Stock received! Devices are now available in inventory.')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useDeletePurchase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => purchasesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: purchaseKeys.all })
      toast.success('Purchase deleted')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}
