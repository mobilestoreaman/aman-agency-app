#!/usr/bin/env bash
# ============================================================
# Aman Agency — Production Setup Script
#
# Run this ONCE on a fresh server to:
#   1. Validate prerequisites
#   2. Configure environment
#   3. Start the full stack
#   4. Wait for services to be healthy
#   5. Seed the first admin user
#
# Usage:
#   chmod +x scripts/setup-prod.sh
#   ./scripts/setup-prod.sh
#
# Optional env overrides before running:
#   SEED_ADMIN_EMAIL=you@example.com \
#   SEED_ADMIN_PASSWORD=MySecurePass1! \
#   ./scripts/setup-prod.sh
# ============================================================

set -euo pipefail

INFRA_DIR="$(cd "$(dirname "$0")/../infra" && pwd)"
ENV_FILE="$INFRA_DIR/.env"
ENV_EXAMPLE="$INFRA_DIR/.env.example"
COMPOSE_BASE="$INFRA_DIR/docker-compose.yml"
COMPOSE_PROD="$INFRA_DIR/docker-compose.prod.yml"

# ── Colors ────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}▶ $*${RESET}"; }
success() { echo -e "${GREEN}✓ $*${RESET}"; }
warn()    { echo -e "${YELLOW}⚠ $*${RESET}"; }
error()   { echo -e "${RED}✗ $*${RESET}" >&2; exit 1; }

echo -e "${BOLD}"
echo "╔══════════════════════════════════════════╗"
echo "║     Aman Agency — Production Setup       ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${RESET}"

# ── Step 1: Prerequisites ─────────────────────────────────────
info "Checking prerequisites..."

command -v docker  >/dev/null 2>&1 || error "Docker is not installed. Install from https://docs.docker.com/get-docker/"
command -v docker  >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 || \
  error "Docker Compose v2 is not available. Ensure Docker Desktop or 'docker-compose-plugin' is installed."

DOCKER_VERSION=$(docker --version | grep -oE '[0-9]+\.[0-9]+' | head -1)
success "Docker $DOCKER_VERSION found"

# ── Step 2: Environment file ──────────────────────────────────
info "Checking environment configuration..."

if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$ENV_EXAMPLE" ]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    warn "Created $ENV_FILE from example — please fill in all values before continuing."
    echo ""
    echo "  Required values to set in infra/.env:"
    echo "    MONGO_URI              — use: mongodb://aman_app:<password>@mongo:27017/aman_agency?authSource=aman_agency"
    echo "    MONGO_APP_PASSWORD     — password for the aman_app DB user"
    echo "    MONGO_INITDB_ROOT_PASSWORD — MongoDB root password"
    echo "    JWT_SECRET             — run: openssl rand -hex 64"
    echo "    ENCRYPTION_KEY         — run: openssl rand -hex 32"
    echo "    DOMAIN                 — your domain name (e.g. amanagency.com)"
    echo "    CERTBOT_EMAIL          — your email for Let's Encrypt"
    echo ""
    read -rp "Press Enter once you have filled in infra/.env, or Ctrl+C to abort..."
  else
    error "infra/.env not found and no .env.example to copy from. Create infra/.env manually."
  fi
fi

# Validate required variables are set and non-empty
check_var() {
  local key="$1"
  local val
  val=$(grep -E "^${key}=" "$ENV_FILE" | cut -d= -f2- | tr -d ' ')
  if [ -z "$val" ] || [[ "$val" == *"replace_with"* ]] || [[ "$val" == *"<"* ]]; then
    error "Required variable '$key' is not set or still has a placeholder value in infra/.env"
  fi
}

check_var "MONGO_URI"
check_var "MONGO_APP_PASSWORD"
check_var "MONGO_INITDB_ROOT_PASSWORD"
check_var "JWT_SECRET"
check_var "ENCRYPTION_KEY"
check_var "DOMAIN"

# Check JWT_SECRET isn't the doubled typo pattern
JWT_LINE=$(grep -E "^JWT_SECRET=" "$ENV_FILE")
if echo "$JWT_LINE" | grep -qE "^JWT_SECRET=JWT_SECRET="; then
  error "JWT_SECRET has a doubled prefix (JWT_SECRET=JWT_SECRET=...). Fix infra/.env line: $JWT_LINE"
fi

success "Environment file looks good"

