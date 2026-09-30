# Forge validation — 2026-09-30

Branch: `arena/01a0f19b-zero-labs` · PR: https://github.com/sayed489/zero-labs/pull/2

## Scope and release status

This is a bounded audit with concrete reproductions and regression tests, **not a certification that all bugs are gone**. Production was still serving the original installer when checked on September 30. Existing laptop bridge files are not automatically updated by a web deployment.

No supplied private credentials were written into repository files. GitHub operations use the sandbox's configured connection. Private tokens posted in chat should be revoked/rotated; replacements should not be posted in chat.

## Fixes after the initial six reports

- Real Codex 0.159.2 rejects approval flags after `exec`; move root-only options before the subcommand in both execution and preview.
- Claude's generic streaming builder requires `--verbose` with `--print --output-format stream-json`.
- Antigravity fallback downloads can be tar.gz archives. Verify SHA512, read only the expected executable member, reject unsafe/ambiguous archives, and install atomically.
- A completed pairing must survive its original code's expiry. Account-restored credentials with an empty pairing code must be readable and must not be erased on mount.
- Cached daemon presence is not proof of a current relay connection. Clear stale state across tabs and allow reconnect callbacks to fire again.
- Forgetting this browser should not revoke the laptop for every other browser.
- Unrelated Vercel/v0 tenants must not be trusted origins. Preserve exact deployment/configured origins, including proxy-forwarded preview hosts.
- Bound ordinary relay and manifest fetches within function deadlines; give device RPC a separate longer deadline and propagate cancellation.
- OpenCode can emit multiple text parts; do not discard everything after the first part.
- Nonzero exits and structured errors must not become successful jobs merely because partial output was streamed.
- Codex permission-overlay initialization must fail closed, not fall back to the upstream unrestricted provider.
- Installer variant names such as `constructor` and `__proto__` must return 404 rather than indexing inherited object properties.
- Windows bridge single-instance locking must use exclusive address ownership rather than `SO_REUSEADDR`.
- Windows CLI help detection must use the same batch-shim launcher as execution. PTY startup must launch `.CMD`/`.BAT` shims through `cmd.exe`.
- Reinstalling the pinned daemon commit preserves dirty installer patches unless explicitly restored. Refresh only the three installer-owned patch targets before applying current overlays.
- Add a validation workflow. Give the deployment workflow PR-comment permission and keep a comment failure from misreporting a successful deployment.

## Local validation

- Production Next.js build: passed.
- Web TypeScript check: passed.
- Cloudflare Worker TypeScript check: passed.
- Node suite: 94 passed, zero skipped. Includes real Next.js → local relay → Python bridge transport, encrypted PTY/files, origin rejection, invalid installer variants, and command parity.
- Python bridge suite: 113 passed, zero skipped, including the final reinstall regression.
- These transport integration tests use fake coding agents and a fixture daemon surface. They are **not authenticated live-model tests**.
- Windows command construction and lock behavior have mocked-platform regression tests. Native Windows/ConPTY execution was not available.

## Installed CLI validation

Binaries installed outside the repository. `scripts/validate-clis.py` uses a fresh HOME, no inherited provider credentials, a fresh workspace, plan-mode probes, and bounded subprocess lifetimes. It returns exit code 2 for blocked/incomplete validation rather than a false pass.

| CLI | Installed version | Argument-parser cases | Startup probe |
| --- | --- | --- | --- |
| Claude | 2.1.285 | 6 passed | Correct login-required response; no authenticated run |
| Codex | 0.159.2 | 6 passed | Reached transport; TLS/network failure |
| Copilot | 1.0.89 | 6 passed | Correct authentication-required response |
| OpenCode | 1.18.33 | 6 passed | Reached provider startup; certificate/network failure |
| Cursor | Not installed | Not run | Official download endpoint failed TLS from sandbox |
| Antigravity | Not installed | Not run | Installer/manifest/binary downloads failed TLS from sandbox |

The parser matrix covers three permission modes and new/resumed argument construction. It does not prove a real resumed session, model response, tool execution, or provider authorization.

Reproduce after separately installing vendor CLIs:

```sh
.venv/bin/python scripts/validate-clis.py --bin-dir /path/to/cli/bin --probe --output /path/outside/repo/report.json
```

## Live-service and credential checks

- Public relay health returned `{ "ok": true, "service": "forge-relay" }` through the web retrieval tool.
- Public production installer retrieval showed the old implementation, including unsuppressed Windows executable probes.
- Direct authenticated requests to Cloudflare, Vercel, and Supabase failed at the sandbox network/connection layer. Token validity and deployed private configuration could not be established.
- The supplied Vercel OIDC token's stated expiry was September 16, 2026, before this validation date. It also refers to a different Vercel project identifier from the repository link. Do not treat it as usable deployment authentication.
- Deployment service credentials are not coding-agent provider logins.
- Browser automation was attempted, but Chromium download failed from the Playwright CDN. Visual/browser-interaction validation remains unverified.

## Additional upstream test findings

The standalone vendored daemon smoke test reports seven failures: one session-title expectation and six HTTP acceptance-status expectations. The same seven failures were reproduced against untouched base commit `d1b9a779525e7479769bfc7516d332affbbc6375` in an isolated directory. They are baseline failures, not introduced by this PR, and have not been hidden or relabeled as passing.

## Remaining evidence needed for the pictured laptop

The installer screenshot does not include the bridge startup traceback. A redacted tail of `%USERPROFILE%\.forge\bridge.log` is needed to distinguish missing dependencies/import failures, lock conflicts, and transport failures. Do not share `config.json`, tokens, cookies, authorization headers, or token-bearing URLs.
