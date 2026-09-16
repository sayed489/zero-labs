# Forge production deployment

This runbook deploys the complete Forge path:

```text
Browser on zero-labs-nine.vercel.app
  -> Vercel /api/relay proxy
  -> Cloudflare Worker + D1 + Durable Object
  -> outbound WebSocket from the user's laptop
  -> loopback-only agentremoted daemon
  -> Claude Code / Codex / Cursor Agent / Antigravity
```

The primary automation is [`worker/deploy.sh`](./deploy.sh). Prefer running it instead of manually copying IDs or secrets.

## Safety rules

- Never commit or print `CLOUDFLARE_API_TOKEN`, `WORKER_PROXY_SECRET`, or `BETTER_AUTH_SECRET`.
- Never run the laptop installer with `sudo`. Full-control agents inherit the permissions of the signed-in laptop user.
- Keep `agentremoted` bound to `127.0.0.1`. The bridge must be the only outbound connection to the public relay.
- `.env.local`, `.env.development.local`, and `.forge-deploy.env` are gitignored. v0 overwrites `.env.development.local`, so Cloudflare secrets belong in `.env.local`.
- Rotating `WORKER_PROXY_SECRET` requires updating both Cloudflare and Vercel before clients can reconnect.

## One-time prerequisites

1. A Cloudflare account with Workers, Durable Objects, and D1 enabled.
2. A Cloudflare custom API token with account-level permissions:
   - Workers Scripts: Edit
   - D1: Edit
   - Account Settings: Read
3. Node.js, pnpm, Python 3, and curl. OpenSSL is not required; the script generates secrets with Python.
4. A Vercel account with access to project `zero-labs-nine` in scope `ramulp12h-8763s-projects`.
5. The production web URL: `https://zero-labs-nine.vercel.app`.

Do **not** put the token in `.env.development.local`. v0 regenerates that file, so `bash worker/deploy.sh` will not see the key. Create `.env.local` in the repo root instead:

```dotenv
CLOUDFLARE_API_TOKEN=replace_with_real_token
```

If the token can access multiple Cloudflare accounts, also add the account ID shown in the Cloudflare dashboard URL or account overview:

```dotenv
CLOUDFLARE_ACCOUNT_ID=replace_with_32_character_account_id
```

Do not wrap values in angle brackets. Do not commit this file. Quotes are optional. You can also export the token for one run:

```bash
export CLOUDFLARE_API_TOKEN='replace_with_real_token'
bash worker/deploy.sh
```

## Complete automated deployment

From the repository root on macOS, Linux, Git Bash, or WSL:

```bash
bash worker/deploy.sh
```

Equivalent package command:

```bash
pnpm --dir worker deploy:full
```

Optional overrides:

```bash
APP_URL=https://zero-labs-nine.vercel.app \
VERCEL_PROJECT=zero-labs-nine \
VERCEL_SCOPE=ramulp12h-8763s-projects \
DATABASE_NAME=forge \
bash worker/deploy.sh
```

The script is idempotent and performs these operations:

1. Reads Cloudflare values from `.env.local`, `.env`, `worker/.dev.vars`, then `.env.development.local`.
2. Discovers the Cloudflare account when the token has exactly one account.
3. Installs dependencies and runs Worker type-check plus the Next.js build.
4. Reuses the `forge` D1 database or creates it when absent.
5. Writes the real D1 UUID and production origin into `worker/wrangler.toml`.
6. Applies `worker/schema.sql` remotely. Every statement is safe to rerun.
7. Creates strong relay/auth secrets once and saves them to `.forge-deploy.env` with restrictive permissions.
8. Deploys the Worker, Durable Object migration, D1 binding, variables, and secrets.
9. Links the Vercel project and adds `CLOUDFLARE_WORKER_URL` and `WORKER_PROXY_SECRET` to production, preview, and development environments.
10. Produces a fresh production Vercel deployment.

## Expected successful output

The last block resembles:

```text
Deployment complete
App:    https://zero-labs-nine.vercel.app
Worker: https://forge-relay.<subdomain>.workers.dev
D1:     forge (<database UUID>)
```

`worker/wrangler.toml` should no longer contain `REPLACE_WITH_D1_DATABASE_ID`.

## Validation after deployment

1. Open `https://zero-labs-nine.vercel.app`.
2. Create an account or sign in.
3. The web app should show the laptop installation command and pairing flow.
4. Run the displayed installer on the laptop without `sudo`.
5. Authenticate each desired local CLI directly on the laptop:
   - `claude`
   - `codex`
   - `cursor-agent`
   - `agy`
6. Approve the pairing code in Forge.
7. Open the paired device, choose a CLI, select or enter a working directory, and submit a harmless prompt such as `Read package.json and summarize the scripts. Do not edit files.`
8. Then test a write: `Create forge-e2e-test.txt containing ok.` Confirm the file appears on the laptop and delete it.
9. Submit a longer prompt and verify text appears incrementally; this validates SSE through the Worker and bridge.

## Troubleshooting

### Missing command: openssl

This is already handled. The current `worker/deploy.sh` generates secrets with Python and does not require OpenSSL. Pull or save the latest script, then rerun `bash worker/deploy.sh`.

### CLOUDFLARE_API_TOKEN was not found

The editor can show a key in `.env.development.local` while the deploy script still misses it, because v0 regenerates that file. Move the token to `.env.local` or export it, then rerun `bash worker/deploy.sh`. The script prints every file it checked.

### Token rejected

Verify the token is active and has Workers Scripts Edit, D1 Edit, and Account Settings Read. Do not use a Global API Key.

### More than one Cloudflare account

Set `CLOUDFLARE_ACCOUNT_ID` in `.env.local` and rerun.

### Worker URL was not detected

The Worker still may have deployed. Copy the `workers.dev` URL from Wrangler output and rerun:

```bash
CLOUDFLARE_WORKER_URL=https://forge-relay.<subdomain>.workers.dev bash worker/deploy.sh
```

### Vercel login or scope failure

Run `npx vercel login`, verify access to `zero-labs-nine`, then rerun. The required scope is `ramulp12h-8763s-projects`.

### Web app reports relay unavailable

Confirm Vercel has these variables in production and preview:

```text
CLOUDFLARE_WORKER_URL
WORKER_PROXY_SECRET
```

The value of `WORKER_PROXY_SECRET` must exactly match the Cloudflare Worker secret. Never paste it into logs or chat.

### Laptop is offline

The web UI can load while the device is disconnected, but prompts cannot execute. Start the installed Forge bridge service and verify the local daemon remains bound to `127.0.0.1:8473`.

### CLI unavailable

The bridge does not provide model subscriptions. Each CLI must be installed and authenticated locally. Cursor uses native structured streaming; Antigravity uses a tmux-backed interactive adapter because `agy` does not provide stable headless JSON output.

## Manual recovery commands

Use these only when the script cannot be used:

```bash
pnpm --dir worker exec wrangler d1 list
pnpm --dir worker exec wrangler d1 execute forge --remote --file=schema.sql
pnpm --dir worker exec wrangler deploy
npx vercel env ls --scope ramulp12h-8763s-projects
```

Never hardcode secrets into `wrangler.toml`, application source, shell history, or this document.
