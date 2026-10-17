#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.dev.yml)

exec "${COMPOSE[@]}" run --rm --no-deps -T frontend sh -ec '
  echo "== ESLint";     npm run --silent lint
  echo "== TypeScript"; npm run --silent typecheck
  echo "== Jest";       npm test --silent -- "$@"
  echo "== npm audit";  npm audit --omit=dev --audit-level=high
  echo "== npm audit signatures"; npm audit signatures
' sh "$@"
