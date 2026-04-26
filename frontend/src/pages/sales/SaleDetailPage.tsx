import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, User, CalendarDays, CreditCard, Hash, FileText,
  XCircle, Loader2, ShoppingBag,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import PageHeader from '@/components/shared/PageHeader'
import { useSale, useCancelSale, SALE_STATUS_LABELS } from '@/hooks/useSales'
import { useIsAdmin } from '@/store/authStore'
import { formatCurrency } from '@/utils/currency'
import { formatDate, formatDateTime } from '@/utils/date'

function InfoRow({ icon: Icon, label, value }: {
  icon: React.ElementType; label: string; value: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

export default function SaleDetailPage() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isAdmin  = useIsAdmin()

  const [confirmOpen, setConfirmOpen] = useState(false)

  const { data: sale, isLoading } = useSale(id ?? '')
  const cancelSale = useCancelSale()

  const handleCancel = () => {
    if (!id) return
    cancelSale.mutate(id, {
      onSuccess: () => { setConfirmOpen(false); navigate('/sales') },
    })
  }

  const statusVariant = sale?.status === 'completed' ? 'success' : 'destructive'

  return (
    <div className="flex flex-col gap-6">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost" size="icon" className="h-8 w-8"
          onClick={() => navigate('/sales')}
          aria-label="Back to sales"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader
          title={
            isLoading
              ? 'Loading…'
              : sale
              ? `Invoice #${sale.invoice_number}`
              : 'Sale'
          }
          description={sale ? `Recorded on ${formatDate(sale.sold_at)}` : ''}
          action={
            isAdmin && sale?.status === 'completed' ? (
              <Button
                variant="destructive" size="sm"
                onClick={() => setConfirmOpen(true)}
                className="gap-1.5"
              >
                <XCircle className="h-4 w-4" /> Cancel Sale
              </Button>
            ) : undefined
          }
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : sale ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Left: sale info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-sm font-semibold">
                <span className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4" /> Sale Info
                </span>
                <Badge variant={statusVariant} className="text-xs">
                  {SALE_STATUS_LABELS[sale.status]}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow icon={User}         label="Customer"    value={
                <Link to={`/customers/${sale.customer_id}`} className="underline-offset-4 hover:underline">
                  {sale.customer_name}
                </Link>
              } />
              <InfoRow icon={CalendarDays} label="Sale date"   value={formatDate(sale.sold_at)} />
              <InfoRow icon={Hash}         label="Invoice"     value={
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{sale.invoice_number}</code>
              } />
              <InfoRow icon={User}         label="Sold by"     value={sale.staff_name} />
              {sale.notes && (
                <InfoRow icon={FileText} label="Notes" value={
                  <span className="italic text-muted-foreground">{sale.notes}</span>
                } />
              )}
              {sale.status === 'cancelled' && (
                <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {sale.cancelled_at ? `Cancelled: ${formatDate(sale.cancelled_at)}` : 'Sale cancelled'}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right: items & totals */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Items &amp; Totals
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Items list */}
              <div className="divide-y rounded-md border">
                {(sale.items ?? []).map((item, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{item.product_name}</p>
                      {item.imei1 && (
                        <p className="font-mono text-xs text-muted-foreground">{item.imei1}</p>
                      )}
                    </div>
                    <span className="shrink-0 font-mono font-semibold">
                      {formatCurrency(item.sale_price)}
                    </span>
                  </div>
                ))}
                {(!sale.items || sale.items.length === 0) && (
                  <p className="px-3 py-3 text-sm text-muted-foreground">No items</p>
                )}
              </div>

              <Separator />

              {/* Totals */}
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-mono">{formatCurrency(sale.subtotal)}</span>
                </div>
                {(sale.discount ?? 0) > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Discount</span>
                    <span className="font-mono">− {formatCurrency(sale.discount)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-base font-bold">
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
            </CardContent>
          </Card>
        </div>
      ) : (
        <p className="text-center text-muted-foreground py-12">Sale not found.</p>
      )}

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
    </div>
  )
}
