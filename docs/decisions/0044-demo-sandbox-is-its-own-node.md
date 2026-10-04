# 0044. The per-visitor demo sandbox runs on its own node and database

**Status:** Accepted
**Date:** 2026-10-03
**Relates to:** [0020](./0020-e2ee-direct-messages.md), [0031](./0031-e2ee-retention-and-prekey-reuse.md),
[0036](./0036-shipping-e2ee-conditions-capability-states-and-copy.md); owner decision 2026-10-03
(signed-out visitors get a landing page and a throwaway demo)

## Context

A signed-out first-time visitor to the web app used to hit an invite-only wall. The owner decision is a
landing page plus a **"Try the demo"** button that creates a throwaway account, pre-populated with fake
friends, posts and direct messages. Requirements: the sandbox is invisible to real users and cannot reach
them, creation is rate-limited per IP, everything is deleted after an hour, seeded content works with
end-to-end encryption, real registration stays invite-only, the production node still scales to zero, and no
new paid infrastructure is added.

## Decision

1. **The sandbox lives on a second node (`patches-demo`, `DEMO_MODE=true`) with its own database, not in the
   production database behind a filter.** The demo node runs the same image, the same migrations and the same
   server code, against its own Neon project (`patches-demo`, free plan, own role and password), so the demo
   node holds no credential that can reach the production database. The production node never holds a sandbox row, and the demo node never holds
   a real one. "Invisible to real users" and "cannot reach or message them" are therefore properties of where
   the data lives, not of a predicate that every present and future query must remember. The alternative
   (a `sandbox_id` cohort column checked in each search, feed, thread, follow, mention, notification and E2EE
   read) touches dozens of read paths in the server that serves real people, and one missed predicate would
   either show fake content to a real user or, worse, show a real user's content to an anonymous visitor.
2. **`OnboardingService.StartDemo`** (unauthenticated, answers `DEMO_DISABLED` unless `DEMO_MODE=true`)
   creates one visitor and three fake friends in one transaction, then seeds follows, posts, replies and
   likes through the ordinary services. It is rate-limited per peer (database-backed, IPv6 aggregated to /64,
   default 4 per hour) and capped globally (default 150 live sandboxes) so the free database cannot be grown
   without bound. Registration (`Register`) is unchanged and stays invite-gated on both nodes. No email is
   sent.
3. **Expiry is enforced on every token use, then rows are deleted.** Each sandbox user carries
   `sandbox_id` and `sandbox_expires_at` (additive nullable columns on `users`; NULL for every real
   account). `AuthGuard`, `SuspensionTolerantAuthGuard` and `RefreshSession` reject an expired sandbox, so
   a sandbox dies on time even though the scale-to-zero node cannot run a sweep while asleep. The sweep
   (`purgeExpired`) hard-deletes expired sandboxes at boot, inside every `StartDemo`, and on an unref'd
   interval while the node is awake. Every query is scoped by `sandbox_expires_at IS NOT NULL`. It is
   separate from the E2EE retention job and does not touch `E2EE_RETENTION_SCHEDULE_ENABLED`.
4. **E2EE: the node never holds a private key, so the browser seeds the direct messages.** `StartDemo`
   also returns sessions for the three friends. The visitor's browser enrolls the visitor's device and each
   friend's device with the real client E2EE runtime (in-memory vaults for the friends) and sends the seeded
   messages, so the ciphertext in the sandbox is sealed to the visitor's own device exactly like ordinary
   traffic. The friend keys die with the tab; the demo says plainly that the friends do not reply.
5. **Uploads are off on the demo node** (no object storage there; an upload is the one thing the sweep
   could not delete with SQL).
6. **Scale to zero is kept on both nodes.** The landing page is part of the static web app on Cloudflare
   Pages, so it renders before either Fly machine wakes. The page sends a no-cors request to the demo node's
   `/healthz` while the visitor reads, so the machine is usually warm when "Try the demo" is pressed.

## Consequences

- One more Fly app (`patches-demo`, scale to zero, no volume) and one more free Neon project. A stopped Fly
  machine costs only its root filesystem; no new paid plan is needed.
- The demo node runs no worker, which is what normally mints the franking-key era that turns E2EE on, so it
  mints era 1 itself on first boot (`ensureFrankingKey`) and reloads its key ring.
- The demo node needs its own secrets (JWT signing keys, auth-code and franking keys). Tokens issued by one
  node are never valid on the other, by design.
- `.github/workflows/deploy.yml` deploys both apps from the same CI-verified commit; `web.yml` builds the web
  app with both API bases.
- Sandboxes are not isolated from each other inside the demo database; that is acceptable for one-hour
  throwaway accounts on an empty node and is tracked as a follow-up (a per-sandbox visibility predicate is
  cheap there because the node has no real data to protect).
- The sandbox exercises the production code paths, so a regression in posting, following or DMs shows up
  in the demo as well.

## Alternatives considered

- **Cohort column in the production database.** Rejected, as above.
- **A second Postgres schema selected per request.** Rejected: the pool is shared, so one connection that
  keeps the wrong `search_path` is a cross-world leak.
- **Server-side seeded DMs.** Rejected: the E2EE runtime lives in the clients (ADR 0034), and a node that
  seals messages to a user's key would hold the sender's private key, which is the opposite of the design.
- **A recorded video instead of a live sandbox.** Rejected by the owner.
