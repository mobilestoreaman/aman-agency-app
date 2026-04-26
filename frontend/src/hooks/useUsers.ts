import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { authApi } from '@/api/auth'
import { getApiError } from '@/api/client'

export const userKeys = {
  all: ['users'] as const,
  list: (params?: object) => [...userKeys.all, 'list', params] as const,
}

export function useUsers(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: userKeys.list(params),
    queryFn: () => authApi.listUsers(params).then((r) => r.data),
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; email: string; password: string; role: string }) =>
      authApi.createUser(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.all })
      toast.success('User created successfully.')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; role?: string; is_active?: boolean }) =>
      authApi.updateUser(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.all })
      toast.success('User updated.')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}
