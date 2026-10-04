# Demo node (`patches-demo`)

**Status: deployed 2026-10-03.** The signed-out landing page's "Try the demo" button creates a
throwaway sandbox on a second node. Why it is a separate node and not a filter in the production
database is [ADR 0044](../decisions/0044-demo-sandbox-is-its-own-node.md).

| Piece    | Where                                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------- |
| App      | Fly app `patches-demo` (`infra/fly/fly.demo.toml`), server only, scale to zero                           |
| Database | Neon project `patches-demo` (own role/password; **not** the production project)                          |
| Web      | the same Cloudflare Pages build as production; `VITE_PATCHES_DEMO_API_BASE` points the demo at this node |
| Deploy   | `.github/workflows/deploy.yml`, job `deploy-demo`, after production on the same commit                   |

## What runs here

The same image and migrations as production, with `DEMO_MODE=true`:

- `OnboardingService.StartDemo` creates a visitor and three fake friends, seeds follows, posts,
  replies and likes, and returns sessions. Rate limit: 4 starts per peer per hour (IPv6 aggregated to
  /64); global ceiling: 150 live sandboxes. Registration is still invite-only and nobody holds an invite.
- Every sandbox user has `users.sandbox_expires_at` (one hour). `AuthGuard` and `RefreshSession` reject an
  expired sandbox immediately, so it dies on time even while the node is asleep. The sweep
  (`DemoSandboxService.purgeExpired`) hard-deletes expired sandboxes at boot, inside each `StartDemo` and every
  `DEMO_SWEEP_INTERVAL_SECONDS` while awake. It is separate from the E2EE retention job.
- No worker: the node mints its own franking-key era 1 on first boot so E2EE is enabled. No uploads (no
  object storage), no email (`EMAIL_PROVIDER=console`).
- The seeded direct messages are sealed in the visitor's browser with the real E2EE runtime; the node never
  holds a private key.

## Secrets (names only)

`DATABASE_URL` (the Neon **direct** endpoint, not `-pooler`), `DATABASE_SSL`, `JWT_PRIVATE_KEY`,
`JWT_PUBLIC_KEY`, `AUTH_CODE_DELIVERY_ACTIVE_KEY_ID`, `AUTH_CODE_DELIVERY_KEYS`. Generate the JWT and
delivery keys with `pnpm keys:generate` and never reuse production's. Optional repository secret
`FLY_DEMO_API_TOKEN` (falls back to `FLY_API_TOKEN`) if the production deploy token is scoped to one app.

Repository variable `WEB_DEMO_API_BASE` (`https://patches-demo.fly.dev`) feeds `web.yml`.

## Operating it

- Health: `https://patches-demo.fly.dev/healthz` (the landing page pings it so the machine is warm).
- Count live sandboxes: `SELECT COUNT(DISTINCT sandbox_id) FROM users WHERE sandbox_expires_at > now();`
- Force a purge: restart the machine (`fly machine restart -a patches-demo`); the boot sweep runs first.
- Turn the demo off: unset `WEB_DEMO_API_BASE` and redeploy the web app (the button disappears), or
  `fly scale count 0 -a patches-demo`.
