import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { vendorsApi } from '@/api/vendors'
import { getApiError } from '@/utils/error'
import type { Vendor } from '@/types'

export const vendorKeys = {
  all:    ['vendors'] as const,
  list:   (p?: object) => [...vendorKeys.all, 'list', p] as const,
  detail: (id: string) => [...vendorKeys.all, 'detail', id] as const,
}

interface VendorParams {
  page?:      number
  limit?: number
  search?:    string
}

export function useVendors(params?: VendorParams) {
  return useQuery({
    queryKey:  vendorKeys.list(params),
    queryFn:   () => vendorsApi.list(params).then((r) => r.data),
    staleTime: 60_000,
  })
}

export function useVendor(id: string) {
  return useQuery({
    queryKey: vendorKeys.detail(id),
    queryFn:  () => vendorsApi.getById(id).then((r) => r.data.data),
    enabled:  !!id,
  })
}

export function useCreateVendor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<Vendor, 'id' | 'created_at' | 'updated_at' | 'payable_balance' | 'has_ledger'>) =>
      vendorsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: vendorKeys.all })
      toast.success('Vendor added successfully')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useUpdateVendor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Vendor> & { id: string }) =>
      vendorsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: vendorKeys.all })
      toast.success('Vendor updated successfully')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useDeleteVendor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => vendorsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: vendorKeys.all })
      toast.success('Vendor deleted')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}
