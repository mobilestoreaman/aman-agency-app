import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CheckCircle2, Package } from 'lucide-react'
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
import type { LowStockAlert } from '@/types'

interface Props {
  alerts: LowStockAlert[]
  isLoading?: boolean
}

/** Returns severity config based on stock count */
function severity(available: number): {
  variant: 'destructive' | 'warning' | 'secondary'
  label: string
  /** Left-border accent + subtle bg tint for urgency at-a-glance */
  accent: string
} {
  if (available === 0) {
    return {
      variant: 'destructive',
      label:   'Out of stock',
      accent:  'border-l-2 border-l-destructive bg-destructive/[0.03] dark:bg-destructive/[0.07]',
    }
  }
  if (available <= 2) {
    return {
      variant: 'warning',
      label:   `${available} left`,
      accent:  'border-l-2 border-l-amber-400 bg-amber-50/60 dark:bg-amber-950/20',
    }
  }
  return {
    variant: 'secondary',
    label:   `${available} left`,
    accent:  '',
  }
}

function AlertSkeleton() {
  return (
    <Card className="shadow-card border-border/70">
      <CardHeader className="pb-3">
        <Skeleton className="h-4 w-36" />
      </CardHeader>
      <CardContent className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 rounded-xl border border-border/50 px-3 py-2.5"
          >
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default function LowStockAlerts({ alerts, isLoading }: Props) {
  if (isLoading) return <AlertSkeleton />

  return (
    <Card className="shadow-card border-border/70 overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          <span>Low Stock Alerts</span>
          {alerts.length > 0 && (
            <Badge variant="warning" className="ml-auto shrink-0 text-xs tabular-nums">
              {alerts.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="pb-0">
        {alerts.length === 0 ? (
          /* ── Empty state ── */
          <div className="flex flex-col items-center gap-2.5 py-8 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/40">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
            </div>
            <p className="text-sm text-muted-foreground">All stock levels are healthy.</p>
          </div>
        ) : (
          /* ── Alert card list ── */
          <ul className="space-y-2 pb-4">
            {alerts.slice(0, 8).map((alert) => {
              const { variant, label, accent } = severity(alert.available)
              return (
                <li key={alert.product_id}>
                  <Link
                    to="/devices"
                    className={`
                      flex w-full min-w-0 items-center justify-between gap-3
                      rounded-xl border border-border/50 px-3 py-2.5
                      transition-colors hover:bg-muted/40
                      ${accent}
                    `}
                  >
                    {/* Left: product info */}
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/60">
                        <Package className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">
                          {alert.product_name}
                        </p>
                        {alert.brand_name && (
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {alert.brand_name}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right: stock badge */}
                    <Badge
                      variant={variant}
                      className="shrink-0 whitespace-nowrap text-xs tabular-nums"
                    >
                      {label}
                    </Badge>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>

      {alerts.length > 0 && (
        <CardFooter className="border-t border-border/50 pt-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full gap-1.5 text-muted-foreground hover:text-foreground"
            asChild
          >
            <Link to="/devices?status=available">
              View inventory
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
