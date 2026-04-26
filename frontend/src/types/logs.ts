export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
export type LogStatus = 'success' | 'failure'
export type LogModule = 'Auth' | 'Sales' | 'Inventory' | 'Billing' | 'Payments' | 'Notifications' | 'Reports' | 'System' | 'Upload'

export interface TraceLog {
  id: string
  trace_id: string
  span_id: string
  level: LogLevel
  module: LogModule
  message: string
  method: string
  path: string
  status_code: number
  latency_ms: number
  user_id?: string
  user_email?: string
  user_role?: string
  ip_address: string
  error_message?: string
  status: LogStatus
  tags?: string[]
  created_at: string
}

export interface TraceLogDetail extends TraceLog {
  request_payload?: unknown
  response_payload?: unknown
  stack_trace?: string
  metadata?: Record<string, unknown>
}

export interface TraceLogFilters {
  search?: string
  level?: LogLevel | ''
  module?: LogModule | ''
  status?: LogStatus | ''
  from_date?: string
  to_date?: string
  user_id?: string
  trace_id?: string
  page?: number
  limit?: number
  sort_order?: 'asc' | 'desc'
}
