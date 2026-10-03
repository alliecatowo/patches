# 0041. E2EE device certificate renewal is device replacement

**Status:** Accepted
**Date:** 2026-10-03
**Relates to:** [0020](./0020-e2ee-direct-messages.md) §2, [0031](./0031-e2ee-retention-and-prekey-reuse.md) §2,
[0033](./0033-one-e2ee-identity-transcript-family.md), [0037](./0037-e2ee-device-linking-and-root-rotation.md);
audit finding P2-C1 (release audit 2026-10-02)

## Context

Device certificates are root-signed with a 30-day window. ADR 0020 said renewal would be "a
routine roster bump", but nothing implemented it. Once the window passed, the device's own
record failed to load (the client read that as "not enrolled" and offered a root rotation), and
every peer's verification of the actor failed because one active roster entry carried a lapsed
certificate.

A same-device-id renewal is not available: the roster rule `assertRosterSucceeds` rejects a
changed `certificateDigest` for an existing device id, ADR 0031 §2 repeats it ("MUST receive a
fresh random `device_id`"), and the device's signed prekey bundle binds the certificate digest,
so a linked device could not follow a re-signed certificate without the root key.

## Decision

1. **Renewal is device replacement under the same root.** An authority device (one holding the
   root key) mints a fresh device id, certificate and prekeys, enrolls them through the ordinary
   `EnrollDevice` path (resumable: the pending identity is durable before the call), swaps its
   local identity, drops every ratchet session (all are bound to the old device id), and revokes
   the lapsed device. No wire or server change.
2. **History is kept.** Only the enrollment record and ratchet sessions are replaced. Message
   history, peer pins and safety-number verification are untouched. Peers run a fresh X3DH to
   the new device id. Messages already queued for the old device id are not recoverable, which
   is why renewal starts 14 days before expiry.
3. **A device without the root key cannot renew itself.** It gets the same history-keeping reset
   (identity record and sessions dropped) and then the ordinary link flow of ADR 0037 §1.
   Discarding an identity that holds the root key is refused.
4. **Lapsed certificates no longer poison verification.** `verifyCertifiedDevice` takes
   `allowExpired` (signature, root binding and `createdAt` still checked); `verifyRosterSnapshot`
   and `verifyActorChain` accept a lapsed entry and exclude it from the encryption targets. Every
   handshake (`initiateX3dh`, `respondX3dh`, `verifyPreKeyBundle`) still enforces the window.
5. A client whose own certificate has lapsed enters an explicit `renewal-required` state. It does
   not bind a runtime and does not fault.

## Consequences

- Lapsed devices are recoverable without `wipe()`.
- A renewal costs one re-handshake per conversation.
- Linked devices still need the authority device (or a re-link) every certificate lifetime.
- A user already at the active-device limit must revoke a device before an authority can enroll
  its replacement.
