import { apiClient } from './client'
import type { ApiResponse, Settings } from '@/types'

export const settingsApi = {
  get: () =>
    apiClient.get<ApiResponse<Settings>>('/settings'),

  update: (body: Partial<Omit<Settings, 'id' | 'updated_by' | 'updated_at' | 'logo_base64'>>) =>
    apiClient.put<ApiResponse<Settings>>('/settings', body),

  /** Upload a logo image (max 2 MB, image/* MIME types). Returns updated Settings. */
  uploadLogo: (file: File) => {
    const form = new FormData()
    form.append('logo', file)
    return apiClient.post<ApiResponse<Settings>>('/settings/logo', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  /** Remove the currently configured store logo. Returns updated Settings. */
  deleteLogo: () =>
    apiClient.delete<ApiResponse<Settings>>('/settings/logo'),
}
