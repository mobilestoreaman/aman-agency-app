import { apiClient } from './client'
import type { ApiResponse, Bill, PaginatedResponse } from '@/types'

export const billsApi = {
  list: (params?: { page?: number; limit?: number; status?: string; search?: string; from_date?: string; to_date?: string }) =>
    apiClient.get<PaginatedResponse<Bill>>('/bills', { params }),

  getById: (id: string) =>
    apiClient.get<ApiResponse<Bill>>(`/bills/${id}`),

  getBySaleId: (saleId: string) =>
    apiClient.get<ApiResponse<Bill>>(`/bills/sale/${saleId}`),

  create: (body: { sale_id: string; custom_bill_suffix?: string; discount?: number; discount_pct?: number; tax_pct?: number; notes?: string }) =>
    apiClient.post<ApiResponse<Bill>>('/bills', body),

  issue: (id: string) =>
    apiClient.patch<ApiResponse<Bill>>(`/bills/${id}/issue`),

  void: (id: string, notes?: string) =>
    apiClient.patch<ApiResponse<Bill>>(`/bills/${id}/void`, notes ? { notes } : {}),

  /**
   * Fetches the HTML invoice via axios (sends the JWT auth header),
   * converts it to a blob URL, and opens it in a new tab.
   *
   * window.open('/api/v1/.../invoice') alone fails because the browser
   * can't attach the Authorization header to a plain tab navigation.
   */
  openInvoice: async (id: string): Promise<void> => {
    const res = await apiClient.get<string>(`/bills/${id}/invoice`, {
      responseType: 'text',
      headers: { Accept: 'text/html' },
    })
    const blob = new Blob([res.data], { type: 'text/html; charset=utf-8' })
    const blobUrl = URL.createObjectURL(blob)
    const win = window.open(blobUrl, '_blank')

    if (!win) {
      // Popup was blocked — revoke the URL immediately since it won't be used.
      URL.revokeObjectURL(blobUrl)
    } else {
      // Popup opened successfully — revoke after the document has loaded.
      // Listen for the load event to ensure the document is fully loaded.
      win.addEventListener('load', () => {
        URL.revokeObjectURL(blobUrl)
      }, { once: true })
    }
  },

  /** Sends the invoice link to the customer's phone via WhatsApp. */
  sendWhatsApp: (id: string) =>
    apiClient.post<ApiResponse<{ message: string }>>(`/bills/${id}/whatsapp`),
}
