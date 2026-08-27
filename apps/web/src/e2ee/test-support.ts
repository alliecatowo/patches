/**
 * Shared test doubles for the enrollment/device-link flows (ADR 0020 §2–§3, ADR 0037).
 * One fake in-memory "node" and one `EnrollmentTransport` double over it, so
 * `enrollment.test.ts` and `device-link.test.ts` exercise the SAME fake surface instead
 * of drifting apart — including the offer relay and roster storage ADR 0037 §1 needs.
 *
 * This module is test-only: it is never imported by production code.
 */
import { create } from '@bufbuild/protobuf';
import {
  E2eeIdentityRootSchema,
  E2eeServiceBeginDeviceLinkResponseSchema,
  E2eeServiceListPendingDeviceLinksResponseSchema,
  type E2eeDeviceCertificate,
  type E2eeDeviceLinkOffer,
  type E2eeDeviceRoster,
  type E2eeIdentityRoot,
  type E2eeServiceBeginDeviceLinkRequest,
  type E2eeServiceBeginDeviceLinkResponse,
  type E2eeServiceListPendingDeviceLinksResponse,
  type EnrollDeviceRequest,
  type PublishIdentityRootRequest,
  type RevokeDeviceRequest,
} from '@patches/proto/es';
import { vi, type Mock } from 'vitest';
import {
  verifyMessagingRoot,
  verifyPreKeyBundle,
  verifyRosterSnapshot,
  type DoubleRatchetState,
  type VerifiedRosterSnapshot,
} from '@patches/crypto';
import { activeDeviceIds, E2EE_PROTOCOL_V1 } from '@patches/domain';

import { rosterViewFromWire } from './chain.js';
import type {
  EnrollmentCapability,
  EnrollmentDeviceRoster,
  EnrollmentTransport,
} from './enrollment.js';
import type { RatchetSessionVault, VaultOpenInfo } from './vault.js';
import type { LocalDeviceIdentity } from './local-identity.js';
import type {
  ClaimedPeerBundle,
  E2eeMailboxEnvelopeLike,
  E2eeMailboxTransport,
  E2eeSendTransport,
} from './runtime.js';

export const USABLE_CAPABILITY: EnrollmentCapability = {
  state: 3,
  supportedProtocolVersions: [E2EE_PROTOCOL_V1],
};

/** Only the opaque-record half of the vault is exercised by enrollment/device-link; the
 * ratchet methods throw so an accidental dependency on them fails loudly instead of
 * silently. */
export function memoryVault(): RatchetSessionVault & { readonly records: Map<string, Uint8Array> } {
  const records = new Map<string, Uint8Array>();
  const unused = (): never => {
    throw new Error('enrollment/device-link must not touch ratchet session state');
  };
  return {
    records,
    open: (): Promise<VaultOpenInfo> =>
      Promise.resolve({ generation: 0, adoptedStagedSessions: [] }),
    listSessions: () => Promise.resolve([...records.keys()]),
    getSession: (): Promise<DoubleRatchetState | undefined> => unused(),
    stageSend: (): Promise<void> => unused(),
    confirmSend: (): Promise<void> => unused(),
    applyUpdate: (): Promise<void> => unused(),
    deleteSession: (): Promise<void> => unused(),
    getOpaqueRecord: (key) => Promise.resolve(records.get(key)),
    putOpaqueRecord: (key, value) => {
      records.set(key, value.slice());
      return Promise.resolve();
    },
    wipe: () => {
      records.clear();
      return Promise.resolve();
    },
    close: () => undefined,
  };
}

export function publishedRoot(actorId: string, publicKey: Uint8Array): E2eeIdentityRoot {
  return create(E2eeIdentityRootSchema, { actorId, generation: 1, publicKey });
}

/** One in-memory "node": rosters by actor, and pending link offers by actor — enough
 * state for `beginDeviceLinkOffer` -> `approveLinkOffer` -> `pollLinkedEnrollment` to run
 * end to end against fakes without a real server (ADR 0037 §1). */
