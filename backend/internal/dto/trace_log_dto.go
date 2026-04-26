package dto

// TraceLogResponse is the standard trace log response for list/timeline views.
// It does NOT include request/response payloads to keep the response compact.
type TraceLogResponse struct {
	ID          string   `json:"id"`
	TraceID     string   `json:"trace_id"`
	SpanID      string   `json:"span_id"`
	Level       string   `json:"level"`
	Module      string   `json:"module"`
	Message     string   `json:"message"`
	Method      string   `json:"method,omitempty"`
	Path        string   `json:"path,omitempty"`
	StatusCode  int      `json:"status_code,omitempty"`
	LatencyMs   int64    `json:"latency_ms,omitempty"`
	UserID      string   `json:"user_id,omitempty"`
	UserEmail   string   `json:"user_email,omitempty"`
	UserRole    string   `json:"user_role,omitempty"`
	IPAddress   string   `json:"ip_address"`
	ErrorMessage string  `json:"error_message,omitempty"`
	Status      string   `json:"status"`
	Tags        []string `json:"tags,omitempty"`
	CreatedAt   string   `json:"created_at"`
}

// TraceLogDetailResponse is returned by GetByID — includes full details with payloads.
type TraceLogDetailResponse struct {
	TraceLogResponse
	RequestPayload  interface{} `json:"request_payload,omitempty"`
	ResponsePayload interface{} `json:"response_payload,omitempty"`
	StackTrace      string      `json:"stack_trace,omitempty"`
	Metadata        interface{} `json:"metadata,omitempty"`
}

// TraceLogFilterRequest represents query parameters for listing trace logs.
type TraceLogFilterRequest struct {
	TraceID   string `query:"trace_id"`
	Level     string `query:"level"`
	Module    string `query:"module"`
	Status    string `query:"status"`
	Search    string `query:"search"`
	UserID    string `query:"user_id"`
	FromDate  string `query:"from_date"`  // YYYY-MM-DD
	ToDate    string `query:"to_date"`    // YYYY-MM-DD
	Page      int    `query:"page"`
	Limit     int    `query:"limit"`
	SortOrder string `query:"sort_order"` // "asc" | "desc"
}

// TraceLogExportRequest represents query parameters for exporting trace logs.
type TraceLogExportRequest struct {
	TraceLogFilterRequest
	Format string `query:"format"` // "csv" | "json"
}
