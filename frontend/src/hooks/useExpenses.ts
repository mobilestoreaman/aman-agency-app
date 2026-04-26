import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { expensesApi } from '@/api/expenses'
import { getApiError } from '@/utils/error'
import { reportKeys } from './useReports'
import type { ExpenseCategory } from '@/types'

export const expenseKeys = {
  all:     ['expenses'] as const,
  list:    (p?: object) => [...expenseKeys.all, 'list', p] as const,
  detail:  (id: string) => [...expenseKeys.all, 'detail', id] as const,
  summary: (p?: object) => [...expenseKeys.all, 'summary', p] as const,
}

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  rent:          'Rent',
  salary:        'Salary',
  utilities:     'Utilities',
  maintenance:   'Maintenance',
  marketing:     'Marketing',
  miscellaneous: 'Miscellaneous',
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'rent', 'salary', 'utilities', 'maintenance', 'marketing', 'miscellaneous',
]

interface ExpenseParams {
  page?:      number
  limit?: number
  category?:  ExpenseCategory | ''
  from?:      string
  to?:        string
}

export function useExpenses(params?: ExpenseParams) {
  return useQuery({
    queryKey: expenseKeys.list(params),
    queryFn:  () => expensesApi.list(params).then((r) => r.data),
    staleTime: 30_000,
  })
}

export function useExpenseSummary(params?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: expenseKeys.summary(params),
    queryFn:  () => expensesApi.summary(params).then((r) => r.data.data),
    staleTime: 30_000,
  })
}

export function useCreateExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof expensesApi.create>[0]) =>
      expensesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: expenseKeys.all })
      qc.invalidateQueries({ queryKey: reportKeys.all })
      toast.success('Expense recorded')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useUpdateExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Parameters<typeof expensesApi.update>[1]) =>
      expensesApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: expenseKeys.all })
      qc.invalidateQueries({ queryKey: reportKeys.all })
      toast.success('Expense updated')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useDeleteExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => expensesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: expenseKeys.all })
      qc.invalidateQueries({ queryKey: reportKeys.all })
      toast.success('Expense deleted')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}
