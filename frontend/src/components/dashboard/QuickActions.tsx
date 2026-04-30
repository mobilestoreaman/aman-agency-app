import { Link } from 'react-router-dom'
import {
  ShoppingCart,
  Smartphone,
  Users,
  Receipt,
  ShoppingBag,
  Wallet,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface Action {
  label: string
  path: string
  icon: React.ElementType
  color: string
  bg: string
}

const actions: Action[] = [
  { label: 'New Sale',     path: '/sales?new=1', icon: ShoppingCart, color: 'text-blue-600',    bg: 'bg-blue-50    dark:bg-blue-950/40' },
  { label: 'Add Device',   path: '/devices',   icon: Smartphone,   color: 'text-violet-600',  bg: 'bg-violet-50  dark:bg-violet-950/40' },
  { label: 'Customers',    path: '/customers', icon: Users,        color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
  { label: 'Bills',        path: '/bills',     icon: Receipt,      color: 'text-amber-600',   bg: 'bg-amber-50   dark:bg-amber-950/40' },
  { label: 'Purchase',     path: '/purchases', icon: ShoppingBag,  color: 'text-rose-600',    bg: 'bg-rose-50    dark:bg-rose-950/40' },
  { label: 'Expense',      path: '/expenses',  icon: Wallet,       color: 'text-teal-600',    bg: 'bg-teal-50    dark:bg-teal-950/40' },
]

export default function QuickActions() {
  return (
    <Card className="shadow-card border-border/70">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Quick Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        <div className="grid grid-cols-3 gap-1 sm:gap-1.5 sm:grid-cols-6">
          {actions.map((action) => {
            const Icon = action.icon
            return (
              <Link
                key={action.path}
                to={action.path}
                className="group flex flex-col items-center gap-1.5 rounded-xl p-2 sm:p-3 text-center transition-all duration-150 hover:bg-muted/60 hover:scale-[1.02] active:scale-[0.98]"
              >
                <div
                  className={cn(
                    'flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-xl transition-shadow group-hover:shadow-sm',
                    action.bg,
                  )}
                >
                  <Icon className={cn('h-4 w-4 sm:h-5 sm:w-5', action.color)} />
                </div>
                <span className="text-[10px] sm:text-[11px] font-medium leading-tight text-foreground/80 group-hover:text-foreground">
                  {action.label}
                </span>
              </Link>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
