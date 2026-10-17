#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.dev.yml)
fail() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

[[ $# -gt 0 ]] || fail "Usage: ./front.sh <command> [args...]"
[[ -t 0 && -t 1 ]] && TTY=() || TTY=(-T)

if "${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -qx frontend; then
  "${COMPOSE[@]}" exec "${TTY[@]}" frontend "$@"
  if [[ "$1" == npm ]]; then
    "${COMPOSE[@]}" exec -T frontend sh -c \
      "sha256sum package-lock.json | cut -d ' ' -f 1 > node_modules/.lock-hash"
  fi
else
  "${COMPOSE[@]}" run --rm --no-deps "${TTY[@]}" frontend "$@"
fi
