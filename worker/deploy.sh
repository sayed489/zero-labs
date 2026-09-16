#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="$ROOT_DIR/worker"
APP_URL="${APP_URL:-https://zero-labs-nine.vercel.app}"
VERCEL_PROJECT="${VERCEL_PROJECT:-zero-labs}"
VERCEL_SCOPE="${VERCEL_SCOPE:-ramulp12h-8763s-projects}"
DATABASE_NAME="${DATABASE_NAME:-forge}"
SECRETS_FILE="$ROOT_DIR/.forge-deploy.env"
# v0 regenerates .env.development.local. Keep Cloudflare secrets in .env.local
# or worker/.dev.vars so they survive. ENV_FILE still overrides the search list.
ENV_FILES=()
if [[ -n "${ENV_FILE:-}" ]]; then
  ENV_FILES+=("$ENV_FILE")
fi
ENV_FILES+=(
  "$ROOT_DIR/.env.local"
  "$ROOT_DIR/.env"
  "$WORKER_DIR/.dev.vars"
  "$ROOT_DIR/.forge-deploy.env"
  "$ROOT_DIR/.env.development.local"
)

log() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
require() { command -v "$1" >/dev/null 2>&1 || fail "Missing command: $1"; }

load_env_value() {
  local key="$1"
  python3 - "$key" "${ENV_FILES[@]}" <<'PY'
import pathlib, sys
wanted = sys.argv[1]
for raw_path in sys.argv[2:]:
    path = pathlib.Path(raw_path)
    if not path.is_file():
        continue
    text = path.read_text(encoding="utf-8-sig", errors="replace")
    for raw in text.splitlines():
        line = raw.strip().lstrip("\ufeff")
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        key, value = line.split("=", 1)
        if key.strip() != wanted:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        print(value, end="")
        raise SystemExit(0)
raise SystemExit(0)
PY
}

describe_env_search() {
  local key="$1" path
  printf 'Looked for %s in:\n' "$key" >&2
  for path in "${ENV_FILES[@]}"; do
    if [[ -f "$path" ]]; then
      if grep -E -q "^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*=" "$path" 2>/dev/null; then
        printf '  %s (found key)\n' "$path" >&2
      else
        printf '  %s (file exists, key missing)\n' "$path" >&2
      fi
    else
      printf '  %s (file missing)\n' "$path" >&2
    fi
  done
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
if [[ -z "$CLOUDFLARE_API_TOKEN" ]]; then
  describe_env_search CLOUDFLARE_API_TOKEN
  fail "CLOUDFLARE_API_TOKEN was not found.

v0 overwrites .env.development.local, so do not put the token there.
Create .env.local in the repo root (gitignored) with:

  CLOUDFLARE_API_TOKEN=your_token_here

Or export it for this shell:

  export CLOUDFLARE_API_TOKEN='your_token_here'
  bash worker/deploy.sh"
fi
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
[[ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]] || fail "Could not choose one Cloudflare account. Add CLOUDFLARE_ACCOUNT_ID to .env.local."
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
# Use the pre-authenticated local CLI. `npx vercel@latest` fetches a fresh
# version that is not logged in and fails with "no access to account".
vercel link --yes --project "$VERCEL_PROJECT" --scope "$VERCEL_SCOPE"
set_vercel_env CLOUDFLARE_WORKER_URL "$worker_url"
set_vercel_env WORKER_PROXY_SECRET "$WORKER_PROXY_SECRET"

log "Redeploying the Vercel application with the new variables"
vercel deploy --prod --yes --scope "$VERCEL_SCOPE"

log "Deployment complete"
printf 'App:    %s\nWorker: %s\nD1:     %s (%s)\n' "$APP_URL" "$worker_url" "$DATABASE_NAME" "$database_id"
printf 'Secrets are stored locally in %s (gitignored). Never commit or paste that file.\n' "$SECRETS_FILE"
