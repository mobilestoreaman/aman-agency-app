#!/usr/bin/env bash
# gen-docs.sh — Regenerate Swagger docs from source annotations.
#
# Prerequisites:
#   go install github.com/swaggo/swag/cmd/swag@latest
#
# Usage (from the backend/ directory):
#   ./scripts/gen-docs.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "→ Generating Swagger docs..."
cd "${BACKEND_DIR}"

swag init \
  --generalInfo  cmd/server/main.go \
  --output       docs \
  --parseDependency \
  --parseInternal \
  --outputTypes  go,json,yaml

echo "✓ Docs written to backend/docs/"