# ── Step 3: Generate secrets if missing ──────────────────────
JWT_VAL=$(grep -E "^JWT_SECRET=" "$ENV_FILE" | cut -d= -f2- | tr -d ' ')
ENC_VAL=$(grep -E "^ENCRYPTION_KEY=" "$ENV_FILE" | cut -d= -f2- | tr -d ' ')

if [ ${#JWT_VAL} -lt 32 ]; then
  warn "JWT_SECRET looks weak (< 32 chars). Generate a strong one with: openssl rand -hex 64"
fi
if [ ${#ENC_VAL} -ne 64 ]; then
  warn "ENCRYPTION_KEY should be exactly 64 hex chars (32 bytes). Generate with: openssl rand -hex 32"
fi

# ── Step 4: Build and start the stack ────────────────────────
info "Building and starting production stack..."

docker compose \
  -f "$COMPOSE_BASE" \
  -f "$COMPOSE_PROD" \
  --env-file "$ENV_FILE" \
  up --build -d

success "Stack started"

# ── Step 5: Wait for services to be healthy ──────────────────
info "Waiting for services to become healthy (up to 3 minutes)..."

TIMEOUT=180
ELAPSED=0
INTERVAL=10

while [ $ELAPSED -lt $TIMEOUT ]; do
  # Check all required services are healthy or running
  UNHEALTHY=$(docker compose -f "$COMPOSE_BASE" -f "$COMPOSE_PROD" \
    ps --format json 2>/dev/null \
    | grep -c '"Health":"unhealthy"' || true)
  STARTING=$(docker compose -f "$COMPOSE_BASE" -f "$COMPOSE_PROD" \
    ps --format json 2>/dev/null \
    | grep -c '"Health":"starting"' || true)

  if [ "$UNHEALTHY" -gt 0 ]; then
    error "One or more services are unhealthy. Run 'docker compose -f infra/docker-compose.yml logs' to investigate."
  fi

  if [ "$STARTING" -eq 0 ]; then
    break
  fi

  echo -n "  waiting... (${ELAPSED}s)"$'\r'
  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
done

if [ $ELAPSED -ge $TIMEOUT ]; then
  warn "Timed out waiting for healthy status. Check logs with: docker compose -f infra/docker-compose.yml logs"
fi

success "All services healthy"

# ── Step 6: Seed the admin user ───────────────────────────────
info "Seeding admin user..."

SEED_CMD="docker compose -f $COMPOSE_BASE exec"

# Pass optional overrides into the container
SEED_ENV_ARGS=""
[ -n "${SEED_ADMIN_EMAIL:-}"    ] && SEED_ENV_ARGS="$SEED_ENV_ARGS -e SEED_ADMIN_EMAIL=$SEED_ADMIN_EMAIL"
[ -n "${SEED_ADMIN_NAME:-}"     ] && SEED_ENV_ARGS="$SEED_ENV_ARGS -e SEED_ADMIN_NAME=$SEED_ADMIN_NAME"
[ -n "${SEED_ADMIN_PASSWORD:-}" ] && SEED_ENV_ARGS="$SEED_ENV_ARGS -e SEED_ADMIN_PASSWORD=$SEED_ADMIN_PASSWORD"

# shellcheck disable=SC2086
docker compose -f "$COMPOSE_BASE" exec $SEED_ENV_ARGS backend ./seed

# ── Done ──────────────────────────────────────────────────────
DOMAIN_VAL=$(grep -E "^DOMAIN=" "$ENV_FILE" | cut -d= -f2- | tr -d ' ')

echo ""
echo -e "${GREEN}${BOLD}"
echo "╔══════════════════════════════════════════╗"
echo "║        Setup Complete — You're Live!     ║"
echo "╠══════════════════════════════════════════╣"
printf "║  App  : https://%-25s║\n" "$DOMAIN_VAL"
printf "║  API  : https://%s/api/health%-6s║\n" "$DOMAIN_VAL" ""
echo "╚══════════════════════════════════════════╝"
echo -e "${RESET}"
echo "Next steps:"
echo "  • Point your DNS A record for $DOMAIN_VAL to this server's IP"
echo "  • TLS certificates will be provisioned automatically by Certbot"
echo "  • Monitor logs: docker compose -f infra/docker-compose.yml logs -f"
echo ""
