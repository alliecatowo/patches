---
name: federation-identity-is-public-origin-not-node-domain
description: WebFinger/ResolveActor domain matching is driven entirely by PUBLIC_ORIGIN's host, not NODE_DOMAIN
metadata:
  type: project
---

In `apps/server`'s federation code, `NODE_DOMAIN` only feeds JWT issuer/audience and the
SSH-challenge binding — it plays no role in federation identity. `WebfingerService.resolve`
(`apps/server/src/modules/federation/services/webfinger.service.ts`) rejects any WebFinger
`resource` whose domain isn't `new URL(config.publicOrigin).host`, and
`RemoteActorService.resolveByAcct` builds the outbound WebFinger fetch URL from the acct's
domain verbatim. So a manual two-node lab's follow/search acct must be `handle@127.0.0.1:
<http-port>` (the node's actual `PUBLIC_ORIGIN` host), never `handle@a.localhost`/
`handle@b.localhost` even if that's what `NODE_DOMAIN` is set to.

**Why:** discovered building `infra/lab/fed-lab.sh` (B-029) — the automated two-node test
(`apps/server/test/federation-two-node.integration.test.ts`) already does this (its
`discoverRemoteActor` helper uses `new URL(nodeB.publicOrigin).host`, not the `nodeDomain`
option), but it's easy to assume NODE_DOMAIN is the federation-facing identity by analogy
with ActivityPub's usual "handle@domain" framing.

**How to apply:** when building anything that resolves/follows a remote actor by acct
(lab scripts, docs, TUI wiring), use the target node's `PUBLIC_ORIGIN` host as the acct
domain. `getent hosts a.localhost` resolving to loopback doesn't matter — the code path
never looks at it.