export interface FakeE2eeNode {
  readonly rosterByActor: Map<string, EnrollmentDeviceRoster>;
  readonly pendingOffersByActor: Map<string, E2eeDeviceLinkOffer[]>;
  /** Backs `getIdentityRoot`/`publishIdentityRoot` (ADR 0037 §2's `rotateMessagingRoot`) —
   * absent until some transport bound to this node calls `publishIdentityRoot`. */
  readonly rootByActor: Map<string, E2eeIdentityRoot>;
  /** Per-device mailbox queues — backs `fakeMessagingMailboxTransport`/`sendEnvelopes`. */
  readonly mailboxesByDevice: Map<string, E2eeMailboxEnvelopeLike[]>;
  /** Enrolled devices' local identities, registered via `registerMessagingDevice` — the
   * fake's stand-in for the node's own prekey store, so `claimPrekeyBundles` has bundles to
   * hand out for every active device of a claimed actor. */
  readonly messagingIdentities: Map<string, LocalDeviceIdentity>;
}

export function createFakeE2eeNode(): FakeE2eeNode {
  return {
    rosterByActor: new Map(),
    pendingOffersByActor: new Map(),
    rootByActor: new Map(),
    mailboxesByDevice: new Map(),
    messagingIdentities: new Map(),
  };
}

/** Publishes (replaces) one actor's served roster + certificates on the fake node —
 * what `approveLinkOffer`/`rotateMessagingRoot` and `pollLinkedEnrollment`/`listLinkOffers`
 * read and write across two different transport instances bound to the same node. */
export function setFakeRoster(
  node: FakeE2eeNode,
  actorId: string,
  roster: E2eeDeviceRoster,
  certificates: readonly E2eeDeviceCertificate[],
): void {
  node.rosterByActor.set(actorId, { roster, certificates: [...certificates] });
}

export interface FakeTransport extends EnrollmentTransport {
  readonly getCapability: Mock<() => Promise<EnrollmentCapability | undefined>>;
  readonly getIdentityRoot: Mock<(actorId: string) => Promise<E2eeIdentityRoot | undefined>>;
  readonly publishIdentityRoot: Mock<(request: PublishIdentityRootRequest) => Promise<unknown>>;
  readonly enrollDevice: Mock<(request: EnrollDeviceRequest) => Promise<unknown>>;
  readonly getDeviceRoster: Mock<(actorId: string) => Promise<EnrollmentDeviceRoster>>;
  readonly beginDeviceLink: Mock<
    (request: E2eeServiceBeginDeviceLinkRequest) => Promise<E2eeServiceBeginDeviceLinkResponse>
  >;
  readonly listPendingDeviceLinks: Mock<() => Promise<E2eeServiceListPendingDeviceLinksResponse>>;
  readonly cancelDeviceLink: Mock<(linkId: string) => Promise<unknown>>;
  readonly revokeDevice: Mock<(request: RevokeDeviceRequest) => Promise<unknown>>;
}

let fakeLinkIdCounter = 0;

/**
 * One transport double bound to `actorId` — mirrors how a real client's transport is
 * bound to the calling device's authenticated actor. `node` is shared across every
 * `fakeTransport(...)` instance in a test so the offer-side and authority-side (and, for
 * rotation, the same device on both sides of a `getDeviceRoster` round trip) observe each
 * other's writes, exactly as two devices talking to the same node would.
 */
