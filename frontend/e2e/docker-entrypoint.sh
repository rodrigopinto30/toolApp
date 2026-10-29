#!/bin/sh
set -eu

nssdb="$HOME/.pki/nssdb"
if [ ! -f "$nssdb/cert9.db" ]; then
  mkdir -p "$nssdb"
  certutil -d "sql:$nssdb" -N --empty-password
fi
certutil -d "sql:$nssdb" -A -t "C,," -n toolapp-dev-ca -i "$NODE_EXTRA_CA_CERTS"

exec "$@"
