import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { productsApi, type CreateProductPayload, type UpdateProductPayload } from '@/api/products'
import { getApiError } from '@/api/client'

export const productKeys = {
  all:    ['products'] as const,
  list:   (p?: object) => [...productKeys.all, 'list', p] as const,
  detail: (id: string) => [...productKeys.all, 'detail', id] as const,
}

export function useProducts(params?: {
  page?: number
  limit?: number
  search?: string
  brand_id?: string
  category?: string
}) {
  return useQuery({
    queryKey: productKeys.list(params),
    queryFn: () => productsApi.list(params).then((r) => r.data),
  })
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: productKeys.detail(id),
    queryFn: () => productsApi.getById(id).then((r) => r.data.data),
    enabled: !!id,
  })
}

export function useCreateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateProductPayload) => productsApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productKeys.all })
      toast.success('Product created.')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useUpdateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & UpdateProductPayload) =>
      productsApi.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productKeys.all })
      toast.success('Product updated.')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useDeleteProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => productsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productKeys.all })
      toast.success('Product deleted.')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

/** All known product categories for the dropdown */
export const PRODUCT_CATEGORIES = [
  'Smartphone',
  'Tablet',
  'Laptop',
  'Smartwatch',
  'TWS / Earbuds',
  'Headphones',
  'Speaker',
  'Charger / Cable',
  'Case / Cover',
  'Screen Protector',
  'Power Bank',
  'Other Accessory',
] as const
