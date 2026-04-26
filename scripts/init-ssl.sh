#!/usr/bin/env bash
# ============================================================
# Aman Agency — Let's Encrypt SSL Bootstrap
#
# Run ONCE after first deploy to provision TLS certificates.
# Subsequent renewals are handled automatically by the
# certbot container (runs every 12 hours via docker-compose).
#
# Prerequisites:
#   1. DNS A record for $DOMAIN must point to this server.
#   2. Port 80 must be publicly reachable (ACME challenge).
#   3. infra/.env must have DOMAIN and CERTBOT_EMAIL set.
#
# Usage:
#   cd aman-agency-app
#   ./scripts/init-ssl.sh
# ============================================================
set -euo pipefail

INFRA_DIR="$(cd "$(dirname "$0")/../infra" && pwd)"

# Load .env
if [ ! -f "$INFRA_DIR/.env" ]; then
  echo "❌  infra/.env not found. Run ./scripts/setup.sh first."
  exit 1
fi
set -a; source "$INFRA_DIR/.env"; set +a

: "${DOMAIN:?  DOMAIN must be set in infra/.env}"
: "${CERTBOT_EMAIL:?  CERTBOT_EMAIL must be set in infra/.env}"

echo "🔒  Provisioning TLS for: $DOMAIN"
echo "    Email : $CERTBOT_EMAIL"
echo ""

# ── Step 1: Start nginx in HTTP-only mode (serves ACME challenge)
echo "▶  Starting nginx (HTTP only)..."
docker compose -f "$INFRA_DIR/docker-compose.yml" up -d nginx

# ── Step 2: Run Certbot to obtain certificate
echo "▶  Running Certbot (webroot challenge)..."
docker run --rm \
  -v "certbot_certs:/etc/letsencrypt" \
  -v "certbot_www:/var/www/certbot" \
  certbot/certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$CERTBOT_EMAIL" \
    --agree-tos \
    --no-eff-email \
    --force-renewal \
    -d "$DOMAIN" \
    -d "www.$DOMAIN"

echo "✅  Certificate obtained."

# ── Step 3: Activate ssl.conf — replace default.conf HTTP block
# Switch default.conf to redirect-only mode
echo "▶  Activating ssl.conf..."
cp "$INFRA_DIR/nginx/conf.d/default.conf" \
   "$INFRA_DIR/nginx/conf.d/default.conf.http-backup"

cat > "$INFRA_DIR/nginx/conf.d/default.conf" <<EOF
# HTTP → HTTPS redirect (ssl.conf handles HTTPS)
# ACME challenge served from /var/www/certbot
upstream backend  { server backend:3000;  keepalive 32; }
upstream frontend { server frontend:80;   keepalive 16; }

server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}
EOF

# Substitute domain into ssl.conf template
export NGINX_DOMAIN="$DOMAIN"
envsubst '${NGINX_DOMAIN}' \
  < "$INFRA_DIR/nginx/conf.d/ssl.conf" \
  > /tmp/ssl_rendered.conf && \
  mv /tmp/ssl_rendered.conf "$INFRA_DIR/nginx/conf.d/ssl.conf"

# ── Step 4: Reload nginx with TLS config
echo "▶  Reloading nginx..."
docker compose -f "$INFRA_DIR/docker-compose.yml" \
  -f "$INFRA_DIR/docker-compose.prod.yml" up -d nginx

echo ""
echo "✅  TLS is active!"
echo "   https://$DOMAIN"
echo "   https://www.$DOMAIN"
echo ""
echo "ℹ️  Certbot auto-renews every 12 hours via the certbot service."
echo "   Check logs: docker logs aman_certbot"
