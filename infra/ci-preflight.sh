#!/usr/bin/env bash
set -euo pipefail

env_file="${1:-.env.example}"
project="codeless-preflight-${GITHUB_RUN_ID:-$$}"
compose=(docker compose -p "$project" --env-file "$env_file" -f infra/compose.dev.yml)
cleanup() {
  status=$?
  trap - EXIT
  if (( status != 0 )); then "${compose[@]}" logs --no-color || true; fi
  if ! "${compose[@]}" down -v --remove-orphans >/dev/null; then
    echo 'preflight cleanup failed' >&2
    status=1
  fi
  exit "$status"
}
trap cleanup EXIT

node infra/check-config.mjs "$env_file"
docker info --format 'Docker server: {{.ServerVersion}}'
"${compose[@]}" config --quiet
"${compose[@]}" up -d --wait --wait-timeout 120

"${compose[@]}" exec -T postgres sh -ec 'test "$(psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "SELECT 1")" = 1'
"${compose[@]}" exec -T runner node -e "fetch('http://127.0.0.1:8787/internal/health').then(async r => { const body = await r.json(); if (!r.ok || body.status !== 'UP' || body.service !== 'codeless-runner') process.exit(1) }).catch(() => process.exit(1))"

for spec in \
  'CODELESS_PLATFORM_PORT CODELESS_PLATFORM_DOMAIN platform-gateway' \
  'CODELESS_PREVIEW_PORT CODELESS_PREVIEW_DOMAIN preview-gateway' \
  'CODELESS_PUBLICATION_PORT CODELESS_PUBLICATION_DOMAIN publication-gateway'; do
  read -r port_key domain_key expected <<< "$spec"
  port="$(sed -n "s/^${port_key}=//p" "$env_file")"
  domain="$(sed -n "s/^${domain_key}=//p" "$env_file")"
  body="$(curl --fail --silent --show-error -H "Host: ${domain}" "http://127.0.0.1:${port}/health")"
  [[ "$body" == *'"status":"UP"'* && "$body" == *"\"service\":\"${expected}\""* ]]
done

# No host port may be allocated to the execution service.
if "${compose[@]}" port runner 8787 2>/dev/null | grep -q .; then
  echo 'runner unexpectedly has a published host port' >&2
  exit 1
fi
echo 'Docker, PostgreSQL, gateways and private runner preflight passed'
