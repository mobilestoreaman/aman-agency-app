import { useAuthStore } from '@/store/authStore'
import type { ApiResponse } from '@/types'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

export const uploadApi = {
  /**
   * Uploads a single image file to the server using native fetch.
   * We intentionally avoid axios here: axios merges the instance-level
   * "Content-Type: application/json" default into every request, which
   * strips the boundary from the multipart/form-data header and breaks
   * the server's multipart parser.  fetch() leaves Content-Type unset so
   * the browser auto-generates "multipart/form-data; boundary=XXXX".
   *
   * Returns the public URL of the stored image.
   * Max 5 MB per file; JPEG / PNG / WebP only.
   */
  productImage: async (file: File): Promise<{ data: ApiResponse<{ url: string }> }> => {
    const form = new FormData()
    form.append('file', file)

    const token = useAuthStore.getState().accessToken
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    // No Content-Type — browser sets multipart/form-data + boundary automatically

    const res = await fetch(`${BASE_URL}/upload/product-image`, {
      method: 'POST',
      headers,
      body: form,
    })

    const json = await res.json()
    if (!res.ok) {
      throw new Error((json as { error?: string })?.error ?? 'Upload failed')
    }

    // Return { data: json } to match the AxiosResponse<ApiResponse<...>> shape
    // that callers expect (res.data.data.url).
    return { data: json as ApiResponse<{ url: string }> }
  },
}
