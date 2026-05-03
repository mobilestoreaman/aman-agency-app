import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { loanReferencesApi } from '@/api/loanReferences'
import { getApiError } from '@/utils/error'
import type { LoanProvider, LoanStatus } from '@/types'

export const loanKeys = {
  all:    ['loan-references'] as const,
  list:   (p?: object) => [...loanKeys.all, 'list', p] as const,
  detail: (id: string) => [...loanKeys.all, 'detail', id] as const,
}

export const LOAN_PROVIDERS: LoanProvider[] = [
  'bajaj', 'tata_capital', 'hdb_financial', 'home_credit',
  'hdfc', 'icici', 'axis', 'idfc', 'tvs_credit', 'other',
]

export const PROVIDER_LABELS: Record<LoanProvider, string> = {
  bajaj:         'Bajaj Finserv',
  tata_capital:  'Tata Capital',
  hdb_financial: 'HDB Financial',
  home_credit:   'Home Credit',
  hdfc:          'HDFC Bank',
  icici:         'ICICI Bank',
  axis:          'Axis Bank',
  idfc:          'IDFC First',
  tvs_credit:    'TVS Credit',
  other:         'Other',
}

export const LOAN_STATUSES: LoanStatus[] = ['active', 'closed', 'overdue']

export const LOAN_STATUS_LABELS: Record<LoanStatus, string> = {
  active:  'Active',
  closed:  'Closed',
  overdue: 'Overdue',
}

interface LoanParams {
  page?:      number
  limit?: number
  search?:    string
  status?:    LoanStatus
  provider?:  LoanProvider
}

export function useLoanReferences(params?: LoanParams) {
  return useQuery({
    queryKey:  loanKeys.list(params),
    queryFn:   () => loanReferencesApi.list(params).then((r) => r.data),
    staleTime: 60_000,
  })
}

export function useLoanReference(id: string) {
  return useQuery({
    queryKey: loanKeys.detail(id),
    queryFn:  () => loanReferencesApi.get(id).then((r) => r.data.data),
    enabled:  !!id,
  })
}

export interface CreateLoanPayload {
  customer_id:         string
  sale_id?:            string
  provider:            LoanProvider
  loan_account_number: string
  loan_amount:         number
  emi_amount?:         number
  tenure_months?:      number
  disbursed_date?:     string
  notes?:              string
}

export function useCreateLoanReference() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateLoanPayload) => loanReferencesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: loanKeys.all })
      toast.success('Loan reference added')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useUpdateLoanReference() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<CreateLoanPayload> & { id: string }) =>
      loanReferencesApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: loanKeys.all })
      toast.success('Loan reference updated')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useChangeLoanStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: LoanStatus }) =>
      loanReferencesApi.changeStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: loanKeys.all })
      toast.success('Loan status updated')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useDeleteLoanReference() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => loanReferencesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: loanKeys.all })
      toast.success('Loan reference deleted')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}
