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
      <CardHeader className="px-4 pb-2 pt-4 sm:px-5">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          Quick Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-4 sm:px-4">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-2">
          {actions.map((action) => {
            const Icon = action.icon
            return (
              <Link
                key={action.path}
                to={action.path}
                className="group flex flex-col items-center gap-2 rounded-2xl p-2.5 text-center transition-all duration-150 hover:bg-muted/50 active:scale-[0.96] active:bg-muted/70"
              >
                <div
                  className={cn(
                    'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-all duration-150 group-hover:scale-105 group-active:scale-95',
                    action.bg,
                  )}
                >
                  <Icon className={cn('h-[22px] w-[22px]', action.color)} />
                </div>
                <span className="w-full text-center text-[11px] font-medium leading-tight text-foreground/75 group-hover:text-foreground">
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
