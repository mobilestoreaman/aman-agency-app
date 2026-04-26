import { Link, useLocation, useMatches } from 'react-router-dom'
import { ChevronRight, Home } from 'lucide-react'
import { cn } from '@/lib/utils'
import { allNavItems } from '@/config/navigation'

function labelFromPath(segment: string): string {
  // Check against nav items first
  const item = allNavItems.find((n) => n.path === `/${segment}`)
  if (item) return item.label

  // Generic prettify: "loan-references" → "Loan References"
  return segment
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export default function Breadcrumbs() {
  const { pathname } = useLocation()

  if (pathname === '/') return null

  const segments = pathname.split('/').filter(Boolean)

  // Build crumb trail: Home → segment1 → segment2 …
  const crumbs = segments.map((seg, idx) => {
    const path = '/' + segments.slice(0, idx + 1).join('/')
    const isLast = idx === segments.length - 1
    // If it looks like a MongoDB ObjectID (24 hex chars), show "Detail"
    const label = /^[0-9a-f]{24}$/i.test(seg) ? 'Detail' : labelFromPath(seg)
    return { label, path, isLast }
  })

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground">
      <Link
        to="/"
        className="flex items-center rounded p-0.5 transition-colors hover:text-foreground"
        aria-label="Dashboard"
      >
        <Home className="h-3.5 w-3.5" />
      </Link>

      {crumbs.map((crumb) => (
        <span key={crumb.path} className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          {crumb.isLast ? (
            <span className={cn('font-medium text-foreground')}>{crumb.label}</span>
          ) : (
            <Link
              to={crumb.path}
              className="rounded p-0.5 transition-colors hover:text-foreground"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  )
}
