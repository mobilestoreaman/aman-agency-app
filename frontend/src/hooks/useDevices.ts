import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { devicesApi } from '@/api/devices'
import { getApiError } from '@/api/client'
import type { Device, DeviceStatus } from '@/types'

export const deviceKeys = {
  all:       ['devices'] as const,
  list:      (p?: object) => [...deviceKeys.all, 'list', p] as const,
  detail:    (id: string) => [...deviceKeys.all, 'detail', id] as const,
  imei:      (imei: string) => [...deviceKeys.all, 'imei', imei] as const,
  stock:     () => [...deviceKeys.all, 'stock-summary'] as const,
}

export function useDevices(params?: {
  page?: number; limit?: number
  search?: string; status?: DeviceStatus; product_id?: string
  sort_available_first?: boolean
}) {
  return useQuery({
    queryKey: deviceKeys.list(params),
    queryFn:  () => devicesApi.list(params).then((r) => r.data),
  })
}

export function useDevice(id: string) {
  return useQuery({
    queryKey: deviceKeys.detail(id),
    queryFn:  () => devicesApi.getById(id).then((r) => r.data.data),
    enabled:  !!id,
  })
}

export function useDeviceByIMEI(imei: string) {
  return useQuery({
    queryKey: deviceKeys.imei(imei),
    queryFn:  () => devicesApi.getByIMEI(imei).then((r) => r.data.data),
    enabled:  imei.length >= 10,
    retry:    false,
  })
}

export function useStockSummary() {
  return useQuery({
    queryKey: deviceKeys.stock(),
    queryFn:  () => devicesApi.stockSummary().then((r) => r.data.data),
    staleTime: 60_000,
  })
}

export function useCreateDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Omit<Device, 'id' | 'product_name' | 'brand_name' | 'created_at' | 'updated_at' | 'status'>) =>
      devicesApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: deviceKeys.all })
      toast.success('Device added to inventory.')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useUpdateDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<Device>) =>
      devicesApi.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: deviceKeys.all })
      toast.success('Device updated.')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useChangeDeviceStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: DeviceStatus; notes?: string }) =>
      devicesApi.changeStatus(id, status, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: deviceKeys.all })
      toast.success('Device status updated.')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useDeleteDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => devicesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: deviceKeys.all })
      toast.success('Device removed.')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

// ── Helpers ───────────────────────────────────────────────────
export const DEVICE_STATUSES: DeviceStatus[] = [
  'available', 'sold', 'repair', 'returned', 'defective',
]

export const STORAGE_OPTIONS = ['32GB', '64GB', '128GB', '256GB', '512GB', '1TB', '2TB']
