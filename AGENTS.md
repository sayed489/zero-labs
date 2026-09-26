# Forge — Agent Context & Environment Reference

This file is read by all AI coding agents (Arena AI, Antigravity, Claude, Cursor, etc.)
working on this repository. It tells you everything you need to know to run, build,
and deploy this project without asking the user for configuration.

---

## Project Overview

**Forge** — Drive coding agents, terminal, and files on a laptop you own, from any browser.

- **Live URL:** https://zero-labs-kappa.vercel.app
- **GitHub Repo:** https://github.com/sayed489/zero-labs (branch: `main`)
- **Vercel Project:** `zero-labs` (team: `cedit8528-3008s-projects`)
- **Vercel Project ID:** `prj_FbB48whNIgrEvzNRAsUqtYak29Zo`
- **Vercel Org ID:** `team_t39JYqpo4czN7MTpfesK5bWt`

---

## Getting Environment Variables Locally

All secrets are stored in Vercel. Pull them to `.env.local` with:

```bash
vercel env pull .env.local --environment=development
```

Or manually create `.env.local` using `.env.example` as the template.
The full list of variables and their purposes is below.

---

## Environment Variables Reference

### Required — Relay (pairing will fail without these)

| Variable | Purpose | Where it lives |
|---|---|---|
| `CLOUDFLARE_WORKER_URL` | URL of the deployed Cloudflare Worker relay | Vercel env |
| `WORKER_PROXY_SECRET` | Shared secret between this app and the relay Worker | Vercel env |

### Required — Cloudflare (for deploying/updating the relay Worker)

| Variable | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token for deploying the Worker |
| `CLOUDFLARE_ACCOUNT_ID` | `971830a1b105839453f92070437590be` |
| `D1_DATABASE_ID` | `acb32476-a83b-4af9-b0a8-9c24d035b660` |
| `DATABASE_NAME` | `forge` |
| `WORKERS_SUBDOMAIN` | `zero-labs-forge` |

### Optional — Supabase (accounts, cross-browser machine sync)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://cubqijadllanoewbkoyn.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon JWT (safe to expose) — stored in Vercel |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | New publishable key format — stored in Vercel |

### Optional — App URL (only needed when public URL differs from request host)

| Variable | Purpose |
|---|---|
| `APP_URL` | `https://zero-labs-kappa.vercel.app` |
| `NEXT_PUBLIC_APP_URL` | Same, for client-side code |
| `ALLOWED_ORIGINS` | `https://zero-labs-kappa.vercel.app` |

### Auth

| Variable | Purpose |
|---|---|
| `BETTER_AUTH_SECRET` | Auth session signing secret — stored in Vercel |

### Deployment (CI/CD)

| Variable | Purpose |
|---|---|
| `VERCEL_TOKEN` | Vercel personal access token — stored in Vercel + GitHub Secrets |
| `VERCEL_PROJECT` | `zero-labs` |
| `VERCEL_SCOPE` | `cedit8528-3008s-projects` |
| `GITHUB_REPO` | `sayed489/zero-labs` |
| `GITHUB_BRANCH` | `main` |

---

## Deploy Workflow

Every push to `main` triggers an automatic Vercel deployment via GitHub Actions.
See [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

```
You edit code  →  push to main  →  GitHub Actions builds  →  Vercel deploys
                                                            ↓
                                          https://zero-labs-kappa.vercel.app
```

To deploy manually:
```bash
vercel deploy --prod --token $VERCEL_TOKEN
```

---

## Development Setup

```bash
# Install deps
pnpm install

# Pull env vars from Vercel
vercel env pull .env.local

# Run locally
pnpm dev

# Run the relay locally (separate terminal)
pnpm relay:dev

# Health check / doctor
pnpm doctor
```

---

## Key Files for AI Agents

| File | Purpose |
|---|---|
| `lib/server/env.ts` | All env vars the app reads — single source of truth |
| `relay/worker/wrangler.toml` | Cloudflare Worker config (account + D1 IDs hardcoded) |
| `relay/worker/deploy.sh` | How to deploy the Cloudflare relay Worker |
| `.github/workflows/deploy.yml` | Auto-deploy to Vercel on push to main |
| `.vercel/project.json` | Vercel project link (org + project IDs) |
| `supabase/migrations/` | Database schema migrations |
| `bridge/` | Python laptop-side daemon |
| `app/` | Next.js app router pages |
| `components/` | Shared UI components |

---

## Arena AI Agent Mode Instructions

When Arena AI's agent edits this codebase:
1. Edit the relevant files
2. Push directly to `main` branch of `sayed489/zero-labs`
3. GitHub Actions will automatically build and deploy to Vercel (~60 seconds)
4. Live check at: **https://zero-labs-kappa.vercel.app**

No manual deploy step needed. Push = live.
