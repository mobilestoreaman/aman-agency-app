import { Link } from 'react-router-dom'
import { ArrowRight, ShoppingBag, Receipt } from 'lucide-react'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/date'
import type { RecentSaleEntry } from '@/types'

type RecentSale = RecentSaleEntry

interface Props {
  sales: RecentSale[]
  isLoading?: boolean
}

/** Status → badge variant map */
function statusConfig(status: string): {
  label: string
  className: string
} {
  switch (status) {
    case 'completed':
      return {
        label:     'Completed',
        className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
      }
    case 'partial':
      return {
        label:     'Partial',
        className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
      }
    case 'cancelled':
      return {
        label:     'Cancelled',
        className: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
      }
    default:
      return {
        label:     status,
        className: 'bg-muted text-muted-foreground',
      }
  }
}

function SalesSkeleton() {
  return (
    <Card className="shadow-card border-border/70">
      <CardHeader className="pb-3">
        <Skeleton className="h-4 w-28" />
      </CardHeader>
      <CardContent className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="space-y-2 rounded-xl border border-border/50 p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-4 w-16 shrink-0" />
            </div>
            <Skeleton className="h-3 w-36" />
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-14 shrink-0 rounded-full" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default function RecentSales({ sales, isLoading }: Props) {
  if (isLoading) return <SalesSkeleton />

  return (
    <Card className="shadow-card border-border/70 overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <ShoppingBag className="h-4 w-4 shrink-0 text-primary/70" />
          <span>Recent Sales</span>
        </CardTitle>
      </CardHeader>

      <CardContent className="pb-0">
        {sales.length === 0 ? (
          /* ── Empty state ── */
          <div className="flex flex-col items-center gap-2.5 py-8 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
              <ShoppingBag className="h-5 w-5 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground">No sales recorded yet.</p>
          </div>
        ) : (
          /* ── Sale card list ── */
          <ul className="space-y-2 pb-4">
            {sales.map((sale) => {
              const { label: statusLabel, className: statusClass } = statusConfig(sale.status)
              return (
                <li key={sale.sale_id}>
                  <Link
                    to={`/sales/${sale.sale_id}`}
                    className="
                      block w-full min-w-0 rounded-xl border border-border/50
                      p-3 transition-colors hover:bg-muted/40
                    "
                  >
                    {/* ── Row 1: Invoice ID + Amount ── */}
                    <div className="flex w-full min-w-0 items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Receipt className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                        <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {sale.invoice_number}
                        </span>
                      </div>
                      <span className="shrink-0 text-[14px] font-bold tabular-nums text-foreground">
                        {formatCurrency(sale.total_amount)}
                      </span>
                    </div>

                    {/* ── Row 2: Customer name ── */}
                    <p className="mt-1.5 truncate text-[13px] font-medium text-foreground">
                      {sale.customer_name}
                    </p>

                    {/* ── Row 3: Date + Status ── */}
                    <div className="mt-1.5 flex w-full min-w-0 items-center justify-between gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        {formatDate(sale.created_at)}
                      </span>
                      <span
                        className={`
                          shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold
                          ${statusClass}
                        `}
                      >
                        {statusLabel}
                      </span>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>

      <CardFooter className="border-t border-border/50 pt-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-full gap-1.5 text-muted-foreground hover:text-foreground"
          asChild
        >
          <Link to="/sales">
            View all sales
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}
