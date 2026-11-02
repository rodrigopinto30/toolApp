#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

docker build --quiet --target builder -t toolapp-frontend:builder frontend >/dev/null
exec docker run --rm --network none toolapp-frontend:builder node scripts/check-bundle-budgets.mjs
