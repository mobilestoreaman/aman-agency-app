import { Smartphone } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import NavLink from './NavLink'
import { navGroups } from '@/config/navigation'
import { useAuthStore } from '@/store/authStore'
import { useSettings } from '@/hooks/useSettings'

interface Props {
  onNavigate?: () => void
}

export default function Sidebar({ onNavigate }: Props) {
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'

  // React Query deduplicates this call — no extra network request is made
  // when SettingsPage is also mounted (same query key, shared cache).
  const { data: settings } = useSettings()
  const storeLogo = settings?.logo_base64
  const storeName = settings?.store_name ?? 'New Aman Agency'

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  return (
    <aside className="flex h-full w-64 flex-col bg-sidebar">
      {/* ── Logo ──────────────────────────────────────────── */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary shadow-sm overflow-hidden">
          {storeLogo ? (
            <img
              src={storeLogo}
              alt={`${storeName} logo`}
              className="h-full w-full object-contain p-0.5"
            />
          ) : (
            <Smartphone className="h-[18px] w-[18px] text-sidebar-primary-foreground" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold tracking-tight text-sidebar-foreground">
            {storeName}
          </p>
          <p className="truncate text-[11px] text-sidebar-foreground/45 font-medium">
            Store Management
          </p>
        </div>
      </div>

      {/* ── Nav groups ────────────────────────────────────── */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="flex flex-col gap-6" aria-label="Main navigation">
          {navGroups.map((group) => {
            const visibleItems = group.items.filter(
              (item) => !item.adminOnly || isAdmin,
            )
            if (visibleItems.length === 0) return null

            return (
              <div key={group.label}>
                <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/35">
                  {group.label}
                </p>
                <div className="flex flex-col gap-0.5">
                  {visibleItems.map((item) => (
                    <NavLink
                      key={item.path}
                      item={item}
                      onClick={onNavigate}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </nav>
      </ScrollArea>

      {/* ── User info footer ──────────────────────────────── */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-sidebar-accent/50">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/20 text-[11px] font-bold text-sidebar-primary-foreground/90 ring-2 ring-sidebar-primary/30">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-sidebar-foreground">
              {user?.name}
            </p>
            <p className="truncate text-[11px] capitalize text-sidebar-foreground/45">
              {user?.role}
            </p>
          </div>
        </div>

        {/* ── Developer credit ────────────────────────────── */}
        <p className="mt-2 px-2 text-center text-[10px] text-sidebar-foreground/30 select-none">
          Developed by CM Singh
        </p>
      </div>
    </aside>
  )
}
