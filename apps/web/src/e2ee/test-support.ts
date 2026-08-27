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
} from '@patches/proto/es';
import { vi, type Mock } from 'vitest';
import type { DoubleRatchetState } from '@patches/crypto';
import { E2EE_PROTOCOL_V1 } from '@patches/domain';

import type {
  EnrollmentCapability,
  EnrollmentDeviceRoster,
  EnrollmentTransport,
} from './enrollment.js';
import type { RatchetSessionVault, VaultOpenInfo } from './vault.js';

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
}

export function createFakeE2eeNode(): FakeE2eeNode {
  return { rosterByActor: new Map(), pendingOffersByActor: new Map() };
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
    getIdentityRoot: vi.fn<(actorId: string) => Promise<E2eeIdentityRoot | undefined>>(() =>
      Promise.resolve(undefined),
    ),
    publishIdentityRoot: vi.fn<(request: PublishIdentityRootRequest) => Promise<unknown>>(() =>
      Promise.resolve(undefined),
    ),
    enrollDevice: vi.fn<(request: EnrollDeviceRequest) => Promise<unknown>>(() =>
      Promise.resolve(undefined),
    ),
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
  };
}
