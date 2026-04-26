import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, TrendingDown, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from '@/components/ui/form'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useCustomers } from '@/hooks/useCustomers'
import { useSales } from '@/hooks/useSales'
import { useAddCreditEntry } from '@/hooks/useCreditLedger'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/date'

const schema = z.object({
  customer_id: z.string().min(1, 'Customer is required'),
  type:        z.enum(['adjustment', 'payment']),
  amount:      z.coerce.number().min(0.01, 'Amount must be > 0'),
  sale_id:     z.string().optional(),
  notes:       z.string().max(300).optional().or(z.literal('')),
})
type FormValues = z.infer<typeof schema>

interface Props {
  open:         boolean
  onClose:      () => void
  /** Pre-select (and lock) this customer when set. */
  customerId?:  string
  /** Open in payment or credit-given mode. Defaults to 'payment'. */
  defaultType?: 'payment' | 'adjustment'
}

export default function CreditEntryModal({
  open, onClose, customerId, defaultType = 'payment',
}: Props) {
  const addEntry  = useAddCreditEntry()
  const isPending = addEntry.isPending

  const { data: customersData } = useCustomers({ limit: 200 })
  const customers = customersData?.data ?? []

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customer_id: customerId ?? '',
      type:        defaultType,
      amount:      0,
      sale_id:     '',
      notes:       '',
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        customer_id: customerId ?? '',
        type:        defaultType,
        amount:      0,
        sale_id:     '',
        notes:       '',
      })
    }
  }, [open, customerId, defaultType, form])

  const watchType       = form.watch('type')
  const watchCustomerId = form.watch('customer_id')

  // Find the selected customer to display their live balance.
  const selectedCustomer = customers.find((c) => c.id === watchCustomerId)
  const outstanding      = selectedCustomer?.credit_balance ?? 0

  // Fetch this customer's completed sales with an outstanding balance
  // so the user can optionally link the payment to a specific invoice.
  const { data: salesData } = useSales(
    watchType === 'payment' && watchCustomerId
      ? { customer_id: watchCustomerId, status: 'completed', limit: 100 }
      : undefined,
  )
  const customerSales = (salesData?.data ?? []).filter((s) => (s.balance ?? 0) > 0)

  const onSubmit = (values: FormValues) => {
    // Client-side guard: payment cannot exceed the customer's outstanding balance.
    if (values.type === 'payment' && outstanding > 0 && values.amount > outstanding) {
      form.setError('amount', {
        message: `Payment (${formatCurrency(values.amount)}) exceeds outstanding balance (${formatCurrency(outstanding)})`,
      })
      return
    }
    addEntry.mutate(
      {
        customer_id: values.customer_id,
        type:        values.type,
        amount:      values.amount,
        notes:       values.notes || undefined,
        ...(values.type === 'payment' && values.sale_id ? { sale_id: values.sale_id } : {}),
      },
      { onSuccess: () => { form.reset(); onClose() } },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-md">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {watchType === 'payment' ? 'Record Payment' : 'Add Credit Entry'}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-1">
        <Form {...form}>
          <form id="credit-entry-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 p-1">

            {/* Customer */}
            <FormField
              control={form.control}
              name="customer_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer <span className="text-destructive">*</span></FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={!!customerId || isPending}
                  >
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                          {c.credit_balance > 0 && (
                            <span className="ml-2 text-xs text-destructive">
                              {formatCurrency(c.credit_balance)} owed
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Outstanding balance callout */}
            {selectedCustomer && (
              <div className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
                outstanding > 0
                  ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20'
                  : 'border-border bg-muted/40'
              }`}>
                <span className={outstanding > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}>
                  Outstanding balance
                </span>
                <span className={`font-mono font-semibold ${
                  outstanding > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-600'
                }`}>
                  {outstanding > 0 ? formatCurrency(outstanding) : 'Nil'}
                </span>
              </div>
            )}

            {/* Link to invoice — only shown when recording a payment for a customer with outstanding invoices */}
            {watchType === 'payment' && watchCustomerId && customerSales.length > 0 && (
              <FormField
                control={form.control}
                name="sale_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">
                      <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                      Link to Invoice
                      <span className="text-muted-foreground text-xs font-normal">(optional)</span>
                    </FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}
                      value={field.value || 'none'}
                      disabled={isPending}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select invoice…" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">
                          <span className="text-muted-foreground">— No specific invoice —</span>
                        </SelectItem>
                        {customerSales.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            <span className="font-mono">{s.invoice_number}</span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              bal: {formatCurrency(s.balance)} · {formatDate(s.sold_at)}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs">
                      Associates this payment with a specific sale in the ledger.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Type toggle */}
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Entry type <span className="text-destructive">*</span></FormLabel>
                  <div className="flex gap-2">
                    {(['payment', 'adjustment'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => field.onChange(t)}
                        className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                          field.value === t
                            ? t === 'payment'
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                              : 'border-destructive bg-destructive text-destructive-foreground'
                            : 'border-input bg-background hover:bg-accent'
                        }`}
                      >
                        {t === 'payment' ? '↓ Payment received' : '↑ Credit given'}
                      </button>
                    ))}
                  </div>
                  <FormDescription className="text-xs">
                    {watchType === 'payment'
                      ? 'Customer is paying off their outstanding balance.'
                      : 'Customer is taking goods/services on credit — balance increases.'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Amount */}
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>
                      Amount (₹) <span className="text-destructive">*</span>
                    </FormLabel>
                    {/* Pay-full shortcut — only when in payment mode and balance is positive */}
                    {watchType === 'payment' && outstanding > 0 && (
                      <button
                        type="button"
                        className="flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/50"
                        onClick={() => form.setValue('amount', outstanding, { shouldValidate: true })}
                      >
                        <TrendingDown className="h-3 w-3" />
                        Pay full {formatCurrency(outstanding)}
                      </button>
                    )}
                  </div>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      min={0.01}
                      step="0.01"
                      disabled={isPending}
                      autoFocus
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} placeholder="Reason or reference…" disabled={isPending} />
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
          <Button type="submit" form="credit-entry-form" disabled={isPending}>
            {isPending && <Loader2 className="animate-spin" />}
            {watchType === 'payment' ? 'Record payment' : 'Record entry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
