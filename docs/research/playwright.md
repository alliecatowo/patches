# Playwright web smoke research

Researched 2026-08-24 against the official Playwright documentation.

- Put a `baseURL` in the Playwright `use` configuration so UI journeys can use relative
  navigation. A `webServer` may start a local Vite server and should reuse an existing local
  server outside CI. [Configuration](https://playwright.dev/docs/test-configuration),
  [webServer](https://playwright.dev/docs/test-webserver)
- Prefer web-first, auto-retrying locator assertions for asynchronous UI state rather than
  arbitrary sleeps. [Assertions](https://playwright.dev/docs/test-assertions)
- Configure trace, video, and screenshot capture under `use`; artifacts are written to the
  configured test output directory. [Use options](https://playwright.dev/docs/test-use-options)

Patches safety exception: the official development example recommends reusing an existing
server outside CI, but this mutating smoke test deliberately starts a fresh strict-port Vite
server every run. Reuse could silently inherit a proxy aimed at production. Before Vite starts,
the test requires the built harness CLI to attest an owned server and worker, exact loopback
origin, and non-secret run ID. Playwright merges `webServer.env` with its own environment, so a
Linux-only wrapper process—not Playwright configuration—is the isolation boundary: it spawns
Vite with a small runtime allowlist plus the attested proxy origin and service-worker opt-out.
The E2E Vite config also disables `.env` loading. Remote browser writes remain disabled until
H-024 can attest preview metadata and its database-parent policy.
