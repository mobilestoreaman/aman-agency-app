import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, RotateCcw, Banknote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from '@/components/ui/form'
import { Separator } from '@/components/ui/separator'
import { useMarkReturned } from '@/hooks/useBorrowLends'
import { formatCurrency } from '@/utils/currency'
import type { BorrowLend, BorrowLendResolution } from '@/types'

// ── Schema — payment amount only required when resolution = 'payment' ────────
const schema = z.discriminatedUnion('resolution_type', [
  z.object({
    resolution_type:   z.literal('device'),
    settlement_amount: z.number().optional(),
    notes:             z.string().max(300).optional().or(z.literal('')),
  }),
  z.object({
    resolution_type:   z.literal('payment'),
    settlement_amount: z.coerce.number().min(0.01, 'Settlement amount is required'),
    notes:             z.string().max(300).optional().or(z.literal('')),
  }),
])
type FormValues = z.infer<typeof schema>

interface Props {
  open:    boolean
  onClose: () => void
  entry:   BorrowLend | null
}

export default function ReturnSettleModal({ open, onClose, entry }: Props) {
  const markReturned = useMarkReturned()
  const isPending    = markReturned.isPending

  const [resolution, setResolution] = useState<BorrowLendResolution>('device')

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { resolution_type: 'device', notes: '' },
  })

  // Reset every time the modal opens
  useEffect(() => {
    if (open) {
      setResolution('device')
      form.reset({ resolution_type: 'device', notes: '' })
    }
  }, [open, form])

  // Keep form in sync with toggle
  const handleResolutionChange = (r: BorrowLendResolution) => {
    setResolution(r)
    if (r === 'device') {
      form.reset({ resolution_type: 'device', notes: form.getValues('notes') })
    } else {
      form.reset({ resolution_type: 'payment', settlement_amount: 0, notes: form.getValues('notes') } as FormValues)
    }
  }

  const onSubmit = (values: FormValues) => {
    if (!entry) return
    markReturned.mutate(
      {
        id:                entry.id,
        resolution_type:   values.resolution_type,
        settlement_amount: values.resolution_type === 'payment' ? values.settlement_amount : undefined,
        notes:             values.notes || undefined,
      },
      { onSuccess: () => { form.reset(); onClose() } },
    )
  }

  if (!entry) return null

  const isLend = entry.type === 'lend'

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Close Entry</DialogTitle>
          <DialogDescription className="text-sm">
            <span className="font-medium">{entry.device_desc}</span>
            {' '}— {isLend ? 'lent to' : 'borrowed from'}{' '}
            <span className="font-medium">{entry.party_name}</span>
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

            {/* Resolution toggle */}
            <div className="space-y-2">
              <p className="text-sm font-medium">How was this resolved?</p>
              <div className="grid grid-cols-2 gap-3">

                {/* Option A — device returned */}
                <button
                  type="button"
                  onClick={() => handleResolutionChange('device')}
                  className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-sm transition-all ${
                    resolution === 'device'
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/20'
                      : 'border-input bg-background hover:bg-accent'
                  }`}
                >
                  <RotateCcw className={`h-6 w-6 ${resolution === 'device' ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                  <div className="text-center">
                    <p className={`font-semibold ${resolution === 'device' ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>
                      Device returned
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Physical device came back
                    </p>
                  </div>
                </button>

                {/* Option B — settled by payment */}
                <button
                  type="button"
                  onClick={() => handleResolutionChange('payment')}
                  className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-sm transition-all ${
                    resolution === 'payment'
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/20'
                      : 'border-input bg-background hover:bg-accent'
                  }`}
                >
                  <Banknote className={`h-6 w-6 ${resolution === 'payment' ? 'text-blue-600' : 'text-muted-foreground'}`} />
                  <div className="text-center">
                    <p className={`font-semibold ${resolution === 'payment' ? 'text-blue-700 dark:text-blue-400' : ''}`}>
                      Paid money
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Kept device, paid instead
                    </p>
                  </div>
                </button>
              </div>
            </div>

            <Separator />

            {/* Payment amount — only when resolution = payment */}
            {resolution === 'payment' && (
              <FormField
                control={form.control}
                name="settlement_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Settlement amount (₹) <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ''}
                        type="number"
                        min={0.01}
                        step="0.01"
                        disabled={isPending}
                        autoFocus
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Amount paid in lieu of returning the device.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={2}
                      placeholder={
                        resolution === 'payment'
                          ? 'e.g. Same model not available, settled for ₹X'
                          : 'Any remarks on the return…'
                      }
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className={resolution === 'payment' ? 'bg-blue-600 hover:bg-blue-700' : ''}
              >
                {isPending && <Loader2 className="animate-spin" />}
                {resolution === 'device' ? 'Mark returned' : 'Record payment'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
