#!/usr/bin/env bash
# Starts the whole project in Docker.  Usage: ./start.sh [dev|prod]   (default: dev)
set -euo pipefail
cd "$(dirname "$0")"

MODE="${1:-dev}"
case "$MODE" in
  dev)  COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.dev.yml); EXTRA=(--renew-anon-volumes) ;;
  prod) COMPOSE=(docker compose -f docker-compose.yml); EXTRA=() ;;
  *)    echo "Usage: $0 [dev|prod]" >&2; exit 1 ;;
esac

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || fail "Docker is not installed."
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is not available."
docker info >/dev/null 2>&1 || fail "The Docker daemon is not responding (is it running? is your user in the docker group?)."

# 1) .env with random secrets: created on the first run; keys added to .env.example
#    later are appended to an existing .env (existing values are never touched).
random_secret() { od -An -tx1 -N32 /dev/urandom | tr -d ' \n'; }
render_line() {
  if [[ "$1" == *=__GENERATE__ ]]; then echo "${1%=__GENERATE__}=$(random_secret)"; else echo "$1"; fi
}
if [[ ! -f .env ]]; then
  info "Generating .env with random secrets"
  umask 077
  while IFS= read -r line; do render_line "$line"; done < .env.example > .env
  umask 022
else
  missing=()
  while IFS= read -r line; do
    [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)= ]] || continue
    grep -q "^${BASH_REMATCH[1]}=" .env || missing+=("$line")
  done < .env.example
  if (( ${#missing[@]} )); then
    info "Adding new keys to .env: ${missing[*]%%=*}"
    { echo; echo "# Added by start.sh"; for line in "${missing[@]}"; do render_line "$line"; done; } >> .env
  fi
fi

CERTS_RENEWED=0
# 2) Local development CA + TLS certificate for localhost (generated inside a container)
if [[ ! -f nginx/ca/dev-ca.crt || ! -f nginx/certs/tls.crt || ! -f nginx/certs/tls.key ]]; then
  info "Generating development TLS certificates"
  docker run --rm --user "$(id -u):$(id -g)" --entrypoint sh \
    -v "$PWD/nginx/gen-certs.sh:/gen-certs.sh:ro" -v "$PWD/nginx/ca:/ca" -v "$PWD/nginx/certs:/certs" \
    alpine/openssl /gen-certs.sh >/dev/null 2>&1 || fail "Could not generate the certificates."
  CERTS_RENEWED=1
fi

# Mount points for the frontend volumes in dev: if missing, Docker creates them as root.
mkdir -p frontend/node_modules frontend/.next

# 3) Build + start, waiting until every healthcheck passes
info "Starting services in $MODE mode (the first run takes a few minutes)"
if ! "${COMPOSE[@]}" up -d --build --remove-orphans --wait --wait-timeout 300 "${EXTRA[@]}"; then
  "${COMPOSE[@]}" ps
  fail "Some service is not healthy. Check the logs with: ${COMPOSE[*]} logs -f <service>"
fi

# If nginx was already running, reload the new certificate.
if [[ "$CERTS_RENEWED" == 1 ]]; then
  "${COMPOSE[@]}" exec -T nginx nginx -s reload >/dev/null 2>&1 || true
fi

set -a; source .env; set +a
"${COMPOSE[@]}" ps --format 'table {{.Service}}\t{{.Status}}'
echo
info "Ready:"
echo "   Store:    https://localhost:${HTTPS_PORT:-8443}"
if [[ "$MODE" == dev ]]; then
  echo "   API docs: https://localhost:${HTTPS_PORT:-8443}/api/docs"
  echo "   Mailpit:  http://localhost:${MAILPIT_PORT:-8025}"
  echo "   DB UI:    http://localhost:${PHPMYADMIN_PORT:-8081}  (user: ${MYSQL_USER}, password: MYSQL_PASSWORD in .env)"
fi
echo "   Admin:    ${ADMIN_EMAIL} (password: ADMIN_PASSWORD in .env)"
echo "   To make your browser trust HTTPS, import the local CA once: nginx/ca/dev-ca.crt"
