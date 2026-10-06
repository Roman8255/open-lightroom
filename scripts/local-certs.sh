#!/usr/bin/env bash
# Generates a local CA + a certificate for lightroom.dev / *.lightroom.dev into ./certs (git-ignored).
# Nothing here touches your system trust store - see scripts/trust-local-ca.sh for that.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p certs && cd certs

if [ ! -f rootCA.key ]; then
  openssl genrsa -out rootCA.key 4096 2>/dev/null
  openssl req -x509 -new -nodes -key rootCA.key -sha256 -days 825 -out rootCA.pem \
    -subj "/O=Open Lightroom local dev/CN=Open Lightroom Local CA"
fi

openssl genrsa -out lightroom.dev.key 2048 2>/dev/null
openssl req -new -key lightroom.dev.key -out lightroom.dev.csr -subj "/CN=lightroom.dev"
cat > ext.cnf <<EXT
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:lightroom.dev,DNS:*.lightroom.dev
EXT
openssl x509 -req -in lightroom.dev.csr -CA rootCA.pem -CAkey rootCA.key -CAcreateserial \
  -out lightroom.dev.crt -days 397 -sha256 -extfile ext.cnf 2>/dev/null
rm -f lightroom.dev.csr ext.cnf rootCA.srl
echo "Created certs/lightroom.dev.crt (+ key) signed by certs/rootCA.pem"
