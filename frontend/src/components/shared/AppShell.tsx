import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import MobileNav from './MobileNav'
import NotificationBell from './NotificationBell'
import UserMenu from './UserMenu'
import Breadcrumbs from './Breadcrumbs'

export default function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)

  const closeMobile = () => setMobileOpen(false)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── Desktop sidebar (lg+) ──────────────────────────── */}
      <div className="hidden shrink-0 border-r border-border/60 shadow-[1px_0_0_0_hsl(var(--border)/0.4)] lg:flex">
        <Sidebar />
      </div>

      {/* ── Mobile sidebar drawer ─────────────────────────── */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-64 border-r-0">
          <Sidebar onNavigate={closeMobile} />
        </SheetContent>
      </Sheet>

      {/* ── Main area ─────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <TopBar onMenuOpen={() => setMobileOpen(true)} />

        {/* Desktop top bar (lg+) */}
        <header className="hidden h-14 shrink-0 items-center border-b bg-background/95 px-6 backdrop-blur-sm lg:flex">
          <Breadcrumbs />
          <div className="ml-auto flex items-center gap-1.5">
            <NotificationBell />
            <UserMenu />
          </div>
        </header>

        {/* Page content */}
        <ScrollArea className="flex-1">
          <main className="min-h-full p-4 pb-24 sm:p-5 lg:p-7 lg:pb-7 animate-fade-in">
            <Outlet />
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