export function fakeTransport(options: { actorId: string; node?: FakeE2eeNode }): FakeTransport {
  const node = options.node ?? createFakeE2eeNode();
  const actorId = options.actorId;
  return {
    getCapability: vi.fn<() => Promise<EnrollmentCapability | undefined>>(() =>
      Promise.resolve(USABLE_CAPABILITY),
    ),
    getIdentityRoot: vi.fn<(actorId: string) => Promise<E2eeIdentityRoot | undefined>>(
      (forActorId) => Promise.resolve(node.rootByActor.get(forActorId)),
    ),
    // Fakes the server's persistence only (not its verification — that is exactly what
    // `enrollThisDevice`/`device-link.ts` already re-verify client-side before calling this).
    // A rotation's `PublishIdentityRoot` call carries the new root plus roster S+1 (every prior
    // entry inactive, no new device yet — the node's own real `appendRoster` requires an active
    // entry's device to already have a saved certificate, which the following `EnrollDevice`
    // call provides); bootstrap's generation-1 call carries no roster at all.
    publishIdentityRoot: vi.fn<(request: PublishIdentityRootRequest) => Promise<unknown>>(
      (request) => {
        const root = request.identityRoot;
        if (root === undefined) throw new Error('fake node: PublishIdentityRoot with no root');
        node.rootByActor.set(actorId, root);
        if (request.roster !== undefined) {
          const existing = node.rosterByActor.get(actorId);
          node.rosterByActor.set(actorId, {
            roster: request.roster,
            certificates: existing?.certificates ?? [],
          });
        }
        return Promise.resolve(undefined);
      },
    ),
    enrollDevice: vi.fn<(request: EnrollDeviceRequest) => Promise<unknown>>((request) => {
      const certificate = request.certificate;
      const roster = request.roster;
      if (certificate === undefined || roster === undefined) {
        throw new Error('fake node: EnrollDevice missing certificate or roster');
      }
      const existing = node.rosterByActor.get(actorId);
      node.rosterByActor.set(actorId, {
        roster,
        certificates: [...(existing?.certificates ?? []), certificate],
      });
      return Promise.resolve(undefined);
    }),
    getDeviceRoster: vi.fn<(actorId: string) => Promise<EnrollmentDeviceRoster>>((forActorId) =>
      Promise.resolve(
        node.rosterByActor.get(forActorId) ?? { roster: undefined, certificates: [] },
      ),
    ),
    beginDeviceLink: vi.fn<
      (request: E2eeServiceBeginDeviceLinkRequest) => Promise<E2eeServiceBeginDeviceLinkResponse>
    >((request) => {
      const offer = request.offer;
      if (offer === undefined) throw new Error('fake node: BeginDeviceLink with no offer');
      fakeLinkIdCounter += 1;
      const linkId = `fake-link-${String(fakeLinkIdCounter)}`;
      const stored: E2eeDeviceLinkOffer = { ...offer, linkId };
      const existing = node.pendingOffersByActor.get(actorId) ?? [];
      node.pendingOffersByActor.set(actorId, [...existing, stored]);
      return Promise.resolve(
        create(E2eeServiceBeginDeviceLinkResponseSchema, { linkId, expiresAt: offer.createdAt }),
      );
    }),
    listPendingDeviceLinks: vi.fn<() => Promise<E2eeServiceListPendingDeviceLinksResponse>>(() =>
      Promise.resolve(
        create(E2eeServiceListPendingDeviceLinksResponseSchema, {
          offers: node.pendingOffersByActor.get(actorId) ?? [],
        }),
      ),
    ),
    cancelDeviceLink: vi.fn<(linkId: string) => Promise<unknown>>((linkId) => {
      const existing = node.pendingOffersByActor.get(actorId) ?? [];
      node.pendingOffersByActor.set(
        actorId,
        existing.filter((candidate) => candidate.linkId !== linkId),
      );
      return Promise.resolve(undefined);
    }),
    revokeDevice: vi.fn<(request: RevokeDeviceRequest) => Promise<unknown>>((request) => {
      const roster = request.roster;
      if (roster === undefined) throw new Error('fake node: RevokeDevice with no roster');
      const existing = node.rosterByActor.get(actorId);
      node.rosterByActor.set(actorId, { roster, certificates: existing?.certificates ?? [] });
      return Promise.resolve(undefined);
    }),
  };
}

// ---------------------------------------------------------------------------
// Messaging fake node additions — two-device-interop.test.ts (issue #273)
// ---------------------------------------------------------------------------

