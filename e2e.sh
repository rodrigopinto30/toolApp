#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.dev.yml)
BASE_URL="https://localhost:8443"
info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

[[ -f .env && -f nginx/ca/dev-ca.crt ]] || fail "Missing .env or the development CA. Run ./start.sh first."
services="$("${COMPOSE[@]}" ps --status running --services 2>/dev/null)"
running() { grep -qx "$1" <<<"$services"; }
for service in nginx frontend backend mysql redis; do
  running "$service" || fail "The $service service is not running. Run ./start.sh first."
done

set -a; source .env; set +a
[[ "$PUBLIC_URL" == "$BASE_URL" ]] || fail "The E2E suite needs PUBLIC_URL=$BASE_URL in .env."
if running mailpit; then export STACK_MODE=dev; else export STACK_MODE=prod; fi

reset_rate_limits() {
  "${COMPOSE[@]}" exec -T redis sh -c '
    for pattern in "auth:rate:*" "auth:lockout:*"; do
      redis-cli --scan --pattern "$pattern" | xargs -r redis-cli del >/dev/null
    done'
}

run_sql() {
  "${COMPOSE[@]}" exec -T mysql sh -c 'MYSQL_PWD="$APP_DB_PASSWORD" exec mysql -u"$APP_DB_USER" "$MYSQL_DATABASE"'
}

verify_e2e_buyers() {
  run_sql <<'SQL'
UPDATE users SET email_verified_at = UTC_TIMESTAMP(6)
WHERE email LIKE 'e2e+buyer-%@example.com' AND email_verified_at IS NULL;
SQL
}

delete_e2e_users() {
  run_sql <<'SQL'
DELETE a FROM addresses a JOIN users u ON u.id = a.user_id WHERE u.email LIKE 'e2e+%@example.com';
DELETE b FROM billing_profiles b JOIN users u ON u.id = b.user_id WHERE u.email LIKE 'e2e+%@example.com';
DELETE FROM users WHERE email LIKE 'e2e+%@example.com';
SQL
  rm -rf frontend/e2e/.auth
}

trap delete_e2e_users EXIT
mkdir -p frontend/e2e/node_modules
[[ -t 0 && -t 1 ]] && TTY=() || TTY=(-T)
run_e2e() {
  "${COMPOSE[@]}" --profile e2e run --rm --no-deps "${TTY[@]}" --user "$(id -u):$(id -g)" "$@"
}

info "Provisioning the E2E buyers against the $STACK_MODE stack"
reset_rate_limits
"${COMPOSE[@]}" --profile e2e build e2e
run_e2e e2e sh -ec 'npm run --silent typecheck && exec npx playwright test --project=buyers'
verify_e2e_buyers
reset_rate_limits

info "Running the E2E suite against the $STACK_MODE stack"
run_e2e e2e sh -ec 'exec npx playwright test --project=chromium "$@"' sh "$@"
