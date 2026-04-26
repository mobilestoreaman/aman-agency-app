import { AlertCircle, AlertTriangle, Info, Bug } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { LogLevel } from '@/types/logs'

interface LogLevelBadgeProps {
  level: LogLevel
}

export default function LogLevelBadge({ level }: LogLevelBadgeProps) {
  const variants: Record<LogLevel, { variant: 'destructive' | 'warning' | 'default' | 'secondary', icon: React.ReactNode }> = {
    ERROR: { variant: 'destructive', icon: <AlertCircle className="h-3 w-3" /> },
    WARN: { variant: 'warning', icon: <AlertTriangle className="h-3 w-3" /> },
    INFO: { variant: 'default', icon: <Info className="h-3 w-3" /> },
    DEBUG: { variant: 'secondary', icon: <Bug className="h-3 w-3" /> },
  }

  const { variant, icon } = variants[level]

  return (
    <Badge variant={variant} className="gap-1 text-xs">
      {icon}
      {level}
    </Badge>
  )
}
