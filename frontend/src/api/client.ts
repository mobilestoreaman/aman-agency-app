import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/store/authStore'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
})

// ── Request interceptor: attach access token ─────────────────
// Read directly from the zustand store (not raw localStorage) so there is
// a single source of truth for token state.
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Response interceptor: handle 401 + token refresh ─────────
let isRefreshing = false
let failedQueue: { resolve: (v: unknown) => void; reject: (e: unknown) => void }[] = []

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error)
    else prom.resolve(token)
  })
  failedQueue = []
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`
            return apiClient(originalRequest)
          })
          .catch((err) => Promise.reject(err))
      }

      originalRequest._retry = true
      isRefreshing = true

      const { refreshToken, clearAuth, setAccessToken } = useAuthStore.getState()
      if (!refreshToken) {
        processQueue(error, null)
        isRefreshing = false
        clearAuth()
        window.location.href = '/login'
        return Promise.reject(error)
      }

      try {
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, {
          refresh_token: refreshToken,
        })
        const { access_token } = data.data
        setAccessToken(access_token)
        apiClient.defaults.headers.common.Authorization = `Bearer ${access_token}`
        processQueue(null, access_token)
        originalRequest.headers.Authorization = `Bearer ${access_token}`
        return apiClient(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        // Only clear auth on HTTP 401/403 responses. Network errors (no .response)
        // should not log the user out.
        if (axios.isAxiosError(refreshError) && refreshError.response &&
            (refreshError.response.status === 401 || refreshError.response.status === 403)) {
          clearAuth()
          window.location.href = '/login'
        }
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  },
)

/** Extract the nested error message from the API error response */
export function getApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return (error.response?.data as { error?: string })?.error ?? error.message
  }
  return String(error)
}
