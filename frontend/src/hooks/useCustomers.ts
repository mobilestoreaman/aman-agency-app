import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { customersApi } from '@/api/customers'
import { getApiError } from '@/utils/error'
import type { Customer } from '@/types'

export const customerKeys = {
  all:    ['customers'] as const,
  list:   (p?: object) => [...customerKeys.all, 'list', p] as const,
  detail: (id: string) => [...customerKeys.all, 'detail', id] as const,
}

interface CustomerParams {
  page?:    number
  limit?:   number
  search?:  string
  credit?:  string   // "with_balance" | "no_balance" | undefined (all)
}

export function useCustomers(params?: CustomerParams) {
  return useQuery({
    queryKey:  customerKeys.list(params),
    queryFn:   () => customersApi.list(params).then((r) => r.data),
    staleTime: 60_000,
  })
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: customerKeys.detail(id),
    queryFn:  () => customersApi.getById(id).then((r) => r.data.data),
    enabled:  !!id,
  })
}

type CustomerPayload = {
  name: string
  phone: string
  address?: string
  notes?: string
}

export function useCreateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CustomerPayload) => customersApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: customerKeys.all })
      toast.success('Customer added successfully')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useUpdateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<CustomerPayload> & { id: string }) =>
      customersApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: customerKeys.all })
      toast.success('Customer updated successfully')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useDeleteCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => customersApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: customerKeys.all })
      toast.success('Customer deleted')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}
