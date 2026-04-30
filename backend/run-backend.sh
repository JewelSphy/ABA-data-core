#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ -z "${DB_URL:-}" ]; then
  export DB_URL="jdbc:mysql://localhost:3306/gilberto_crm"
fi
if [ -z "${DB_USER:-}" ]; then
  export DB_USER="root"
fi
if [ -z "${DB_PASS:-}" ]; then
  export DB_PASS="root"
fi
if [ -z "${PORT:-}" ]; then
  export PORT="8788"
fi
if [ -z "${MAX_BODY_BYTES:-}" ]; then
  export MAX_BODY_BYTES="12582912"
fi
# Optional hardening:
# export ALLOWED_ORIGIN="http://127.0.0.1:5500"
# export API_KEY="replace-with-long-random-secret"

mvn -q -DskipTests compile exec:java -Dexec.mainClass=gilberto.Main
