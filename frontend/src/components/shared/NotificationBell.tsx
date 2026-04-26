import { Bell } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useNotificationStore } from '@/store/notificationStore'
import { useUnreadCount } from '@/hooks/useNotifications'

export default function NotificationBell() {
  // Kick off the polling query; syncs count into the store as a side-effect
  useUnreadCount()
  const count = useNotificationStore((s) => s.unreadCount)

  return (
    <Link
      to="/notifications"
      className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      aria-label={`Notifications${count > 0 ? ` (${count} unread)` : ''}`}
    >
      <Bell className="h-5 w-5" />
      {count > 0 && (
        <span
          className={cn(
            'absolute right-1 top-1 flex items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground',
            count > 9 ? 'h-4 w-4 text-[9px]' : 'h-4 w-4',
          )}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
