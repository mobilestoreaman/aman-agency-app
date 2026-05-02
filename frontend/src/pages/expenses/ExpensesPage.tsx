import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import {
  Plus, Pencil, Trash2, Search, Wallet, Loader2,
  TrendingDown, ReceiptText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { ResponsiveTable, type Column } from '@/components/shared/ResponsiveTable'
import PageHeader from '@/components/shared/PageHeader'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import {
  useExpenses, useCreateExpense, useUpdateExpense, useDeleteExpense,
  useExpenseSummary, EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS,
} from '@/hooks/useExpenses'
import { useIsAdmin } from '@/store/authStore'
import { useDebounce } from '@/hooks/useDebounce'
import { formatCurrency } from '@/utils/currency'
import { formatDate, toApiDate } from '@/utils/date'
import type { Expense, ExpenseCategory } from '@/types'

// ── Colour map for category badges ───────────────────────────────────────────
const CATEGORY_VARIANT: Record<ExpenseCategory, string> = {
  rent:          'bg-violet-100 text-violet-800',
  salary:        'bg-blue-100 text-blue-800',
  utilities:     'bg-cyan-100 text-cyan-800',
  maintenance:   'bg-amber-100 text-amber-800',
  marketing:     'bg-pink-100 text-pink-800',
  miscellaneous: 'bg-slate-100 text-slate-700',
}

// ── Zod schema ────────────────────────────────────────────────────────────────
const schema = z.object({
  category:    z.enum(['rent', 'salary', 'utilities', 'maintenance', 'marketing', 'miscellaneous']),
  amount:      z.coerce.number().min(0.01, 'Amount must be > 0').max(10_000_000, 'Amount seems unrealistically large'),
  description: z.string().min(1, 'Description is required').max(200),
  date:        z.string().min(1, 'Date is required'),
  notes:       z.string().max(500).optional().or(z.literal('')),
})
type FormValues = z.infer<typeof schema>

function todayValue() { return format(new Date(), 'yyyy-MM-dd') }
// Backend stores expense dates as UTC midnight of the IST calendar day
// (IST = UTC+5:30). Adding 330 min recovers the original IST date for
// pre-filling the HTML date input (which expects YYYY-MM-DD).
function isoToInputDate(iso: string): string {
  if (!iso) return ''
  const utcMs = new Date(iso).getTime()
  const istDate = new Date(utcMs + 330 * 60 * 1000)   // shift to IST
  return istDate.toISOString().split('T')[0]            // YYYY-MM-DD
}

// ── Form modal ────────────────────────────────────────────────────────────────
function ExpenseFormModal({ open, onClose, expense }: {
  open: boolean; onClose: () => void; expense: Expense | null
}) {
  const isEdit = !!expense
  const create = useCreateExpense()
  const update = useUpdateExpense()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      category:    expense?.category ?? 'miscellaneous',
      amount:      expense?.amount ?? 0,
      description: expense?.description ?? '',
      date:        expense ? isoToInputDate(expense.date) : todayValue(),
      notes:       expense?.notes ?? '',
    },
  })

  // Reset form whenever the dialog opens or the target expense changes
  useEffect(() => {
    if (open) {
      form.reset({
        category:    expense?.category ?? 'miscellaneous',
        amount:      expense?.amount ?? 0,
        description: expense?.description ?? '',
        date:        expense ? isoToInputDate(expense.date) : todayValue(),
        notes:       expense?.notes ?? '',
      })
    }
  }, [open, expense]) // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = (values: FormValues) => {
    const payload = { ...values, date: toApiDate(values.date) ?? values.date }
    if (isEdit && expense) {
      update.mutate(
        { id: expense.id, ...payload },
        { onSuccess: onClose },
      )
    } else {
      create.mutate(payload, { onSuccess: onClose })
    }
  }

  const isPending = create.isPending || update.isPending

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Expense' : 'Record Expense'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="category" render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="amount" render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount (₹)</FormLabel>
                  <FormControl>
                    <Input type="number" min={0.01} step="0.01" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Input placeholder="Brief description" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="date" render={({ field }) => (
              <FormItem>
                <FormLabel>Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notes <span className="text-muted-foreground">(optional)</span></FormLabel>
                <FormControl>
                  <Textarea rows={2} placeholder="Additional notes…" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? 'Save changes' : 'Record expense'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ExpensesPage() {
  const isAdmin = useIsAdmin()

  const [page, setPage]             = useState(1)
  const [search, setSearch]         = useState('')
  const [categoryFilter, setCategory] = useState<ExpenseCategory | ''>('')
  const [fromDate, setFromDate]     = useState('')
  const [toDate, setToDate]         = useState('')
  const [formOpen, setFormOpen]     = useState(false)
  const [editing, setEditing]       = useState<Expense | null>(null)
  const [deleting, setDeleting]     = useState<Expense | null>(null)

  const q = useDebounce(search)

  const { data, isLoading } = useExpenses({
    page,
    limit:    15,
    category: (categoryFilter as ExpenseCategory) || undefined,
    search:   q || undefined,
    from:     fromDate ? toApiDate(fromDate) : undefined,
    to:       toDate   ? toApiDate(toDate)   : undefined,
  })

  const { data: summary } = useExpenseSummary({
    from: fromDate ? toApiDate(fromDate) : undefined,
    to:   toDate   ? toApiDate(toDate)   : undefined,
  })

  const deleteExpense = useDeleteExpense()

  const openCreate = () => { setEditing(null); setFormOpen(true) }
  const openEdit   = (e: Expense) => { setEditing(e); setFormOpen(true) }

  const handleDelete = () => {
    if (!deleting) return
    deleteExpense.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
  }

  const clearFilters = () => {
    setSearch(''); setCategory(''); setFromDate(''); setToDate(''); setPage(1)
  }
  const hasFilters = !!search || !!categoryFilter || !!fromDate || !!toDate

  const columns: Column<Expense>[] = [
    {
      key:    'description',
      header: 'Description',
      cell:   (e) => (
        <div>
          <p className="text-sm font-medium">{e.description}</p>
          {e.notes && (
            <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">{e.notes}</p>
          )}
        </div>
      ),
      sortValue: (e) => e.description,
    },
    {
      key:    'category',
      header: 'Category',
      cell:   (e) => (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_VARIANT[e.category]}`}>
          {EXPENSE_CATEGORY_LABELS[e.category]}
        </span>
      ),
      sortValue: (e) => e.category,
    },
    {
      key:    'amount',
      header: 'Amount',
      cell:   (e) => (
        <span className="font-mono font-semibold text-sm">{formatCurrency(e.amount)}</span>
      ),
      sortValue: (e) => e.amount,
    },
    {
      key:    'date',
      header: 'Date',
      cell:   (e) => (
        <span className="text-sm text-muted-foreground">{formatDate(e.date)}</span>
      ),
      className: 'hidden md:table-cell',
      sortValue: (e) => e.date,
    },
    {
      key:    'actions',
      header: '',
      cell:   (e) => (
        <div className="flex items-center justify-end gap-1">
          {isAdmin && (
            <>
              <Button
                variant="ghost" size="icon" className="h-8 w-8"
                onClick={() => openEdit(e)} aria-label="Edit"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost" size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => setDeleting(e)} aria-label="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      ),
      className: 'w-20 whitespace-nowrap',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Expenses"
        description="Track store operating costs — rent, salary, utilities, and more."
        action={
          isAdmin && (
            <Button onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" /> Record Expense
            </Button>
          )
        }
      />

      {/* Summary chips */}
      {summary && (
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-4 py-2.5 text-sm">
            <TrendingDown className="h-4 w-4 text-rose-500" />
            <span className="text-muted-foreground">Total expenses:</span>
            <span className="font-semibold text-rose-600">{formatCurrency(summary.total_amount)}</span>
            <span className="text-xs text-muted-foreground">({summary.total_count} records)</span>
          </div>
          {summary.by_category?.map((bc) => (
            <div
              key={bc.category}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${CATEGORY_VARIANT[bc.category as ExpenseCategory]}`}
            >
              <ReceiptText className="h-3 w-3" />
              {EXPENSE_CATEGORY_LABELS[bc.category as ExpenseCategory]}: {formatCurrency(bc.amount)}
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-0 flex-1 basis-40">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search description…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>

        <Select value={categoryFilter} onValueChange={(v) => { setCategory((v === 'all' ? '' : v) as ExpenseCategory | ''); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {EXPENSE_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Input
            type="date" value={fromDate}
            max={toDate || undefined}
            onChange={(e) => { setFromDate(e.target.value); setPage(1) }}
            className="flex-1 sm:w-[140px] sm:flex-none" title="From date"
          />
          <span className="shrink-0 text-muted-foreground">–</span>
          <Input
            type="date" value={toDate}
            min={fromDate || undefined}
            onChange={(e) => { setToDate(e.target.value); setPage(1) }}
            className="flex-1 sm:w-[140px] sm:flex-none" title="To date"
          />
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
            Clear
          </Button>
        )}
      </div>

      <ResponsiveTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        emptyMessage="No expenses recorded. Start by adding your first entry."
        mobileCard={{
          top:    ['description', 'category'],
          middle: ['amount'],
          bottom: ['date'],
          actions: 'actions',
        }}
      />

      <ExpenseFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        expense={editing}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        isPending={deleteExpense.isPending}
        title={`Delete expense: "${deleting?.description}"?`}
        description="This expense record will be permanently removed."
        confirmLabel="Delete"
        variant="destructive"
      />
    </div>
  )
}
