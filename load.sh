#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.dev.yml)
RAMP=15
HOLD=45
DOWN=5
SERVICES=(nginx frontend backend mysql redis)
PAGE_RATES=(20 40 80)
API_RATES=(100 200 400 800)
fail() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

running="$("${COMPOSE[@]}" ps --status running --services 2>/dev/null)"
grep -qx nginx <<<"$running" || fail "The stack is not running. Run ./start.sh prod first."
if grep -qx mailpit <<<"$running"; then
  fail "Load tests measure the production build. Run ./stop.sh && ./start.sh prod first."
fi

declare -A CONTAINER CPUS
for service in "${SERVICES[@]}"; do
  CONTAINER[$service]="$("${COMPOSE[@]}" ps -q "$service" | head -1)"
  CPUS[$service]="$(docker inspect --format '{{.HostConfig.NanoCpus}}' "${CONTAINER[$service]}")"
done

sample() {
  sleep "$RAMP"
  local end=$((SECONDS + HOLD))
  while ((SECONDS < end)); do
    docker stats --no-stream --format '{{.ID}} {{.CPUPerc}}' "${CONTAINER[@]}"
  done
}

saturation() {
  local service="$1" stats="$2"
  awk -v id="${CONTAINER[$service]:0:12}" -v cpus="${CPUS[$service]}" '
    $1 == id { sub("%", "", $2); total += $2; count += 1 }
    END { printf "%3.0f", count ? total / count / (cpus / 1e9) : 0 }
  ' "$stats"
}

step() {
  local scenario="$1" rate="$2" stats output verdict=pass
  stats="$(mktemp)"
  sample >"$stats" &
  output="$("${COMPOSE[@]}" --profile load run --rm --no-deps -T \
    -e SCENARIO="$scenario" -e RATE="$rate" -e RAMP="${RAMP}s" -e HOLD="${HOLD}s" -e DOWN="${DOWN}s" \
    -e FIRST_VISIT_SHARE="${FIRST_VISIT_SHARE:-0.2}" \
    k6 run --quiet /scripts/store.js 2>/dev/null)" || verdict=over
  wait
  read -r _ median p95 p99 failed dropped <<<"$(grep -a '^RESULT' <<<"$output")"
  printf '%-6s %5s/s %8s %8s %8s %7s%% %8s%%' \
    "$scenario" "$rate" "${median:-?}" "${p95:-?}" "${p99:-?}" "${failed:-?}" "${dropped:-?}"
  for service in "${SERVICES[@]}"; do
    printf ' %8s%%' "$(saturation "$service" "$stats")"
  done
  printf ' %6s\n' "$verdict"
  rm -f "$stats"
}

ladder() {
  local scenario="$1"
  shift
  for rate in "$@"; do
    step "$scenario" "$rate"
  done
}

printf '%-6s %7s %8s %8s %8s %8s %9s' scene rate 'p50 ms' 'p95 ms' 'p99 ms' failed dropped
printf ' %9s' "${SERVICES[@]}"
printf ' %6s\n' limits
if [[ $# -gt 0 ]]; then
  ladder "$@"
else
  ladder pages "${PAGE_RATES[@]}"
  ladder api "${API_RATES[@]}"
fi
