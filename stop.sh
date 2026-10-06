#!/usr/bin/env bash
# Stops the whole project.  Usage: ./stop.sh [--clean]
#   --clean  also deletes the volumes (database, Redis, uploaded images).
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.dev.yml)

if [[ "${1:-}" == "--clean" ]]; then
  read -r -p "This DELETES the database, Redis and the uploaded images. Continue? [y/N] " answer
  if [[ "$answer" =~ ^[yY]$ ]]; then
    "${COMPOSE[@]}" down --volumes --remove-orphans
  else
    echo "Cancelled."; exit 0
  fi
elif [[ -n "${1:-}" ]]; then
  echo "Usage: $0 [--clean]" >&2; exit 1
else
  "${COMPOSE[@]}" down --remove-orphans
fi
echo "Project stopped."
