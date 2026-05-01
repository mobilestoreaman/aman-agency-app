import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react'
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

interface Alert {
  product_id: string
  product_name: string
  available: number
}

interface Props {
  alerts: Alert[]
  isLoading?: boolean
}

function severityVariant(available: number): 'destructive' | 'warning' | 'secondary' {
  if (available === 0) return 'destructive'
  if (available <= 2) return 'warning'
  return 'secondary'
}

export default function LowStockAlerts({ alerts, isLoading }: Props) {
  if (isLoading) {
    return (
      <Card className="shadow-card border-border/70">
        <CardHeader className="pb-3">
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="shadow-card border-border/70 overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Low Stock Alerts
          {alerts.length > 0 && (
            <Badge variant="warning" className="ml-auto text-xs">
              {alerts.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent>
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center gap-2.5 py-6 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/40">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
            <p className="text-sm text-muted-foreground">All stock levels are healthy.</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {alerts.slice(0, 8).map((alert) => (
              <li
                key={alert.product_id}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/40 transition-colors"
              >
                <Link
                  to="/devices"
                  className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground hover:text-primary transition-colors"
                >
                  {alert.product_name}
                </Link>
                <Badge variant={severityVariant(alert.available)} className="shrink-0 text-xs whitespace-nowrap">
                  {alert.available === 0 ? 'Out of stock' : `${alert.available} left`}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {alerts.length > 0 && (
        <CardFooter className="border-t border-border/50 pt-3">
          <Button variant="ghost" size="sm" className="w-full gap-1.5 text-muted-foreground hover:text-foreground" asChild>
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
