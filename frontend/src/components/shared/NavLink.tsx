import { NavLink as RouterNavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type { NavItem } from '@/config/navigation'

interface Props {
  item: NavItem
  collapsed?: boolean
  onClick?: () => void
}

export default function NavLink({ item, collapsed, onClick }: Props) {
  const Icon = item.icon

  return (
    <RouterNavLink
      to={item.path}
      end={item.path === '/'}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
          isActive
            ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
            : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          collapsed && 'justify-center px-2',
        )
      }
      title={collapsed ? item.label : undefined}
      aria-label={item.label}
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn(
              'h-[15px] w-[15px] shrink-0 transition-transform duration-150',
              isActive ? 'opacity-100' : 'opacity-70 group-hover:opacity-100',
            )}
          />
          {!collapsed && (
            <span className="truncate leading-none">{item.label}</span>
          )}
        </>
      )}
    </RouterNavLink>
  )
}
