import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useCustomers } from '@/hooks/useCustomers'
import { useSales } from '@/hooks/useSales'
import {
  useCreateLoanReference, useUpdateLoanReference,
  LOAN_PROVIDERS, PROVIDER_LABELS,
} from '@/hooks/useLoanReferences'
import { toApiDate } from '@/utils/date'
import type { LoanReference } from '@/types'

const schema = z.object({
  customer_id:         z.string().min(1, 'Customer is required'),
  sale_id:             z.string().optional().or(z.literal('')),
  provider:            z.enum(['bajaj', 'hdfc', 'icici', 'axis', 'idfc', 'tvs_credit', 'other']),
  loan_account_number: z.string().min(1, 'Loan account number is required').max(60),
  loan_amount:         z.coerce.number().min(1, 'Loan amount must be > 0'),
  emi_amount:          z.coerce.number().min(0.01, 'EMI amount must be greater than 0').optional(),
  tenure_months:       z.coerce.number().int().min(1).max(120).optional(),
  disbursed_date:      z.string().optional().or(z.literal('')),
  notes:               z.string().max(500).optional().or(z.literal('')),
})
type FormValues = z.infer<typeof schema>


// Backend returns disbursed_date as ISO 8601. Convert to YYYY-MM-DD for the
// HTML date input (which expects YYYY-MM-DD), adding 330 min to recover IST.
function fromApiDate(d?: string) {
  if (!d) return ''
  if (d.includes('T') || d.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const utcMs = new Date(d).getTime()
    if (isNaN(utcMs)) return ''
    const istDate = new Date(utcMs + 330 * 60 * 1000)
    return istDate.toISOString().split('T')[0]
  }
  // Fallback: DD-MM-YYYY → YYYY-MM-DD
  const [day, m, y] = d.split('-')
  return `${y}-${m}-${day}`
}

interface Props {
  open:      boolean
  onClose:   () => void
  loanRef?:  LoanReference | null
}

export default function LoanReferenceFormModal({ open, onClose, loanRef }: Props) {
  const isEdit    = !!loanRef
  const create    = useCreateLoanReference()
  const update    = useUpdateLoanReference()
  const isPending = create.isPending || update.isPending

  const { data: customersData } = useCustomers({ limit: 200 })
  const customers = customersData?.data ?? []

  const { data: salesData } = useSales({ limit: 200, status: 'completed' })
  const sales = salesData?.data ?? []

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customer_id: '', sale_id: '', provider: 'bajaj',
      loan_account_number: '', loan_amount: undefined,
      emi_amount: undefined, tenure_months: undefined,
      disbursed_date: '', notes: '',
    },
  })

  useEffect(() => {
    if (loanRef) {
      form.reset({
        customer_id:         loanRef.customer_id,
        sale_id:             loanRef.sale_id         ?? '',
        provider:            loanRef.provider,
        loan_account_number: loanRef.loan_account_number,
        loan_amount:         loanRef.loan_amount,
        emi_amount:          loanRef.emi_amount       ?? undefined,
        tenure_months:       loanRef.tenure_months    ?? undefined,
        disbursed_date:      fromApiDate(loanRef.disbursed_date),
        notes:               loanRef.notes            ?? '',
      })
    } else {
      form.reset({
        customer_id: '', sale_id: '', provider: 'bajaj',
        loan_account_number: '', loan_amount: undefined,
        emi_amount: undefined, tenure_months: undefined,
        disbursed_date: '', notes: '',
      })
    }
  }, [loanRef, form])

  const onSubmit = (values: FormValues) => {
    const payload = {
      customer_id:         values.customer_id,
      sale_id:             values.sale_id             || undefined,
      provider:            values.provider,
      loan_account_number: values.loan_account_number,
      loan_amount:         values.loan_amount,
      emi_amount:          values.emi_amount           || undefined,
      tenure_months:       values.tenure_months        || undefined,
      disbursed_date:      toApiDate(values.disbursed_date ?? ''),
      notes:               values.notes               || undefined,
    }

    const mutation = isEdit
      ? update.mutateAsync({ id: loanRef!.id, ...payload })
      : create.mutateAsync(payload)

    mutation.then(() => { form.reset(); onClose() })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>{isEdit ? 'Edit Loan Reference' : 'Add Loan Reference'}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-1">
          <Form {...form}>
            <form id="loan-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 p-1">

              {/* Customer + Sale */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="customer_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer <span className="text-destructive">*</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {customers.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sale_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Linked sale <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ''}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">— None —</SelectItem>
                          {sales.map((s) => (
                            <SelectItem key={s.id} value={s.id}>#{s.invoice_number} · {s.customer_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Provider + Account number */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="provider"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Finance provider <span className="text-destructive">*</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {LOAN_PROVIDERS.map((p) => (
                            <SelectItem key={p} value={p}>{PROVIDER_LABELS[p]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="loan_account_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Loan account no. <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. BFL123456789" disabled={isPending} className="font-mono" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Loan amount + EMI */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="loan_amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Loan amount (₹) <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input {...field} type="number" min={1} step="0.01" disabled={isPending} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="emi_amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>EMI (₹) <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ''}
                          type="number" min={0.01} step="0.01"
                          disabled={isPending}
                          placeholder="Monthly EMI"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Tenure + Disbursed date */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="tenure_months"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tenure (months) <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ''}
                          type="number" min={1} max={120} step={1}
                          disabled={isPending}
                          placeholder="e.g. 12"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="disbursed_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Disbursed date <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                      <FormControl>
                        <Input {...field} type="date" disabled={isPending} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Notes */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={2} placeholder="Any additional notes…" disabled={isPending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </ScrollArea>

        <DialogFooter className="shrink-0 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" form="loan-form" disabled={isPending}>
            {isPending && <Loader2 className="animate-spin" />}
            {isEdit ? 'Save changes' : 'Add loan reference'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
