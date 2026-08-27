# HANDOFF: E2EE ungate (owner override, always-on feature)

Worktree: /home/allie/develop/patches-agent-wt/1787795579-2508888
Branch: agent/wt-1787795579-2508888
Base: b1426774

## Task

Turn E2EE from staged-rollout-behind-flags into an always-on feature. Config/copy only, no
crypto changes. See orchestrator brief for full scope (7 numbered steps).

## Plan

1. [done] packages/domain/src/e2ee/modes.ts: E2EE_APPROVED_FRANKING_PROFILES now includes
   E2EE_FRANKING_PROFILE_V1; deleted E2EE_UNREVIEWED_DEV_MODE_WARNING.
2. [done] packages/domain/src/e2ee/index.ts, modes.test.ts, franking.test.ts updated to match.
3. [done] apps/server/src/config/env.schema.ts: deleted E2EE_UNREVIEWED_DEV_MODE and
   E2EE_V1_ENABLED; E2EE_APPROVED_FRANKING_PROFILES is env narrowing-only, boot-fails
   (superRefine) if the env value names a profile absent from the domain constant (#253).
4. [done] app-config.service.ts: dropped e2eeUnreviewedDevMode + e2eeV1Enabled getters.
5. [done] e2ee-runtime-approval-policy.ts: simplified — no unreviewedDevelopmentMode branch;
   constructor takes only the (already-narrowed) env-approved list; isProfileApproved checks
   domain list AND (no env narrowing OR env narrowing includes profile); assertProfileApproved
   distinguishes "domain never approved" (delegates to assertFrankingProfileApproved's message)
   from "domain approved but env narrowing excluded" (own E2eeContractError, "excluded by").
6. [done] e2ee-runtime-approval.module.ts: factory now `new E2eeRuntimeApprovalPolicy(config
.e2eeApprovedFrankingProfiles)`.
7. [done] e2ee-capability.service.ts: rewritten — ENABLED iff approvalPolicy.isProfileApproved
   (E2EE_FRANKING_PROFILE_V1) && signing era defined && keyForEra(era) defined; else DISABLED.
   Dropped the AppConfigService/e2eeV1Enabled dependency entirely (constructor now 2 args).
   ISOLATED_TEST_ONLY/EXPERIMENTAL_CANARY stay in the proto enum, just unreachable.
8. [done] Rewrote server tests: env.schema.test.ts (dropped dev-mode assertions, added narrow/
   widen-rejection cases), e2ee-runtime-approval-policy.test.ts, e2ee-runtime-approval.module
   .test.ts, e2ee-capability.service.test.ts. Also had to fix call sites broken by the
   constructor signature change (not owned but broken by my edit, so fixed minimally):
   apps/server/src/modules/e2ee/e2ee-fanout.test.ts, apps/server/test/e2ee.integration.test.ts,
   apps/server/test/e2ee-privacy-scan.integration.test.ts.
9. [done] apps/tui/src/screens/MessagesScreen.tsx + .test.tsx: removed
   UNREVIEWED_DEV_E2EE_WARNING export/import and its two render branches; removed now-unused
   e2eeCapabilityState destructure and E2EE_CAPABILITY_STATE import (prop stays in the props
   interface — App.tsx still passes it for its own e2eeAdvertised use).
   requiredConversationDisclosure('E2EE_V1') line (threadDisclosure) is UNTOUCHED and still
   renders — verified by reading the current file before finishing.
10. [done] infra/fly/fly.toml: deleted the E2EE_UNREVIEWED_DEV_MODE=true [env] line + its
    ADR 0027 comment.
11. [done] infra/scripts/e2ee-lab.sh: rewrote header (no more B-108/prod-rollout-flip section,
    no more "post-canary env" framing) and the one body echo/env-var block that set
    E2EE_APPROVED_FRANKING_PROFILES/E2EE_V1_ENABLED explicitly (now inert defaults suffice).
12. [done] docs: docs/operations/deployment.md, docs/operations/local-development.md, and the
    ADR 0036 Amendment section (dated 2026-08-26, supersedes §§1-2 + the capability ladder,
    retains §4.3 standing disclosures, leaves the rest of the ADR intact). CLAUDE.md's hard-rule
    line about "v0 DMs are server-visible" is a _different_, larger, already-tracked item
    (issue #198 / ADR 0036 §4.1) — not touched, per the coordinator's explicit scoping to only
    fix CLAUDE.md if it asserts something false about _gating_ specifically.
    docs/architecture/e2ee.md already done (status line, §5 approved-profile paragraph, §7
    rollout-states section rewritten to 2-state DISABLED/ENABLED).
13. [done] `mise run check domain` / `check server` / `check tui`, one at a time, plus
    `pnpm --filter @patches/domain build` to refresh dist (the coordinator flagged this as a
    likely stale-dts issue; it was). domain and server are fully green. tui's typecheck fails
    only inside `apps/tui/src/e2ee/**` and `apps/tui/test/e2ee-{enrollment,runtime}.test.ts`
    (missing `@patches/crypto` exports like `certifyDevice`/`rosterDigest`/`CertifiedDevice`) —
    confirmed via `git diff --stat` that none of those files are in my diff; this is another
    agent's in-flight ADR 0033 crypto rebuild (forbidden path), not caused by this change.
    `MessagesScreen.test.tsx` runs green standalone (13/13) and eslint/prettier are clean on
    every file I touched.
14. [done] Committed at 99366ad4 on branch agent/wt-1787795579-2508888. Task complete.

## Verified

`requiredConversationDisclosure('E2EE_V1')` — "End-to-end encrypted. This node cannot read
these messages, but it can see who you message and when." — is UNCHANGED in
packages/domain/src/e2ee/modes.ts and still rendered by apps/tui/src/screens/MessagesScreen.tsx
(`threadDisclosure`, computed from `mayDescribeAsEndToEndEncrypted`/`requiredConversationDisclosure`,
both untouched). Did not check apps/web/src/e2ee — that tree is owned by another agent mid-edit
per the coordinator; not this task's file set.

## Not touching

packages/crypto/**, apps/web/src/e2ee/**, apps/tui/src/e2ee/**,
apps/server/src/modules/e2ee/e2ee-conversation.service.ts, apps/server/src/modules/messages/**,
packages/database/src/migrations/**.

Note: e2ee-fanout.ts and e2ee-conversation.service.ts both call
`approvalPolicy.assertProfileApproved(profile)` — kept that method name/signature so those
(forbidden/unowned) files need no changes.

## Postscript (2026-08-26, later the same day) — superseded by ADR 0036 Amendment 2

The machinery this handoff describes no longer exists. Owner directive: no approval-list
gating that's hard to reason about — `E2EE_APPROVED_FRANKING_PROFILES` (constant and env),
`assertFrankingProfileApproved`, and `E2eeRuntimeApprovalPolicy`/`E2eeRuntimeApprovalModule`
are deleted; `E2eeCapabilityService` reports ENABLED iff a current-era franking signing key
exists, and the fanout core rejects any non-shipped profile string directly. See ADR 0036
Amendment 2 and the §7-review fix commits on feat/b124-one-identity-transcript-family.
