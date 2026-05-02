import { Sun, Moon, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useThemeStore, type Theme } from '@/store/themeStore'

const THEME_CYCLE: Theme[] = ['light', 'dark', 'system']

export default function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)

  const handleCycle = () => {
    const currentIndex = THEME_CYCLE.indexOf(theme)
    const nextIndex = (currentIndex + 1) % THEME_CYCLE.length
    setTheme(THEME_CYCLE[nextIndex])
  }

  const iconMap = {
    light: <Sun className="h-[18px] w-[18px]" />,
    dark: <Moon className="h-[18px] w-[18px]" />,
    system: <Monitor className="h-[18px] w-[18px]" />,
  }

  const labelMap = {
    light: 'Light mode',
    dark: 'Dark mode',
    system: 'System preference',
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
            onClick={handleCycle}
            aria-label="Toggle theme"
          >
            {iconMap[theme]}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {labelMap[theme]}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
