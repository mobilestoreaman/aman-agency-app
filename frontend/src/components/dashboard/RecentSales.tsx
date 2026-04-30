import { Link } from 'react-router-dom'
import { ArrowRight, ShoppingBag } from 'lucide-react'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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

export default function RecentSales({ sales, isLoading }: Props) {
  return (
    <Card className="shadow-card border-border/70">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <ShoppingBag className="h-4 w-4 text-primary/70" />
          Recent Sales
        </CardTitle>
      </CardHeader>

      <CardContent className="px-0">
        {isLoading ? (
          <div className="space-y-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b last:border-0">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-4 w-16 shrink-0" />
              </div>
            ))}
          </div>
        ) : sales.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <ShoppingBag className="h-5 w-5 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground">No sales recorded yet today.</p>
          </div>
        ) : (
          <div>
            {sales.map((sale) => (
              <div
                key={sale.sale_id}
                className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors"
              >
                {/* Invoice + customer */}
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/sales/${sale.sale_id}`}
                    className="block truncate text-[13px] font-semibold text-foreground hover:text-primary transition-colors"
                  >
                    {sale.invoice_number}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground mt-0.5">
                    {sale.customer_name}
                  </p>
                </div>

                {/* Amount */}
                <span className="shrink-0 text-[13px] font-bold text-foreground tabular-nums whitespace-nowrap">
                  {formatCurrency(sale.total_amount)}
                </span>

                {/* Date */}
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:block min-w-[70px] text-right whitespace-nowrap">
                  {formatDate(sale.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <CardFooter className="border-t border-border/50 pt-3">
        <Button variant="ghost" size="sm" className="w-full gap-1.5 text-muted-foreground hover:text-foreground" asChild>
          <Link to="/sales">
            View all sales
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}