/** Registers one enrolled device's local identity with the fake node so
 * `fakeMessagingSendTransport`'s `claimPrekeyBundles` has a bundle to hand out for it — the
 * fake's stand-in for the node's own prekey store, populated once `EnrollDevice`/an approved
 * link lands for that device. */
export function registerMessagingDevice(node: FakeE2eeNode, identity: LocalDeviceIdentity): void {
  node.messagingIdentities.set(identity.deviceId, identity);
}

/** Reconstructs the node's CURRENTLY SERVED roster for `actorId` as a `VerifiedRosterSnapshot`,
 * the same way any transport client independently re-verifies it on every call — never reused
 * from a registered device's own, possibly stale, locally cached `identity.ownRoster` (ADR 0020
 * §2/§4). This is what makes `claimPrekeyBundles`/`loadPeerRoster` here match a real node: they
 * always answer with the latest roster, regardless of what any one device last saved locally. */
function verifiedServedRoster(
  node: FakeE2eeNode,
  actorId: string,
  nowMs: number,
): VerifiedRosterSnapshot {
  const rootWire = node.rootByActor.get(actorId);
  const served = node.rosterByActor.get(actorId);
  if (rootWire === undefined || served?.roster === undefined) {
    throw new Error('fake node: no served identity root/roster for actor');
  }
  const root = verifyMessagingRoot({
    rootBytes: rootWire.rootBytes,
    selfSignature: rootWire.selfSignature,
    nowMs,
  });
  return verifyRosterSnapshot({
    rosterBytes: served.roster.rosterBytes,
    rootSignature: served.roster.rootSignature,
    root,
    certificates: served.certificates.map((certificate) => ({
      certificateBytes: certificate.certificateBytes,
      rootSignature: certificate.rootSignature,
    })),
    nowMs,
  });
}

function fakeMailboxFor(node: FakeE2eeNode, deviceId: string): E2eeMailboxEnvelopeLike[] {
  let box = node.mailboxesByDevice.get(deviceId);
  if (box === undefined) {
    box = [];
    node.mailboxesByDevice.set(deviceId, box);
  }
  return box;
}

let fakeMessagingEnvelopeIdCounter = 0;

export interface FakeMessagingTransportOptions {
  readonly node: FakeE2eeNode;
  readonly actorId: string;
  readonly deviceId: string;
  /** Every actor whose active devices the fanout must cover — own-device fanout (own OTHER
   * devices) is computed here from the node's roster, exactly as the real server does. */
  readonly participantActorIds: readonly string[];
  readonly membershipEpoch?: bigint;
  readonly nowMs?: () => number;
}

/** One device's send-side messaging transport bound to a shared fake node — mirrors
 * `fakeTransport`'s per-device binding, but for the runtime's `E2eeSendTransport` seam
 * (`runtime-session.ts`) rather than enrollment/linking. `loadFanoutPlan` and
 * `claimPrekeyBundles` both derive targets from the node's CURRENT roster, so a fanout always
 * covers every active device of every participant actor, including the sender's own other
 * devices — the server-side own-device fanout ADR 0020 §7 describes. */
