import { NavLink } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { mobileTabItems } from '@/config/navigation'
import { useNotificationStore } from '@/store/notificationStore'

interface Props {
  onMenuOpen: () => void
}

export default function MobileNav({ onMenuOpen }: Props) {
  const unread = useNotificationStore((s) => s.unreadCount)

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-sm"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Mobile navigation"
    >
      <div className="flex h-14 items-stretch">
        {mobileTabItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-all duration-150',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={cn(
                      'relative flex items-center justify-center rounded-xl p-1.5 transition-all duration-150',
                      isActive && 'bg-primary/10',
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-[19px] w-[19px] transition-all duration-150',
                        isActive ? 'scale-110' : 'scale-100',
                      )}
                    />
                    {item.path === '/notifications' && unread > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                        {unread > 9 ? '9+' : unread}
                      </span>
                    )}
                  </div>
                  <span className="leading-none">{item.label}</span>
                </>
              )}
            </NavLink>
          )
        })}

        {/* "More" opens full sidebar */}
        <button
          onClick={onMenuOpen}
          className="flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          aria-label="More navigation options"
        >
          <div className="flex items-center justify-center rounded-xl p-1.5">
            <Menu className="h-[19px] w-[19px]" />
          </div>
          <span className="leading-none">More</span>
        </button>
      </div>
    </nav>
  )
}
