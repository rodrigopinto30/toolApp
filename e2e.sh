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

prepare_e2e_accounts() {
  run_sql <<'SQL'
UPDATE users SET email_verified_at = UTC_TIMESTAMP(6)
WHERE (email LIKE 'e2e+buyer-%@example.com' OR email LIKE 'e2e+admin-%@example.com') AND email_verified_at IS NULL;
UPDATE users SET role = 'admin' WHERE email LIKE 'e2e+admin-%@example.com';
SQL
}

delete_e2e_users() {
  run_sql <<'SQL'
DELETE p FROM payments p JOIN orders o ON o.id = p.order_id JOIN users u ON u.id = o.user_id WHERE u.email LIKE 'e2e+%@example.com';
UPDATE products p
  JOIN (SELECT DISTINCT r.product_id FROM reviews r JOIN users u ON u.id = r.user_id WHERE u.email LIKE 'e2e+%@example.com') touched ON touched.product_id = p.id
  LEFT JOIN (SELECT r.product_id, ROUND(AVG(r.rating), 2) AS average, COUNT(*) AS total FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.status = 'approved' AND u.email NOT LIKE 'e2e+%@example.com' GROUP BY r.product_id) kept ON kept.product_id = p.id
  SET p.rating_avg = COALESCE(kept.average, 0), p.rating_count = COALESCE(kept.total, 0);
DELETE r FROM reviews r JOIN users u ON u.id = r.user_id WHERE u.email LIKE 'e2e+%@example.com';
UPDATE audit_logs a JOIN users u ON u.id = a.actor_id SET a.actor_id = NULL WHERE u.email LIKE 'e2e+%@example.com';
UPDATE order_status_history h JOIN users u ON u.id = h.changed_by SET h.changed_by = NULL WHERE u.email LIKE 'e2e+%@example.com';
DELETE h FROM order_status_history h JOIN orders o ON o.id = h.order_id JOIN users u ON u.id = o.user_id WHERE u.email LIKE 'e2e+%@example.com';
DELETE i FROM order_items i JOIN orders o ON o.id = i.order_id JOIN users u ON u.id = o.user_id WHERE u.email LIKE 'e2e+%@example.com';
DELETE r FROM coupon_redemptions r JOIN users u ON u.id = r.user_id WHERE u.email LIKE 'e2e+%@example.com';
DELETE o FROM orders o JOIN users u ON u.id = o.user_id WHERE u.email LIKE 'e2e+%@example.com';
DELETE a FROM addresses a JOIN users u ON u.id = a.user_id WHERE u.email LIKE 'e2e+%@example.com';
DELETE b FROM billing_profiles b JOIN users u ON u.id = b.user_id WHERE u.email LIKE 'e2e+%@example.com';
DELETE x FROM exchange_rates x JOIN users u ON u.id = x.created_by WHERE u.email LIKE 'e2e+%@example.com';
DELETE v FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.slug LIKE 'e2e-%';
DELETE FROM products WHERE slug LIKE 'e2e-%';
DELETE FROM brands WHERE slug LIKE 'e2e-%';
DELETE FROM categories WHERE slug LIKE 'e2e-%';
DELETE v FROM attribute_values v JOIN attributes a ON a.id = v.attribute_id WHERE a.code LIKE 'e2e_%';
DELETE FROM attributes WHERE code LIKE 'e2e_%';
DELETE FROM coupons WHERE code LIKE 'E2E-%';
DELETE FROM shipping_zones WHERE code LIKE 'e2e-%';
DELETE FROM pickup_points WHERE name LIKE 'E2E %';
DELETE FROM users WHERE email LIKE 'e2e+%@example.com';
SQL
  rm -rf frontend/e2e/.auth
}

warm_up_revalidation() {
  "${COMPOSE[@]}" exec -T frontend node -e 'fetch("http://localhost:3000/api/revalidate", { method: "POST" }).catch(() => process.exit(1))'
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
reset_rate_limits
run_e2e e2e sh -ec 'exec npx playwright test --project=community'
prepare_e2e_accounts
reset_rate_limits
[[ "$STACK_MODE" == prod ]] || warm_up_revalidation

info "Running the E2E suite against the $STACK_MODE stack"
run_e2e e2e sh -ec 'exec npx playwright test --project=catalog-admin "$@"' sh "$@"
