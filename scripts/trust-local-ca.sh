#!/usr/bin/env bash
# macOS only. Run this YOURSELF: it adds the local CA to the System keychain and maps the hostnames
# in /etc/hosts. macOS shows its standard administrator-password dialog (via osascript).
set -euo pipefail
cd "$(dirname "$0")/.."
CA="$PWD/certs/rootCA.pem"
[ -f "$CA" ] || { echo "Run scripts/local-certs.sh first"; exit 1; }

osascript -e "do shell script \"security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain '$CA'; grep -q 'lightroom.dev' /etc/hosts || echo '127.0.0.1 lightroom.dev api.lightroom.dev' >> /etc/hosts\" with administrator privileges"
echo "Local CA trusted and hosts entry added. Restart your browser."
