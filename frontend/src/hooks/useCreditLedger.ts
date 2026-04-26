import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { salesApi } from '@/api/sales'
import { getApiError } from '@/utils/error'

export const creditKeys = {
  all:     ['credit-ledger'] as const,
  list:    (p?: object) => [...creditKeys.all, 'list', p] as const,
  summary: (customerId: string) => [...creditKeys.all, 'summary', customerId] as const,
}

// Form-level entry type (maps to different API endpoints):
//   'payment'    → POST /customers/:id/payments    (reduces balance)
//   'adjustment' → POST /customers/:id/adjustments (admin: manual balance change)
export type CreditEntryType = 'adjustment' | 'payment'

export const ENTRY_TYPE_LABELS: Record<CreditEntryType, string> = {
  adjustment: 'Credit (owed)',
  payment:    'Payment received',
}

interface LedgerParams {
  page?:        number
  limit?:       number
  customer_id?: string
  from_date?:   string  // DD-MM-YYYY
  to_date?:     string  // DD-MM-YYYY
  search?:      string  // regex on customer_name or reference
}

export function useCreditLedger(params?: LedgerParams) {
  return useQuery({
    queryKey: creditKeys.list(params),
    queryFn:  () => salesApi.creditLedger(params).then((r) => r.data),
    staleTime: 30_000,
  })
}

export interface AddCreditEntryPayload {
  customer_id: string
  type:        CreditEntryType
  amount:      number
  notes?:      string
  sale_id?:    string
}

export function useAddCreditEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: AddCreditEntryPayload) => salesApi.addCreditEntry(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: creditKeys.all })
      qc.invalidateQueries({ queryKey: ['customers'] })  // credit_balance on customer changes
      toast.success('Credit entry recorded')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}
