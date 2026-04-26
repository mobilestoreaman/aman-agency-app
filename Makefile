# =============================================================
# Aman Agency — Makefile
# Usage: make <target>
# =============================================================

SHELL := /bin/bash
.DEFAULT_GOAL := help

BACKEND_DIR  := ./backend
INFRA_DIR    := ./infra
BINARY_NAME  := server
BINARY_PATH  := $(BACKEND_DIR)/bin/$(BINARY_NAME)

# Detect OS for open/xdg-open
UNAME := $(shell uname -s)
ifeq ($(UNAME),Darwin)
  OPEN := open
else
  OPEN := xdg-open
endif

# ── Help ──────────────────────────────────────────────────────────────────────

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}' \
	  | sort

# ── Development ───────────────────────────────────────────────────────────────

.PHONY: dev
dev: ## Start full stack in dev mode (hot-reload via docker-compose)
	docker compose \
	  -f $(INFRA_DIR)/docker-compose.yml \
	  -f $(INFRA_DIR)/docker-compose.dev.yml \
	  up --build

.PHONY: dev-backend
dev-backend: ## Run backend with air (hot-reload) — requires: go install github.com/cosmtrek/air@latest
	cd $(BACKEND_DIR) && air

.PHONY: run
run: build ## Build then run the backend binary directly
	$(BINARY_PATH)

.PHONY: build
build: ## Compile the backend binary to backend/bin/server
	@mkdir -p $(BACKEND_DIR)/bin
	cd $(BACKEND_DIR) && \
	CGO_ENABLED=0 go build -ldflags="-s -w" -trimpath -o ../$(BINARY_PATH) ./cmd/server

# ── Production Setup ──────────────────────────────────────────────────────────

.PHONY: setup-prod
setup-prod: ## Full first-run production setup (build → start → seed admin user)
	@chmod +x scripts/setup-prod.sh && ./scripts/setup-prod.sh

# ── Docker ────────────────────────────────────────────────────────────────────

.PHONY: up
up: ## Start all services (production-like)
	docker compose -f $(INFRA_DIR)/docker-compose.yml up --build -d

.PHONY: down
down: ## Stop and remove all containers
	docker compose -f $(INFRA_DIR)/docker-compose.yml down

.PHONY: prod
prod: ## Deploy production stack with resource limits
	docker compose \
	  -f $(INFRA_DIR)/docker-compose.yml \
	  -f $(INFRA_DIR)/docker-compose.prod.yml \
	  up --build -d

.PHONY: logs
logs: ## Tail backend container logs
	docker compose -f $(INFRA_DIR)/docker-compose.yml logs -f backend

.PHONY: ps
ps: ## Show running containers
	docker compose -f $(INFRA_DIR)/docker-compose.yml ps

# ── Testing ───────────────────────────────────────────────────────────────────

.PHONY: test
test: ## Run all backend tests
	cd $(BACKEND_DIR) && go test -race -cover ./...

.PHONY: test-verbose
test-verbose: ## Run tests with verbose output
	cd $(BACKEND_DIR) && go test -race -cover -v ./...

.PHONY: test-cover
test-cover: ## Generate HTML coverage report and open in browser
	cd $(BACKEND_DIR) && \
	go test -race -coverprofile=coverage.out ./... && \
	go tool cover -html=coverage.out -o coverage.html
	$(OPEN) $(BACKEND_DIR)/coverage.html

# ── Code Quality ──────────────────────────────────────────────────────────────

.PHONY: lint
lint: ## Run golangci-lint (requires: go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest)
	cd $(BACKEND_DIR) && golangci-lint run ./...

.PHONY: fmt
fmt: ## Format all Go source files
	cd $(BACKEND_DIR) && gofmt -w .

.PHONY: vet
vet: ## Run go vet
	cd $(BACKEND_DIR) && go vet ./...

.PHONY: tidy
tidy: ## Tidy Go module dependencies
	cd $(BACKEND_DIR) && go mod tidy

# ── Swagger Docs ──────────────────────────────────────────────────────────────

.PHONY: docs
docs: ## Regenerate Swagger docs (requires: go install github.com/swaggo/swag/cmd/swag@latest)
	cd $(BACKEND_DIR) && ./scripts/gen-docs.sh

.PHONY: swagger
swagger: ## Open Swagger UI in browser (app must be running)
	$(OPEN) http://localhost:3000/api/swagger/index.html

# ── Database ──────────────────────────────────────────────────────────────────

.PHONY: mongo-shell
mongo-shell: ## Open a MongoDB shell inside the running mongo container
	docker compose -f $(INFRA_DIR)/docker-compose.yml exec mongo mongosh aman_agency

.PHONY: mongo-seed
mongo-seed: ## Seed admin user locally (requires Go + local MongoDB)
	cd $(BACKEND_DIR) && go run ./cmd/seed

.PHONY: dev-seed
dev-seed: ## Seed admin user in the running dev stack
	docker compose \
	  -f $(INFRA_DIR)/docker-compose.yml \
	  -f $(INFRA_DIR)/docker-compose.dev.yml \
	  exec backend go run ./cmd/seed

.PHONY: prod-seed
prod-seed: ## Seed admin user in the running prod stack (run once after first deploy)
	docker compose \
	  -f $(INFRA_DIR)/docker-compose.yml \
	  exec backend ./seed

# ── Utilities ─────────────────────────────────────────────────────────────────

.PHONY: env
env: ## Copy .env.example to .env if .env does not exist
	@if [ ! -f $(BACKEND_DIR)/.env ]; then \
	  cp $(BACKEND_DIR)/.env.example $(BACKEND_DIR)/.env; \
	  echo "✓ Created backend/.env from .env.example — please fill in required values."; \
	else \
	  echo "backend/.env already exists — skipping."; \
	fi

.PHONY: gen-secret
gen-secret: ## Generate a random 64-char hex JWT secret (requires openssl)
	@echo "JWT_SECRET: $$(openssl rand -hex 64)"
	@echo "ENCRYPTION_KEY: $$(openssl rand -hex 32)"

.PHONY: clean
clean: ## Remove compiled binaries and coverage artifacts
	rm -rf $(BACKEND_DIR)/bin \
	       $(BACKEND_DIR)/coverage.out \
	       $(BACKEND_DIR)/coverage.html

.PHONY: health
health: ## Check backend health endpoint
	@curl -s http://localhost:$${APP_PORT:-3000}/api/health | python3 -m json.tool
