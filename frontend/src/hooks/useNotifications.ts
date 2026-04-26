import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { notificationsApi } from '@/api/notifications'
import { useNotificationStore } from '@/store/notificationStore'
import { getApiError } from '@/api/client'

export const notifKeys = {
  all:         ['notifications'] as const,
  list:        (p?: object) => [...notifKeys.all, 'list', p] as const,
  unreadCount: () => [...notifKeys.all, 'unread-count'] as const,
}

/** Polls unread count every 60 s and syncs to store */
export function useUnreadCount() {
  const setCount = useNotificationStore((s) => s.setUnreadCount)

  const query = useQuery({
    queryKey: notifKeys.unreadCount(),
    queryFn: () => notificationsApi.unreadCount().then((r) => r.data.data.count),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (query.data !== undefined) setCount(query.data)
  }, [query.data, setCount])

  return query
}

export function useNotificationList(params?: { page?: number; limit?: number; status?: string }) {
  return useQuery({
    queryKey: notifKeys.list(params),
    queryFn: () => notificationsApi.list(params).then((r) => r.data),
  })
}

export function useMarkRead() {
  const qc = useQueryClient()
  const decrement = useNotificationStore((s) => s.decrement)
  return useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      decrement()
      qc.invalidateQueries({ queryKey: notifKeys.all })
    },
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  const reset = useNotificationStore((s) => s.reset)
  return useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      reset()
      qc.invalidateQueries({ queryKey: notifKeys.all })
      toast.success('All notifications marked as read.')
    },
  })
}

export function useDismissNotification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => notificationsApi.dismiss(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: notifKeys.all }),
  })
}

export function useDeleteNotification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => notificationsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notifKeys.all })
      toast.success('Notification deleted.')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}

export function useCreateNotification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { type: string; title: string; body: string; recipient_email?: string }) =>
      notificationsApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notifKeys.all })
      toast.success('Notification created.')
    },
    onError: (e) => toast.error(getApiError(e)),
  })
}
