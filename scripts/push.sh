#!/usr/bin/env bash
# Push this workspace to GitHub using the token in .env.local.
#
# Usage:
#   bash scripts/push.sh                 # normal push
#   bash scripts/push.sh --force         # overwrite remote (exact copy)
#   bash scripts/push.sh --message "..." # commit staged changes first
#
# The token is read from .env.local (gitignored). Never commit it.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FORCE=0
COMMIT_MESSAGE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --force) FORCE=1; shift ;;
    --message) COMMIT_MESSAGE="${2:-}"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

read_env() {
  python3 - "$1" <<'PY'
import pathlib, sys
wanted = sys.argv[1]
for name in (".env.local", ".env", ".env.development.local"):
    path = pathlib.Path(name)
    if not path.is_file():
        continue
    for raw in path.read_text(encoding="utf-8-sig", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
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

TOKEN="${GITHUB_TOKEN:-$(read_env GITHUB_TOKEN)}"
# Fall back to the v0-provided project variable when .env.local has no token.
TOKEN="${TOKEN:-${GITHUB_FINE_GRAINED_PAT:-$(read_env GITHUB_FINE_GRAINED_PAT)}}"
REPO="${GITHUB_REPO:-$(read_env GITHUB_REPO)}"
BRANCH="${GITHUB_BRANCH:-$(read_env GITHUB_BRANCH)}"
REPO="${REPO:-sayed489/zero-labs}"
BRANCH="${BRANCH:-master}"

[[ -n "$TOKEN" ]] || { echo "ERROR: GITHUB_TOKEN not found in .env.local" >&2; exit 1; }

if [[ -n "$COMMIT_MESSAGE" ]]; then
  git add -A
  git commit -m "$COMMIT_MESSAGE"
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "WARNING: uncommitted changes will not be pushed:" >&2
  git status --short >&2
fi

PUSH_ARGS=()
[[ "$FORCE" == "1" ]] && PUSH_ARGS+=(--force)

echo "==> Pushing $BRANCH to $REPO"
GIT_TERMINAL_PROMPT=0 git push "${PUSH_ARGS[@]}" \
  "https://x-access-token:${TOKEN}@github.com/${REPO}.git" "${BRANCH}:${BRANCH}"

echo "==> Remote $BRANCH is now $(git rev-parse HEAD)"
