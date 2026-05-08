import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import MobileNav from './MobileNav'
import NotificationBell from './NotificationBell'
import UserMenu from './UserMenu'
import Breadcrumbs from './Breadcrumbs'
import ThemeToggle from './ThemeToggle'
import PageTransition from './PageTransition'
import { useTokenExpiry } from '@/hooks/useTokenExpiry'

export default function AppShell() {
  // Proactively log out when the refresh token expires — handles both the
  // idle case (timer fires at exact expiry) and the background-tab case
  // (visibility check fires when user returns to the tab).
  useTokenExpiry()

  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  const closeMobile = () => setMobileOpen(false)

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      {/* ── Desktop sidebar (lg+) ──────────────────────────── */}
      <div className="hidden shrink-0 border-r border-border/60 shadow-[1px_0_0_0_hsl(var(--border)/0.4)] lg:flex">
        <Sidebar />
      </div>

      {/* ── Mobile sidebar drawer ─────────────────────────── */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="p-0 w-64 border-r-0 [&>button]:text-sidebar-foreground [&>button]:opacity-80 [&>button]:hover:opacity-100 [&>button]:ring-offset-sidebar"
        >
          <Sidebar onNavigate={closeMobile} />
        </SheetContent>
      </Sheet>

      {/* ── Main area ─────────────────────────────────────── */}
      <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <TopBar onMenuOpen={() => setMobileOpen(true)} />

        {/* Desktop top bar (lg+) */}
        <header className="hidden h-14 shrink-0 items-center border-b bg-background/95 px-6 backdrop-blur-sm lg:flex">
          <Breadcrumbs />
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            <NotificationBell />
            <UserMenu />
          </div>
        </header>

        {/* Page content */}
        <ScrollArea className="flex-1">
          <main className="min-h-full w-full p-4 sm:p-5 lg:p-7 overflow-x-hidden [padding-bottom:calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:[padding-bottom:1.75rem]">
            <PageTransition key={location.pathname}>
              <Outlet />
            </PageTransition>
          </main>
        </ScrollArea>
      </div>

      {/* ── Mobile bottom tab bar ─────────────────────────── */}
      <div className="lg:hidden">
        <MobileNav onMenuOpen={() => setMobileOpen(true)} />
      </div>
    </div>
  )
}
