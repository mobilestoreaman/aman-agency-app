#!/usr/bin/env bash
# ============================================================
# Aman Agency — Build & Package Script
#
# Run this on the SOURCE machine (your dev/CI box) to build
# Docker images and bundle everything needed for deployment.
#
# What it does:
#   1. Builds backend and frontend Docker images
#   2. Saves images as compressed tarballs
#   3. Packages infra/ config files into a single release bundle
#
# Output:
#   dist/
#   ├── aman-backend.tar.gz
#   ├── aman-frontend.tar.gz
#   └── aman-agency-infra.tar.gz   ← compose files, nginx, mongo-init
#
# Usage:
#   ./scripts/build.sh [TAG]
#
#   TAG defaults to the current git short SHA, e.g. "abc1234".
#   You can also pass a version tag:  ./scripts/build.sh v1.2.0
# ============================================================
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INFRA_DIR="$PROJECT_ROOT/infra"
DIST_DIR="$PROJECT_ROOT/dist"

# ── Tag ───────────────────────────────────────────────────────
TAG="${1:-$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null || echo "latest")}"

echo ""
echo "┌──────────────────────────────────────────────────────┐"
echo "│  Aman Agency — Build & Package                       │"
echo "│  Tag: $TAG"
echo "└──────────────────────────────────────────────────────┘"
echo ""

# ── Prereqs ──────────────────────────────────────────────────
for cmd in docker git tar; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "❌  '$cmd' is required but not found in PATH."
    exit 1
  fi
done

# ── Prepare dist dir ─────────────────────────────────────────
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"
echo "📁  Output directory: $DIST_DIR"

# ── Build backend image ──────────────────────────────────────
echo ""
echo "▶  Building backend image (aman-backend:$TAG)..."
docker build \
  --file "$INFRA_DIR/backend.Dockerfile" \
  --tag  "aman-backend:$TAG" \
  --tag  "aman-backend:latest" \
  "$PROJECT_ROOT"
echo "✅  Backend image built."

# ── Build frontend image ─────────────────────────────────────
echo ""
echo "▶  Building frontend image (aman-frontend:$TAG)..."
docker build \
  --file "$INFRA_DIR/frontend.Dockerfile" \
  --build-arg VITE_API_BASE_URL=/api \
  --tag  "aman-frontend:$TAG" \
  --tag  "aman-frontend:latest" \
  "$PROJECT_ROOT"
echo "✅  Frontend image built."

# ── Save images to tarballs ───────────────────────────────────
echo ""
echo "▶  Saving images to $DIST_DIR ..."

docker save "aman-backend:$TAG"  | gzip > "$DIST_DIR/aman-backend.tar.gz"
echo "   ✓  aman-backend.tar.gz  ($(du -sh "$DIST_DIR/aman-backend.tar.gz" | cut -f1))"

docker save "aman-frontend:$TAG" | gzip > "$DIST_DIR/aman-frontend.tar.gz"
echo "   ✓  aman-frontend.tar.gz ($(du -sh "$DIST_DIR/aman-frontend.tar.gz" | cut -f1))"

# ── Bundle infra config ───────────────────────────────────────
echo ""
echo "▶  Bundling infra configuration..."

# Write the image tag used so deploy.sh can reference it exactly
echo "$TAG" > "$DIST_DIR/.image-tag"

# Copy only files deploy.sh needs (no Dockerfiles — images are pre-built)
tar \
  --create \
  --gzip \
  --file "$DIST_DIR/aman-agency-infra.tar.gz" \
  --directory "$PROJECT_ROOT" \
  --exclude="infra/.env" \
  infra/docker-compose.yml \
  infra/docker-compose.prod.yml \
  infra/nginx \
  infra/mongo-init \
  scripts/deploy.sh \
  scripts/init-ssl.sh

echo "   ✓  aman-agency-infra.tar.gz"

# ── Write image tag manifest ──────────────────────────────────
cat > "$DIST_DIR/manifest.txt" <<EOF
Aman Agency Release
Tag:        $TAG
Built at:   $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Git commit: $(git -C "$PROJECT_ROOT" rev-parse HEAD 2>/dev/null || echo "unknown")

Files:
  aman-backend.tar.gz       — Go Fiber API image
  aman-frontend.tar.gz      — React PWA (nginx) image
  aman-agency-infra.tar.gz  — Compose files, nginx config, mongo-init
  manifest.txt              — This file

Deploy instructions:
  1. Copy ALL files in this dist/ directory to the target server.
  2. On the target server, extract aman-agency-infra.tar.gz and run:
       tar xzf aman-agency-infra.tar.gz
       bash scripts/deploy.sh
  3. Follow the prompts to set up infra/.env if it is missing.
EOF

echo ""
echo "┌──────────────────────────────────────────────────────┐"
echo "│  ✅  Build complete!                                  │"
echo "└──────────────────────────────────────────────────────┘"
echo ""
echo "  dist/ contents:"
ls -lh "$DIST_DIR"
echo ""
echo "Next step — copy dist/ to the target server, then run:"
echo "  tar xzf aman-agency-infra.tar.gz"
echo "  bash scripts/deploy.sh"
echo ""
echo "Example (scp):"
echo "  scp -r dist/ user@your-server:/opt/aman-agency/"
echo ""
