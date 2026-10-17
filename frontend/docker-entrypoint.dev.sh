#!/bin/sh
set -eu

expected="$(sha256sum package-lock.json | cut -d ' ' -f 1)"
if [ "$(cat node_modules/.lock-hash 2>/dev/null || true)" != "$expected" ]; then
  echo "package-lock.json changed: installing dependencies"
  npm ci --no-audit
  echo "$expected" > node_modules/.lock-hash
fi

exec "$@"
