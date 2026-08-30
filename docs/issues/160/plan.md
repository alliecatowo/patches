# Issue #160 plan

## Scope

Resolve the permanent canonical federation origin before public federation is enabled.

## Intended work

1. Record the owner-selected domain and subdomain split from the accepted reference-node decision.
2. Configure production and document preview origins and domains.
3. Verify DNS, Fly certificates, and TLS.
4. Document treatment of identifiers minted under `patches-social.fly.dev`.
5. Mark the §159 and §160 roadmap gates with evidence, leaving externally unverified gates open.

## Current disposition

The repository's accepted ADR 0013 establishes `patches.social` as the flagship/reference
node. This run records that as the permanent canonical origin in ADR 0039, updates the
production configuration and roadmap evidence, and leaves DNS/Fly certificate proof as the
only external blocker.
