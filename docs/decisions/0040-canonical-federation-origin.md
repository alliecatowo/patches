# 0040. Canonical federation origin is `patches.social`

**Status:** Accepted
**Date:** 2026-08-30
**Relates to:** [0013](./0013-node-model-and-earlier-federation.md), `INITIAL_VISION.md` §91, §159, §160

## Context

ActivityPub actor, object, and activity identifiers are URLs. The production Fly hostname
`patches-social.fly.dev` is platform-assigned and must not be frozen into identifiers that
are expected to outlive a deployment. ADR 0013 already establishes `patches.social` as the
flagship hosted node and reference node; this ADR makes that domain operationally canonical.

## Decision

The permanent canonical federation origin for the flagship node is:

```text
https://patches.social
```

The flagship node uses `patches.social` for both `PUBLIC_ORIGIN` and `NODE_DOMAIN`. There is
no federation subdomain split: actors, objects, WebFinger, and ActivityPub HTTP endpoints
are all rooted at `https://patches.social`. `api.patches.social` and `grpc.patches.social`
remain future client/API routing names only and must not be used to mint federated IDs.

Preview deployments retain their per-PR `*.fly.dev` origins and federation-disabled setting;
they are test environments, never canonical identifier issuers.

## Existing identifiers

Identifiers already minted under `https://patches-social.fly.dev` are accepted as pre-alpha
throwaway data under [ADR 0030](./0030-pre-alpha-consolidation-policy.md)'s zero-user
consolidation policy. They are not migrated or given a compatibility alias. Federation stays
disabled until DNS and TLS for `patches.social` are live, so no public remote instance should
have consumed those provisional identifiers.

## Consequences

The production configuration now points at the owned domain before federation can be enabled.
DNS and a valid Fly certificate for `patches.social` remain required external deployment
evidence; until then, the production-domain checklist remains open.