export function fakeMessagingSendTransport(
  options: FakeMessagingTransportOptions,
): E2eeSendTransport {
  const { node, actorId, participantActorIds } = options;
  const nowMs = options.nowMs ?? ((): number => Date.now());
  const membershipEpoch = options.membershipEpoch ?? 1n;
  return {
    loadFanoutPlan: (conversationId) => {
      const targets: { actorId: string; deviceId: string }[] = [];
      for (const memberActorId of participantActorIds) {
        const served = node.rosterByActor.get(memberActorId);
        if (served?.roster === undefined) continue;
        const view = rosterViewFromWire(served.roster);
        for (const deviceId of activeDeviceIds(view)) {
          targets.push({ actorId: memberActorId, deviceId });
        }
      }
      return Promise.resolve({ conversationId, membershipEpoch, targets });
    },
    claimPrekeyBundles: ({ actorIds }) => {
      const now = nowMs();
      const out: ClaimedPeerBundle[] = [];
      for (const claimActorId of actorIds) {
        const served = node.rosterByActor.get(claimActorId);
        if (served?.roster === undefined) continue;
        const view = rosterViewFromWire(served.roster);
        const roster = verifiedServedRoster(node, claimActorId, now);
        for (const deviceId of activeDeviceIds(view)) {
          const identity = node.messagingIdentities.get(deviceId);
          if (identity === undefined) continue;
          const oneTime = identity.oneTimePreKeys[0];
          // Verifies the device's own already-signed bundle bytes against the FRESHLY served
          // roster (`roster`, above) rather than `identity.ownRoster` — mirrors the real
          // client's `claimPrekeyBundles` (`transports.ts`), which never trusts a registered
          // device's possibly-stale own snapshot for this. `identity.ownRoster` here is only
          // ever `registerMessagingDevice`'s one-time-frozen snapshot from whenever that
          // device last called it — using it would reintroduce issue #277's staleness inside
          // the fake node itself.
          const bundle = verifyPreKeyBundle({
            bundleBytes: identity.ownBundle.bundleBytes,
            deviceSignature: identity.ownBundle.deviceSignature,
            certificateBytes: identity.selfDevice.certificateBytes,
            certificateRootSignature: identity.selfDevice.rootSignature,
            ...(oneTime === undefined
              ? {}
              : { oneTimePreKey: { id: oneTime.id, publicKey: oneTime.keyPair.publicKey } }),
            roster,
            nowMs: now,
          });
          out.push({ actorId: claimActorId, deviceId, bundle, roster });
        }
      }
      return Promise.resolve(out);
    },
    sendEnvelopes: (request) => {
      for (const envelope of request.message.deviceEnvelopes) {
        fakeMessagingEnvelopeIdCounter += 1;
        fakeMailboxFor(node, envelope.recipientDeviceId).push({
          envelopeId: `fake-msg-env-${String(fakeMessagingEnvelopeIdCounter)}`,
          logicalMessageId: request.message.logicalMessageId,
          conversationId: request.conversationId,
          membershipEpoch: request.message.membershipEpoch,
          senderActorId: actorId,
          senderDeviceId: request.senderDeviceId,
          recipientDeviceId: envelope.recipientDeviceId,
          encryptedHeader: envelope.encryptedHeader,
          ciphertext: envelope.ciphertext,
          frankingCommitment: request.message.frankingCommitment,
          frankingTag: { profile: request.message.frankingProfile },
        });
      }
      return Promise.resolve(undefined);
    },
  };
}

/** One device's receive-side messaging transport bound to a shared fake node (mirrors
 * `fakeMessagingSendTransport`'s binding, for `E2eeMailboxTransport`). */
export function fakeMessagingMailboxTransport(options: {
  readonly node: FakeE2eeNode;
  readonly deviceId: string;
  readonly nowMs?: () => number;
}): E2eeMailboxTransport {
  const { node, deviceId } = options;
  const nowMs = options.nowMs ?? ((): number => Date.now());
  return {
    listMailboxPage: (cursor) => {
      const box = fakeMailboxFor(node, deviceId);
      const start = cursor === '' ? 0 : Number(cursor);
      const page = box.slice(start, start + 50);
      const next = start + page.length;
      return Promise.resolve({
        envelopes: page,
        nextCursor: next < box.length ? String(next) : '',
      });
    },
    acknowledge: (ids) => {
      const remaining = fakeMailboxFor(node, deviceId).filter(
        (envelope) => !ids.includes(envelope.envelopeId),
      );
      node.mailboxesByDevice.set(deviceId, remaining);
      return Promise.resolve();
    },
    loadPeerRoster: (actorId) => Promise.resolve(verifiedServedRoster(node, actorId, nowMs())),
  };
}
