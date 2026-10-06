#!/bin/sh
# Runs INSIDE the alpine/openssl container (invoked by start.sh).
# /ca    -> local development CA (its key is NOT mounted into nginx)
# /certs -> server certificate used by nginx
set -eu

if [ ! -f /ca/dev-ca.crt ] || [ ! -f /ca/dev-ca.key ]; then
  # CA restricted with nameConstraints: it can only sign localhost / 127.0.0.1.
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -subj "/CN=ToolApp Dev CA (localhost only)" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -addext "nameConstraints=critical,permitted;DNS:localhost,permitted;IP:127.0.0.1/255.255.255.255" \
    -keyout /ca/dev-ca.key -out /ca/dev-ca.crt
  chmod 600 /ca/dev-ca.key
  rm -f /certs/tls.crt /certs/tls.key
fi

if [ ! -f /certs/tls.crt ] || [ ! -f /certs/tls.key ]; then
  cat > /tmp/ext.cnf <<'EXT'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:localhost,IP:127.0.0.1
EXT
  openssl req -newkey rsa:2048 -nodes -subj "/CN=localhost" \
    -keyout /certs/tls.key -out /tmp/tls.csr
  openssl x509 -req -in /tmp/tls.csr -CA /ca/dev-ca.crt -CAkey /ca/dev-ca.key \
    -set_serial "0x$(od -An -tx1 -N16 /dev/urandom | tr -d ' \n')" \
    -days 397 -sha256 -extfile /tmp/ext.cnf -out /certs/tls.crt
  # nginx runs with another uid inside the container and must read the key (development only).
  chmod 644 /certs/tls.key /certs/tls.crt
fi
