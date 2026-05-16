import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { vendorLedgerApi } from '@/api/vendorLedger'
import { getApiError } from '@/utils/error'
import { useIsAdmin } from '@/store/authStore'

export const vendorLedgerKeys = {
  all:        ['vendor-ledger'] as const,
  list:       (p?: object) => [...vendorLedgerKeys.all, 'list', p] as const,
  byVendor:   (vendorId: string, p?: object) => [...vendorLedgerKeys.all, 'vendor', vendorId, p] as const,
  aging:      () => [...vendorLedgerKeys.all, 'aging'] as const,
}

// Form-level entry type (maps to different API endpoints):
//   'payment'         → POST /vendors/:id/payments         (reduces payable balance)
//   'adjustment'      → POST /vendors/:id/adjustments      (admin: manual balance change)
//   'opening_balance' → POST /vendors/:id/opening-balance  (admin: set historical debt)
export type VendorEntryType = 'payment' | 'adjustment' | 'opening_balance'

export const VENDOR_ENTRY_TYPE_LABELS: Record<VendorEntryType, string> = {
  payment:         'Payment made',
  adjustment:      'Manual adjustment',
  opening_balance: 'Opening balance',
}

interface LedgerParams {
  page?:      number
  limit?:     number
  vendor_id?: string
  from_date?: string  // DD-MM-YYYY
  to_date?:   string  // DD-MM-YYYY
  search?:    string
  type?:      string
}

export function useVendorLedger(params?: LedgerParams) {
  return useQuery({
    queryKey: vendorLedgerKeys.list(params),
    queryFn:  () => vendorLedgerApi.list(params).then((r) => r.data),
    staleTime: 30_000,
  })
}

export function useVendorLedgerByVendor(vendorId: string, params?: { page?: number; limit?: number; type?: string }) {
  return useQuery({
    queryKey: vendorLedgerKeys.byVendor(vendorId, params),
    queryFn:  () => vendorLedgerApi.listByVendor(vendorId, params).then((r) => r.data),
    enabled:  !!vendorId,
    staleTime: 30_000,
  })
}

export interface AddVendorEntryPayload {
  vendor_id:    string
  type:         VendorEntryType
  amount:       number
  notes?:       string
  purchase_id?: string
}

export function useVendorLedgerAging() {
  const isAdmin = useIsAdmin()
  return useQuery({
    queryKey: vendorLedgerKeys.aging(),
    queryFn: () => vendorLedgerApi.aging().then(r => r.data.data),
    enabled: isAdmin,
    staleTime: 10 * 60 * 1000,
  })
}

export function useAddVendorEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: AddVendorEntryPayload) => vendorLedgerApi.addEntry(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: vendorLedgerKeys.all })
      qc.invalidateQueries({ queryKey: ['vendors'] })  // payable_balance on vendor changes
      toast.success('Vendor ledger entry recorded')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}
