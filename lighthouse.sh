#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.dev.yml)
fail() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

services="$("${COMPOSE[@]}" ps --status running --services 2>/dev/null)"
grep -qx nginx <<<"$services" || fail "The stack is not running. Run ./start.sh prod first."
if grep -qx mailpit <<<"$services"; then
  fail "Lighthouse measures the production build. Run ./stop.sh && ./start.sh prod first."
fi

"${COMPOSE[@]}" --profile e2e build e2e
exec "${COMPOSE[@]}" --profile e2e run --rm --no-deps -T --user "$(id -u):$(id -g)" \
  e2e node lighthouse.mjs
