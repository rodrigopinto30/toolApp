#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.dev.yml)
fail() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

[[ -f .env ]] || fail "Missing .env. Run ./start.sh first."
"${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -qx mysql \
  || fail "MySQL is not running. Run ./start.sh first."

set -a; source .env; set +a
export MYSQL_DATABASE="${MYSQL_DATABASE}_test"
export MYSQL_USER="$MYSQL_MIGRATOR_USER"
export MYSQL_PASSWORD="$MYSQL_MIGRATOR_PASSWORD"

exec "${COMPOSE[@]}" run --rm --no-deps -T \
  -e MYSQL_DATABASE -e MYSQL_USER -e MYSQL_PASSWORD \
  backend pytest "$@"
