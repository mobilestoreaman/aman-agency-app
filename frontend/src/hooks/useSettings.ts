import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { settingsApi } from '@/api/settings'
import { getApiError } from '@/utils/error'

export const settingsKeys = {
  all:    ['settings'] as const,
  detail: () => [...settingsKeys.all, 'detail'] as const,
}

export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.detail(),
    queryFn:  () => settingsApi.get().then((r) => r.data.data),
    staleTime: 120_000,
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof settingsApi.update>[0]) =>
      settingsApi.update(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.all })
      toast.success('Settings saved')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

/** Upload a new store logo image. Invalidates settings cache on success. */
export function useUploadLogo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => settingsApi.uploadLogo(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.all })
      toast.success('Logo uploaded')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

/** Remove the current store logo. Invalidates settings cache on success. */
export function useDeleteLogo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => settingsApi.deleteLogo(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.all })
      toast.success('Logo removed')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}
