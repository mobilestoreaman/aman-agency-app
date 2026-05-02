import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, TrendingDown, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from '@/components/ui/form'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAddVendorEntry } from '@/hooks/useVendorLedger'
import { formatCurrency } from '@/utils/currency'

/** Build a schema that captures payableBalance so the payment cap is enforced client-side. */
function buildSchema(payableBalance: number) {
  return z.object({
    vendor_id:  z.string().min(1, 'Vendor is required'),
    type:       z.enum(['payment', 'adjustment', 'opening_balance']),
    amount:     z.coerce.number().min(0.01, 'Amount must be greater than 0'),
    notes:      z.string().max(500).optional().or(z.literal('')),
  }).superRefine((data, ctx) => {
    if (data.type === 'payment') {
      if (payableBalance <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'This vendor has no outstanding balance to pay',
          path: ['amount'],
        })
      } else if (data.amount > payableBalance) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Payment cannot exceed outstanding balance of ${formatCurrency(payableBalance)}`,
          path: ['amount'],
        })
      }
    }
    // Notes are required for adjustments and opening balances (audit trail).
    if ((data.type === 'adjustment' || data.type === 'opening_balance') && !data.notes?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: data.type === 'opening_balance'
          ? 'Describe the source of this opening balance (e.g. "Purchases from Jan–Mar 2024")'
          : 'Notes are required for adjustments',
        path: ['notes'],
      })
    }
  })
}
type FormValues = z.infer<ReturnType<typeof buildSchema>>

interface Props {
  open:         boolean
  onClose:      () => void
  /** Pre-select (and lock) this vendor when set. */
  vendorId:     string
  vendorName?:  string
  /** Current outstanding payable balance of the vendor. */
  payableBalance?: number
  /** Open in payment, adjustment, or opening_balance mode. Defaults to 'payment'. */
  defaultType?: 'payment' | 'adjustment' | 'opening_balance'
}

export default function VendorLedgerEntryModal({
  open, onClose, vendorId, vendorName, payableBalance = 0, defaultType = 'payment',
}: Props) {
  const addEntry  = useAddVendorEntry()
  const isPending = addEntry.isPending

  // Rebuild resolver whenever payableBalance changes so the cap stays current.
  const schema = useMemo(() => buildSchema(payableBalance), [payableBalance])

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      vendor_id: vendorId,
      type:      defaultType,
      amount:    0,
      notes:     '',
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        vendor_id: vendorId,
        type:      defaultType,
        amount:    0,
        notes:     '',
      })
    }
  }, [open, vendorId, defaultType, form])

  const watchType         = form.watch('type')
  const isPaymentMode     = watchType === 'payment'
  const isOpeningBalance  = watchType === 'opening_balance'
  const noBalanceToPay    = isPaymentMode && payableBalance <= 0

  const onSubmit = (values: FormValues) => {
    addEntry.mutate(
      {
        vendor_id: values.vendor_id,
        type:      values.type,
        amount:    values.amount,
        notes:     values.notes || undefined,
      },
      { onSuccess: () => { form.reset(); onClose() } },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-md">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {isPaymentMode
              ? 'Record Payment to Vendor'
              : isOpeningBalance
              ? 'Set Opening Balance'
              : 'Manual Balance Adjustment'}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-1">
        <Form {...form}>
          <form id="vendor-entry-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 p-1">

            {/* Vendor display */}
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Vendor: </span>
              <span className="font-medium">{vendorName ?? vendorId}</span>
            </div>

            {/* Outstanding payable callout */}
            <div className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
              payableBalance > 0
                ? 'border-warning/30 bg-warning/10'
                : 'border-border bg-muted/40'
            }`}>
              <span className={payableBalance > 0 ? 'text-warning' : 'text-muted-foreground'}>
                Outstanding payable
              </span>
              <span className={`font-mono font-semibold ${
                payableBalance > 0 ? 'text-warning' : 'text-success'
              }`}>
                {payableBalance > 0 ? formatCurrency(payableBalance) : 'Nil'}
              </span>
            </div>

            {/* Type toggle */}
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Entry type <span className="text-destructive">*</span></FormLabel>
                  <div className="flex gap-2">
                    {([
                      { value: 'payment',         label: '↓ Payment made' },
                      // Opening balance is only shown when the modal was launched
                      // via the "Set balance" button (defaultType === 'opening_balance').
                      // It must never appear when opened via the Pay button.
                      ...(defaultType === 'opening_balance'
                        ? [{ value: 'opening_balance' as const, label: '⊕ Opening balance' }]
                        : []),
                      { value: 'adjustment',       label: '± Adjustment' },
                    ] as const).map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => field.onChange(t.value)}
                        className={`flex-1 rounded-md border px-2 py-2 text-xs font-medium transition-colors ${
                          field.value === t.value
                            ? t.value === 'payment'
                              ? 'border-success bg-success text-white'
                              : t.value === 'opening_balance'
                              ? 'border-info bg-info text-white'
                              : 'border-destructive bg-destructive text-destructive-foreground'
                            : 'border-input bg-background hover:bg-accent'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <FormDescription className="text-xs">
                    {isPaymentMode
                      ? 'We paid the vendor — reduces the outstanding payable balance.'
                      : isOpeningBalance
                      ? 'Record a pre-existing debt owed before this system was set up.'
                      : 'Manually correct the balance (positive = we owe more, negative = credit/discount).'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* No-balance warning — shown when trying to pay a fully settled vendor */}
            {noBalanceToPay && (
              <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                <AlertCircle className="h-4 w-4 shrink-0" />
                This vendor has no outstanding balance — nothing to pay.
              </div>
            )}

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
                    {/* Pay-full shortcut — only in payment mode with positive balance */}
                    {isPaymentMode && payableBalance > 0 && (
                      <button
                        type="button"
                        className="flex items-center gap-1 rounded-md bg-success/10 px-2 py-0.5 text-xs font-medium text-success hover:bg-success/20"
                        onClick={() => form.setValue('amount', payableBalance, { shouldValidate: true })}
                      >
                        <TrendingDown className="h-3 w-3" />
                        Pay full {formatCurrency(payableBalance)}
                      </button>
                    )}
                  </div>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      min={0.01}
                      max={isPaymentMode && payableBalance > 0 ? payableBalance : undefined}
                      step="0.01"
                      disabled={isPending || noBalanceToPay}
                      autoFocus
                    />
                  </FormControl>
                  {isPaymentMode && payableBalance > 0 && (
                    <FormDescription className="text-xs">
                      Maximum payable: {formatCurrency(payableBalance)}
                    </FormDescription>
                  )}
                  {isOpeningBalance && (
                    <FormDescription className="text-xs">
                      Enter the total amount owed to this vendor before today.
                    </FormDescription>
                  )}
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
                  <FormLabel>
                    Notes
                    {(watchType === 'adjustment' || watchType === 'opening_balance')
                      ? <span className="text-destructive"> *</span>
                      : <span className="text-muted-foreground text-xs"> (optional)</span>
                    }
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={2}
                      placeholder={
                        isOpeningBalance
                          ? 'e.g. "Purchases on credit from Jan–Mar 2024"'
                          : watchType === 'adjustment'
                          ? 'Reason for adjustment…'
                          : 'Payment reference…'
                      }
                      disabled={isPending}
                    />
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
          <Button type="submit" form="vendor-entry-form" disabled={isPending || noBalanceToPay}>
            {isPending && <Loader2 className="animate-spin" />}
            {isPaymentMode ? 'Record payment' : isOpeningBalance ? 'Set opening balance' : 'Record adjustment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
