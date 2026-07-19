import { apiClient } from './client'
import type { ApiResponse, PaginatedResponse, VendorInvoice, OCRMode, CreatePurchaseFromInvoiceRequest, Purchase } from '@/types'

export interface VendorInvoiceListParams {
  vendor_id?:   string
  purchase_id?: string
  status?:      string
  page?:        number
  limit?:       number
}

export const vendorInvoicesApi = {
  /**
   * Upload a vendor invoice for OCR processing.
   * Returns immediately with status=pending; poll getById for the result.
   */
  upload: (file: File, mode: OCRMode = 'auto') => {
    const form = new FormData()
    form.append('file', file)
    form.append('ocr_mode', mode)
    return apiClient.post<ApiResponse<VendorInvoice>>('/vendor-invoices/upload', form, {
      headers: { 'Content-Type': undefined },
      timeout: 120_000, // 2 min — OCR can take a while
    })
  },

  list: (params?: VendorInvoiceListParams) =>
    apiClient.get<PaginatedResponse<VendorInvoice>>('/vendor-invoices', { params }),

  getById: (id: string) =>
    apiClient.get<ApiResponse<VendorInvoice>>(`/vendor-invoices/${id}`),

  delete: (id: string) =>
    apiClient.delete<ApiResponse<{ deleted: boolean }>>(`/vendor-invoices/${id}`),

  /**
   * Returns the set of OCR engines available on this deployment.
   * Keys are mode strings; values are human-readable engine names.
   */
  getEngines: () =>
    apiClient.get<ApiResponse<Record<string, string>>>('/vendor-invoices/engines'),

  /**
   * Convert a completed invoice into a purchase record.
   * Sends the admin-reviewed vendor + item data to the backend.
   */
  createPurchaseFromInvoice: (invoiceId: string, req: CreatePurchaseFromInvoiceRequest) =>
    apiClient.post<ApiResponse<Purchase>>(`/vendor-invoices/${invoiceId}/to-purchase`, req),

  /**
   * Link a reference photo invoice to an existing purchase.
   * Called by the manual purchase wizard after creating the purchase.
   */
  linkPurchase: (invoiceId: string, purchaseId: string) =>
    apiClient.patch<ApiResponse<{ linked: boolean }>>(`/vendor-invoices/${invoiceId}/link-purchase`, { purchase_id: purchaseId }),

  /**
   * Returns the URL to stream the raw invoice file (image or PDF).
   * Use as <img src=...> for images or open in a new tab for PDFs.
   * The backend serves it with auth so we must use the /api path with credentials.
   */
  fileUrl: (invoiceId: string) => `/api/v1/vendor-invoices/${invoiceId}/file`,
}
