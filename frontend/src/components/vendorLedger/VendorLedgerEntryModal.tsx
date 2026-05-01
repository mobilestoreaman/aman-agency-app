import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, TrendingDown } from 'lucide-react'
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

const schema = z.object({
  vendor_id:  z.string().min(1, 'Vendor is required'),
  type:       z.enum(['payment', 'adjustment']),
  amount:     z.coerce.number().min(0.01, 'Amount must be > 0'),
  notes:      z.string().max(300).optional().or(z.literal('')),
}).superRefine((data, ctx) => {
  // Backend requires notes for manual adjustments (audit trail).
  if (data.type === 'adjustment' && !data.notes?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Notes are required for adjustments',
      path: ['notes'],
    })
  }
})
type FormValues = z.infer<typeof schema>

interface Props {
  open:         boolean
  onClose:      () => void
  /** Pre-select (and lock) this vendor when set. */
  vendorId:     string
  vendorName?:  string
  /** Current outstanding payable balance of the vendor. */
  payableBalance?: number
  /** Open in payment or adjustment mode. Defaults to 'payment'. */
  defaultType?: 'payment' | 'adjustment'
}

export default function VendorLedgerEntryModal({
  open, onClose, vendorId, vendorName, payableBalance = 0, defaultType = 'payment',
}: Props) {
  const addEntry  = useAddVendorEntry()
  const isPending = addEntry.isPending

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

  const watchType = form.watch('type')

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
            {watchType === 'payment' ? 'Record Payment to Vendor' : 'Manual Balance Adjustment'}
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
                ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20'
                : 'border-border bg-muted/40'
            }`}>
              <span className={payableBalance > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}>
                Outstanding payable
              </span>
              <span className={`font-mono font-semibold ${
                payableBalance > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-600'
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
                        {t === 'payment' ? '↓ Payment made' : '± Adjustment'}
                      </button>
                    ))}
                  </div>
                  <FormDescription className="text-xs">
                    {watchType === 'payment'
                      ? 'We paid the vendor — reduces the outstanding payable balance.'
                      : 'Manually correct the balance (positive = we owe more, negative = credit/discount).'}
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
                    {/* Pay-full shortcut — only in payment mode with positive balance */}
                    {watchType === 'payment' && payableBalance > 0 && (
                      <button
                        type="button"
                        className="flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/50"
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
                      min={watchType === 'payment' ? 0.01 : undefined}
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
                  <FormLabel>
                    Notes
                    {watchType === 'adjustment'
                      ? <span className="text-destructive"> *</span>
                      : <span className="text-muted-foreground text-xs"> (optional)</span>
                    }
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={2}
                      placeholder={watchType === 'adjustment' ? 'Reason for adjustment…' : 'Payment reference…'}
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
          <Button type="submit" form="vendor-entry-form" disabled={isPending}>
            {isPending && <Loader2 className="animate-spin" />}
            {watchType === 'payment' ? 'Record payment' : 'Record adjustment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
