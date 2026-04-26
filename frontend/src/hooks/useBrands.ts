import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { brandsApi } from '@/api/brands'
import { getApiError } from '@/api/client'

export const brandKeys = {
  all:     ['brands'] as const,
  list:    (p?: object) => [...brandKeys.all, 'list', p] as const,
  detail:  (id: string) => [...brandKeys.all, 'detail', id] as const,
  products:(id: string, p?: object) => [...brandKeys.all, id, 'products', p] as const,
}

export function useBrands(params?: { page?: number; limit?: number; search?: string }) {
  return useQuery({
    queryKey: brandKeys.list(params),
    queryFn: () => brandsApi.list(params).then((r) => r.data),
  })
}

export function useBrand(id: string) {
  return useQuery({
    queryKey: brandKeys.detail(id),
    queryFn: () => brandsApi.getById(id).then((r) => r.data.data),
    enabled: !!id,
  })
}

export function useBrandProducts(id: string, params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: brandKeys.products(id, params),
    queryFn: () => brandsApi.getProducts(id, params).then((r) => r.data),
    enabled: !!id,
  })
}

export function useCreateBrand() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; logo_url?: string }) => brandsApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: brandKeys.all })
      toast.success('Brand created.')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useUpdateBrand() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; logo_url?: string }) =>
      brandsApi.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: brandKeys.all })
      toast.success('Brand updated.')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useDeleteBrand() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => brandsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: brandKeys.all })
      toast.success('Brand deleted.')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}
