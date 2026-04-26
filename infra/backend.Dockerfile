# ============================================================
# Backend — Multi-stage Dockerfile (Go Fiber)
# Stage 1 : builder  — compiles the binary
# Stage 2 : runtime  — minimal Alpine image (~12 MB final)
# ============================================================

# ── Stage 1: Builder ─────────────────────────────────────────
FROM golang:1.22-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /build

# Cache dependency layer separately (faster rebuilds)
COPY backend/go.mod backend/go.sum ./
RUN go mod download && go mod verify

# Copy source
COPY backend/ .

# Build server binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build \
    -ldflags="-s -w -X main.Version=$(git describe --tags --always --dirty 2>/dev/null || echo dev)" \
    -trimpath \
    -o /build/server \
    ./cmd/server

# Build seed binary (used for first-run admin bootstrap)
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w" -trimpath \
    -o /build/seed \
    ./cmd/seed

# ── Stage 2: Runtime ─────────────────────────────────────────
FROM alpine:3.19

# Security: non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# TLS certs + timezone data (needed for HTTPS outbound + time ops)
RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

# Copy binaries from builder
COPY --from=builder /build/server ./server
COPY --from=builder /build/seed   ./seed

# Storage directory for PDF invoices
RUN mkdir -p /app/storage/invoices && chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3000/api/health || exit 1

ENTRYPOINT ["./server"]
