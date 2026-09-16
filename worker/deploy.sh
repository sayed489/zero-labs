#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="$ROOT_DIR/worker"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.development.local}"
APP_URL="${APP_URL:-https://zero-labs-nine.vercel.app}"
VERCEL_PROJECT="${VERCEL_PROJECT:-zero-labs-nine}"
VERCEL_SCOPE="${VERCEL_SCOPE:-ramulp12h-8763s-projects}"
DATABASE_NAME="${DATABASE_NAME:-forge}"
SECRETS_FILE="$ROOT_DIR/.forge-deploy.env"

log() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
require() { command -v "$1" >/dev/null 2>&1 || fail "Missing command: $1"; }

load_env_value() {
  local key="$1"
  [[ -f "$ENV_FILE" ]] || return 0
  python3 - "$ENV_FILE" "$key" <<'PY'
import pathlib, sys
path, wanted = pathlib.Path(sys.argv[1]), sys.argv[2]
for raw in path.read_text().splitlines():
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    if key.strip() == wanted:
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        print(value, end="")
        break
PY
}

set_vercel_env() {
  local key="$1" value="$2" target
  for target in production preview development; do
    npx --yes vercel@latest env rm "$key" "$target" --yes --scope "$VERCEL_SCOPE" >/dev/null 2>&1 || true
    printf '%s' "$value" | npx --yes vercel@latest env add "$key" "$target" --scope "$VERCEL_SCOPE" >/dev/null
  done
}

require python3
require curl
require pnpm

random_secret() {
  local bytes="${1:-32}" encoding="${2:-hex}"
  python3 - "$bytes" "$encoding" <<'PY'
import secrets, sys
nbytes, encoding = int(sys.argv[1]), sys.argv[2]
print(secrets.token_hex(nbytes) if encoding == "hex" else secrets.token_urlsafe(nbytes), end="")
PY
}

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  CLOUDFLARE_API_TOKEN="$(load_env_value CLOUDFLARE_API_TOKEN)"
fi
[[ -n "$CLOUDFLARE_API_TOKEN" ]] || fail "Set CLOUDFLARE_API_TOKEN in $ENV_FILE or export it in the shell."
export CLOUDFLARE_API_TOKEN

if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  CLOUDFLARE_ACCOUNT_ID="$(load_env_value CLOUDFLARE_ACCOUNT_ID)"
fi
if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  log "Discovering the Cloudflare account"
  accounts_json="$(curl -fsS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    'https://api.cloudflare.com/client/v4/accounts?per_page=50')"
  CLOUDFLARE_ACCOUNT_ID="$(python3 -c 'import json,sys; d=json.load(sys.stdin); r=d.get("result",[]); print(r[0]["id"] if len(r)==1 else "")' <<<"$accounts_json")"
fi
[[ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]] || fail "Could not choose one Cloudflare account. Add CLOUDFLARE_ACCOUNT_ID to $ENV_FILE."
export CLOUDFLARE_ACCOUNT_ID

log "Installing dependencies and running checks"
pnpm install --frozen-lockfile
pnpm --dir "$WORKER_DIR" typecheck
pnpm build

log "Finding or creating D1 database: $DATABASE_NAME"
databases_json="$(pnpm --dir "$WORKER_DIR" exec wrangler d1 list --json)"
database_id="$(python3 -c 'import json,sys; name=sys.argv[1]; rows=json.load(sys.stdin); print(next((r["uuid"] for r in rows if r.get("name")==name), ""))' "$DATABASE_NAME" <<<"$databases_json")"
if [[ -z "$database_id" ]]; then
  pnpm --dir "$WORKER_DIR" exec wrangler d1 create "$DATABASE_NAME"
  databases_json="$(pnpm --dir "$WORKER_DIR" exec wrangler d1 list --json)"
  database_id="$(python3 -c 'import json,sys; name=sys.argv[1]; rows=json.load(sys.stdin); print(next((r["uuid"] for r in rows if r.get("name")==name), ""))' "$DATABASE_NAME" <<<"$databases_json")"
fi
[[ -n "$database_id" ]] || fail "D1 database creation did not return an ID."

log "Writing Cloudflare resource IDs and application URL"
python3 - "$WORKER_DIR/wrangler.toml" "$database_id" "$APP_URL" <<'PY'
import pathlib, re, sys
path, database_id, app_url = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3].rstrip("/")
text = path.read_text()
text = re.sub(r'database_id\s*=\s*"[^"]*"', f'database_id = "{database_id}"', text, count=1)
text = re.sub(r'ALLOWED_ORIGINS\s*=\s*"[^"]*"', f'ALLOWED_ORIGINS = "{app_url}"', text, count=1)
text = re.sub(r'APP_URL\s*=\s*"[^"]*"', f'APP_URL = "{app_url}"', text, count=1)
path.write_text(text)
PY

log "Applying the D1 schema"
pnpm --dir "$WORKER_DIR" exec wrangler d1 execute "$DATABASE_NAME" --remote --file=schema.sql

if [[ -f "$SECRETS_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$SECRETS_FILE"
fi
WORKER_PROXY_SECRET="${WORKER_PROXY_SECRET:-$(random_secret 32 hex)}"
BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-$(random_secret 48 urlsafe)}"
umask 077
printf 'WORKER_PROXY_SECRET=%q\nBETTER_AUTH_SECRET=%q\n' "$WORKER_PROXY_SECRET" "$BETTER_AUTH_SECRET" > "$SECRETS_FILE"

worker_secrets="$(mktemp)"
deploy_log="$(mktemp)"
trap 'rm -f "$worker_secrets" "$deploy_log"' EXIT
printf 'WORKER_PROXY_SECRET=%s\nBETTER_AUTH_SECRET=%s\n' "$WORKER_PROXY_SECRET" "$BETTER_AUTH_SECRET" > "$worker_secrets"

log "Deploying the Cloudflare Worker, Durable Object, and secrets"
pnpm --dir "$WORKER_DIR" exec wrangler deploy --secrets-file "$worker_secrets" 2>&1 | tee "$deploy_log"
worker_url="$(python3 -c 'import re,sys; t=open(sys.argv[1]).read(); m=re.search(r"https://\S+\.workers\.dev", t); print(m.group(0) if m else "")' "$deploy_log" 2>/dev/null || true)"
if [[ -z "$worker_url" ]]; then
  worker_url="${CLOUDFLARE_WORKER_URL:-}"
fi
[[ -n "$worker_url" ]] || fail "Worker deployed, but its URL could not be detected. Re-run with CLOUDFLARE_WORKER_URL=https://<worker>.workers.dev."

log "Linking the Vercel project and setting relay variables"
npx --yes vercel@latest link --yes --project "$VERCEL_PROJECT" --scope "$VERCEL_SCOPE"
set_vercel_env CLOUDFLARE_WORKER_URL "$worker_url"
set_vercel_env WORKER_PROXY_SECRET "$WORKER_PROXY_SECRET"

log "Redeploying the Vercel application with the new variables"
npx --yes vercel@latest deploy --prod --yes --scope "$VERCEL_SCOPE"

log "Deployment complete"
printf 'App:    %s\nWorker: %s\nD1:     %s (%s)\n' "$APP_URL" "$worker_url" "$DATABASE_NAME" "$database_id"
printf 'Secrets are stored locally in %s (gitignored). Never commit or paste that file.\n' "$SECRETS_FILE"
