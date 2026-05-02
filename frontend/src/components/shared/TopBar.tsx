import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import NotificationBell from './NotificationBell'
import UserMenu from './UserMenu'
import Breadcrumbs from './Breadcrumbs'
import ThemeToggle from './ThemeToggle'

interface Props {
  onMenuOpen: () => void
}

export default function TopBar({ onMenuOpen }: Props) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur-sm safe-top lg:hidden">
      {/* Hamburger */}
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={onMenuOpen}
        aria-label="Open navigation menu"
      >
        <Menu className="h-[18px] w-[18px]" />
      </Button>

      {/* Breadcrumb / page title */}
      <div className="flex flex-1 items-center gap-2 overflow-hidden">
        <Breadcrumbs />
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <ThemeToggle />
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  )
}
