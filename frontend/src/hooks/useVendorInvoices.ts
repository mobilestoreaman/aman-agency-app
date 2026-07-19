import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { vendorInvoicesApi } from '@/api/vendorInvoices'
import { getApiError } from '@/utils/error'
import type { InvoiceStatus, OCRMode, CreatePurchaseFromInvoiceRequest } from '@/types'
import { purchaseKeys } from '@/hooks/usePurchases'

export const invoiceKeys = {
  all:     ['vendor-invoices'] as const,
  list:    (p?: object) => [...invoiceKeys.all, 'list', p] as const,
  detail:  (id: string) => [...invoiceKeys.all, 'detail', id] as const,
  engines: () => [...invoiceKeys.all, 'engines'] as const,
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  pending:      'Pending',
  processing:   'Processing',
  done:         'Done',
  failed:       'Failed',
  needs_review: 'Needs Review',
}

export const INVOICE_STATUS_COLORS: Record<InvoiceStatus, string> = {
  pending:      'text-muted-foreground',
  processing:   'text-blue-600',
  done:         'text-green-600',
  failed:       'text-red-600',
  needs_review: 'text-amber-600',
}

// Standalone OCR modes — all engines run entirely in-house, no subscriptions required.
export const OCR_MODE_OPTIONS: { value: OCRMode; label: string; description: string }[] = [
  {
    value: 'auto',
    label: 'Auto (Recommended)',
    description: 'Uses the best available engine — PaddleOCR when running, Tesseract otherwise. No external service.',
  },
  {
    value: 'paddleocr',
    label: 'PaddleOCR (Accurate)',
    description: 'Deep-learning OCR with table detection and layout analysis. Best for Indian GST invoices.',
  },
  {
    value: 'tesseract',
    label: 'Tesseract OCR (Fast)',
    description: 'Open-source OCR engine running entirely inside the server — lightweight and always available.',
  },
]

interface InvoiceListParams {
  vendor_id?:   string
  purchase_id?: string
  status?:      string
  page?:        number
  limit?:       number
}

export function useVendorInvoices(params?: InvoiceListParams) {
  return useQuery({
    queryKey: invoiceKeys.list(params),
    queryFn: () => vendorInvoicesApi.list(params).then((r) => r.data),
    staleTime: 30_000,
  })
}

export function useVendorInvoice(id: string | undefined) {
  return useQuery({
    queryKey: invoiceKeys.detail(id ?? ''),
    queryFn: () => vendorInvoicesApi.getById(id!).then((r) => r.data.data),
    enabled: !!id,
    // Poll while processing so UI updates automatically
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'pending' || status === 'processing' ? 2000 : false
    },
  })
}

export function useUploadVendorInvoice(mode: OCRMode = 'auto') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) =>
      vendorInvoicesApi.upload(file, mode).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invoiceKeys.all })
    },
    onError: (err) => {
      toast.error(getApiError(err))
    },
  })
}

export function useDeleteVendorInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => vendorInvoicesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invoiceKeys.all })
      toast.success('Invoice deleted')
    },
    onError: (err) => {
      toast.error(getApiError(err))
    },
  })
}

export function useAvailableOCREngines() {
  return useQuery({
    queryKey: invoiceKeys.engines(),
    queryFn: () => vendorInvoicesApi.getEngines().then((r) => r.data.data ?? {}),
    staleTime: Infinity, // engine list doesn't change at runtime
  })
}

/**
 * Finds the reference photo invoice linked to a purchase.
 * Returns undefined when the purchase has no linked invoice.
 */
export function useInvoiceByPurchaseId(purchaseId: string | undefined) {
  return useQuery({
    queryKey: invoiceKeys.list({ purchase_id: purchaseId }),
    queryFn: () =>
      vendorInvoicesApi.list({ purchase_id: purchaseId, limit: 1 })
        .then((r) => r.data.data?.[0] ?? null),
    enabled: !!purchaseId,
    staleTime: 60_000,
  })
}

/**
 * Links a reference photo invoice to an existing purchase.
 * Called after the manual purchase wizard creates the purchase.
 */
export function useLinkInvoicePurchase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ invoiceId, purchaseId }: { invoiceId: string; purchaseId: string }) =>
      vendorInvoicesApi.linkPurchase(invoiceId, purchaseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invoiceKeys.all })
    },
    // Silent — this is a background linking step, don't toast on failure
    onError: (err) => {
      console.warn('Failed to link invoice to purchase:', getApiError(err))
    },
  })
}

/**
 * Converts a completed vendor invoice into a purchase record.
 * On success: invalidates both vendor-invoices and purchases caches.
 */
export function useCreatePurchaseFromInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ invoiceId, req }: { invoiceId: string; req: CreatePurchaseFromInvoiceRequest }) =>
      vendorInvoicesApi.createPurchaseFromInvoice(invoiceId, req).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invoiceKeys.all })
      qc.invalidateQueries({ queryKey: purchaseKeys.all })
    },
    onError: (err) => {
      toast.error(getApiError(err))
    },
  })
}
