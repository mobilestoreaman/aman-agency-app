#!/usr/bin/env bash
# ============================================================
# Aman Agency — First-time setup script
# Run from project root: ./scripts/setup.sh
# ============================================================
set -euo pipefail

INFRA_DIR="$(cd "$(dirname "$0")/../infra" && pwd)"

echo "🚀  Aman Agency — Setup"
echo "────────────────────────"

# 1. Create .env from example if not exists
if [ ! -f "$INFRA_DIR/.env" ]; then
  cp "$INFRA_DIR/.env.example" "$INFRA_DIR/.env"
  echo "✅  Created infra/.env from .env.example"
  echo "⚠️   Edit infra/.env and fill in all secrets before continuing."
  exit 0
else
  echo "ℹ️   infra/.env already exists — skipping copy"
fi

# 2. Ensure mongo-data dir exists (for bind mounts in dev)
mkdir -p "$INFRA_DIR/mongo-data"
echo "✅  mongo-data directory ready"

# 3. Build and start (production mode with resource limits)
echo ""
echo "Starting services (production mode)..."
docker compose \
  -f "$INFRA_DIR/docker-compose.yml" \
  -f "$INFRA_DIR/docker-compose.prod.yml" \
  up -d --build

echo ""
echo "✅  All services started."
echo "   App     →  http://localhost"
echo "   API     →  http://localhost/api"
echo "   Health  →  http://localhost/api/health"
echo ""
echo "──────────────────────────────────────────────"
echo "🔒  To enable HTTPS (Let's Encrypt):"
echo "   1. Set DOMAIN and CERTBOT_EMAIL in infra/.env"
echo "   2. Run: ./scripts/init-ssl.sh"
echo "──────────────────────────────────────────────"
echo ""
echo "For dev mode with hot reload + Mongo Express:"
echo "  docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile dev up"
