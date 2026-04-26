import { useState } from 'react'
import { XCircle, Loader2, Printer, User, CalendarDays, Hash, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { useSale, useCancelSale, SALE_STATUS_LABELS } from '@/hooks/useSales'
import { useIsAdmin } from '@/store/authStore'
import { billsApi } from '@/api/bills'
import { getApiError } from '@/utils/error'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/date'

interface Props {
  open:    boolean
  onClose: () => void
  saleId:  string | null
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

export default function SaleDetailModal({ open, onClose, saleId }: Props) {
  const isAdmin       = useIsAdmin()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isPrinting,  setIsPrinting]  = useState(false)

  const { data: sale, isLoading } = useSale(saleId ?? '')
  const cancelSale = useCancelSale()

  // ── Print / Generate Invoice ─────────────────────────────────
  const handlePrintInvoice = async () => {
    if (!saleId) return
    setIsPrinting(true)
    try {
      // Try to fetch an existing bill for this sale
      let billId: string | null = null
      try {
        const res = await billsApi.getBySaleId(saleId)
        billId = res.data.data.id
      } catch {
        // No bill yet — create + issue it
        const createRes = await billsApi.create({ sale_id: saleId })
        const bill      = createRes.data.data
        await billsApi.issue(bill.id)
        billId = bill.id
      }
      if (billId) {
        // Fetch with auth header → blob URL, so the JWT is sent correctly.
        await billsApi.openInvoice(billId)
      }
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setIsPrinting(false)
    }
  }

  const handleCancel = () => {
    if (!saleId) return
    cancelSale.mutate(saleId, {
      onSuccess: () => { setConfirmOpen(false); onClose() },
    })
  }

  const statusVariant = sale?.status === 'completed' ? 'success' : 'destructive'

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="flex max-h-[92vh] flex-col sm:max-w-xl">
          <DialogHeader className="shrink-0">
            <div className="flex items-center gap-3">
              <DialogTitle className="text-base">
                {isLoading ? <Skeleton className="h-5 w-36" /> : `Invoice #${sale?.invoice_number}`}
              </DialogTitle>
              {!isLoading && sale && (
                <Badge variant={statusVariant} className="text-xs">
                  {SALE_STATUS_LABELS[sale.status]}
                </Badge>
              )}
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="space-y-3 p-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            ) : sale ? (
              <div className="space-y-5 p-1">
                {/* Meta info */}
                <div className="space-y-2.5">
                  <InfoRow icon={User}        label="Customer"  value={sale.customer_name} />
                  <InfoRow icon={CalendarDays} label="Sale date" value={formatDate(sale.sold_at)} />
                  <InfoRow icon={Hash}        label="Invoice"   value={
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{sale.invoice_number}</code>
                  } />
                  {sale.notes && (
                    <InfoRow icon={FileText} label="Notes" value={<span className="italic text-muted-foreground">{sale.notes}</span>} />
                  )}
                </div>

                <Separator />

                {/* Items */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Items ({sale.items?.length ?? 0})
                  </p>
                  <div className="rounded-md border divide-y">
                    {(sale.items ?? []).map((item, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{item.product_name}</p>
                          <p className="font-mono text-xs text-muted-foreground">{item.imei1}</p>
                          {item.color && <p className="text-xs text-muted-foreground">{item.color}{item.storage ? ` · ${item.storage}` : ''}</p>}
                        </div>
                        <span className="shrink-0 font-mono font-semibold">{formatCurrency(item.sale_price)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Totals */}
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between font-bold text-base">
                    <span>Total</span>
                    <span className="font-mono">{formatCurrency(sale.total_amount)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Paid</span>
                    <span className="font-mono text-emerald-600">{formatCurrency(sale.amount_paid)}</span>
                  </div>
                  {sale.balance > 0 && (
                    <div className="flex justify-between text-amber-600">
                      <span>Balance due</span>
                      <span className="font-mono">{formatCurrency(sale.balance)}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </ScrollArea>

          <DialogFooter className="shrink-0 border-t pt-4 gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
            {sale?.status === 'completed' && (
              <Button
                type="button"
                variant="secondary"
                onClick={handlePrintInvoice}
                disabled={isPrinting}
                className="gap-1.5"
              >
                {isPrinting
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Printer className="h-4 w-4" />
                }
                Print Invoice
              </Button>
            )}
            {isAdmin && sale?.status === 'completed' && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setConfirmOpen(true)}
                className="gap-1.5"
              >
                <XCircle className="h-4 w-4" />
                Cancel sale
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleCancel}
        isPending={cancelSale.isPending}
        title="Cancel this sale?"
        description={`Invoice #${sale?.invoice_number} will be marked as cancelled and all device statuses will be reverted to available. This cannot be undone.`}
        confirmLabel="Yes, cancel sale"
        variant="destructive"
      />
    </>
  )
}
