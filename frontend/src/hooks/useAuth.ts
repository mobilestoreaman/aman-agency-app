import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { getApiError } from '@/api/client'
import type { LoginRequest } from '@/types'

// ── Login ─────────────────────────────────────────────────────
export function useLogin() {
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (data: LoginRequest) => authApi.login(data),
    onSuccess: ({ data }) => {
      const payload = data.data
      setAuth(payload.user, payload.access_token, payload.refresh_token)
      toast.success(`Welcome back, ${payload.user.name.split(' ')[0]}!`)
      navigate('/', { replace: true })
    },
    onError: (error) => {
      toast.error(getApiError(error))
    },
  })
}

// ── Logout ────────────────────────────────────────────────────
export function useLogout() {
  const { clearAuth } = useAuthStore()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: () => {
      clearAuth()
      queryClient.clear()
      navigate('/login', { replace: true })
    },
  })
}

// ── Change password ───────────────────────────────────────────
export function useChangePassword() {
  return useMutation({
    mutationFn: (data: { current_password: string; new_password: string }) =>
      authApi.changePassword(data),
    onSuccess: () => toast.success('Password changed successfully.'),
    onError: (error) => toast.error(getApiError(error)),
  })
}
