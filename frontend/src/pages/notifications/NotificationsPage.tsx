import { useState } from 'react'
import {
  Bell, BellOff, CheckCheck, Trash2, AlertTriangle,
  CreditCard, ShoppingCart, PackageSearch, Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ResponsiveTable, type Column } from '@/components/shared/ResponsiveTable'
import PageHeader from '@/components/shared/PageHeader'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import {
  useNotificationList, useMarkRead, useMarkAllRead,
  useDismissNotification, useDeleteNotification,
} from '@/hooks/useNotifications'
import { useIsAdmin } from '@/store/authStore'
import { formatDateTime } from '@/utils/date'
import type { Notification, NotificationStatus, NotificationType } from '@/types'

// ── Visual maps ───────────────────────────────────────────────────────────────
const TYPE_ICON: Record<NotificationType, React.ElementType> = {
  low_stock:   PackageSearch,
  overdue:     AlertTriangle,
  credit_due:  CreditCard,
  sale_cancel: ShoppingCart,
  general:     Info,
}

const TYPE_LABEL: Record<NotificationType, string> = {
  low_stock:   'Low Stock',
  overdue:     'Overdue',
  credit_due:  'Credit Due',
  sale_cancel: 'Sale Cancelled',
  general:     'General',
}

const STATUS_VARIANT: Record<NotificationStatus, 'warning' | 'success' | 'secondary'> = {
  unread:    'warning',
  read:      'success',
  dismissed: 'secondary',
}

export default function NotificationsPage() {
  const isAdmin = useIsAdmin()

  const [page, setPage]           = useState(1)
  const [statusFilter, setStatus] = useState<NotificationStatus | ''>('')
  const [deleting, setDeleting]   = useState<Notification | null>(null)

  const { data, isLoading } = useNotificationList({
    page,
    limit: 20,
    status:    statusFilter || undefined,
  })

  const markRead    = useMarkRead()
  const markAllRead = useMarkAllRead()
  const dismiss     = useDismissNotification()
  const deleteNotif = useDeleteNotification()

  const notifications = data?.data ?? []
  const unreadCount   = notifications.filter((n) => n.status === 'unread').length

  const handleDelete = () => {
    if (!deleting) return
    deleteNotif.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
  }

  const columns: Column<Notification>[] = [
    {
      key:    'type_title',
      header: 'Notification',
      cell:   (n) => {
        const Icon = TYPE_ICON[n.type]
        const isUnread = n.status === 'unread'
        return (
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
              isUnread
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                : 'bg-muted text-muted-foreground'
            }`}>
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <p className={`text-sm truncate ${isUnread ? 'font-semibold' : 'font-medium'}`}>
                {n.title}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{n.body}</p>
            </div>
          </div>
        )
      },
    },
    {
      key:    'type',
      header: 'Type',
      cell:   (n) => (
        <Badge variant="outline" className="text-xs whitespace-nowrap">
          {TYPE_LABEL[n.type]}
        </Badge>
      ),
      className: 'hidden sm:table-cell',
      sortValue: (n) => n.type,
    },
    {
      key:    'status',
      header: 'Status',
      cell:   (n) => (
        <Badge variant={STATUS_VARIANT[n.status]} className="text-xs capitalize">
          {n.status}
        </Badge>
      ),
      sortValue: (n) => n.status,
    },
    {
      key:    'date',
      header: 'Time',
      cell:   (n) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {formatDateTime(n.created_at)}
        </span>
      ),
      className: 'hidden md:table-cell',
      sortValue: (n) => n.created_at,
    },
    {
      key:    'actions',
      header: '',
      cell:   (n) => (
        <div className="flex items-center justify-end gap-1">
          {n.status === 'unread' && (
            <Button
              variant="ghost" size="sm"
              className="h-8 gap-1 px-2 text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
              onClick={() => markRead.mutate(n.id)}
              disabled={markRead.isPending}
            >
              <CheckCheck className="h-3 w-3" />
              <span className="hidden sm:inline">Mark read</span>
            </Button>
          )}
          {n.status === 'unread' && (
            <Button
              variant="ghost" size="sm"
              className="h-8 gap-1 px-2 text-xs"
              onClick={() => dismiss.mutate(n.id)}
              disabled={dismiss.isPending}
            >
              <BellOff className="h-3 w-3" />
              <span className="hidden sm:inline">Dismiss</span>
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="ghost" size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => setDeleting(n)}
              aria-label="Delete notification"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
      className: 'w-44 whitespace-nowrap',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notifications"
        description="Stay on top of low stock alerts, overdue loans, and credit reminders."
        action={
          unreadCount > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="gap-1.5"
            >
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </Button>
          ) : undefined
        }
      />

      {/* Unread callout */}
      {!isLoading && unreadCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300/50 bg-amber-50/50 px-4 py-2.5 text-sm dark:border-amber-700/30 dark:bg-amber-950/20">
          <Bell className="h-4 w-4 text-amber-500" />
          <span className="text-muted-foreground">
            You have{' '}
            <span className="font-semibold text-amber-700 dark:text-amber-400">{unreadCount}</span>{' '}
            unread notification{unreadCount !== 1 ? 's' : ''} on this page.
          </span>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select
          value={statusFilter}
          onValueChange={(v) => { setStatus((v === 'all' ? '' : v) as NotificationStatus | ''); setPage(1) }}
        >
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="unread">Unread</SelectItem>
            <SelectItem value="read">Read</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ResponsiveTable
        columns={columns}
        data={notifications}
        isLoading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        emptyMessage="No notifications yet. You're all caught up!"
        mobileCard={{
          top:     ['type_title', 'status'],
          middle:  [],
          bottom:  ['type', 'date'],
          actions: 'actions',
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        isPending={deleteNotif.isPending}
        title="Delete notification?"
        description={deleting?.title ?? 'This will permanently remove the notification.'}
        confirmLabel="Delete"
        variant="destructive"
      />
    </div>
  )
}
