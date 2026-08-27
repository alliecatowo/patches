/**
 * Transport seam tests. The load-bearing assertion is the one B-131 depends on:
 * `GetIdentityRoot` distinguishes "the node says there is no root" (`NOT_FOUND` →
 * `undefined`) from "the request failed" (anything else → throws). Collapsing the two is
 * what lets a client mint an identity the server disagrees with.
 */
import { Code, ConnectError } from '@connectrpc/connect';
import { describe, expect, it, vi } from 'vitest';

import { generateEnrollment } from './enrollment.js';
import {
  createWebE2eeTransports,
  createWebEnrollmentTransport,
  type E2eeApiSurface,
} from './transports.js';
import type { LocalDeviceIdentity } from './local-identity.js';

// Minted against the REAL clock (not the fixed `NOW` fixture): `createWebE2eeTransports`'s
// `claimPrekeyBundles`/`loadPeerRoster` verify a fetched peer identity against
// `Date.now()`, not an injectable test clock, so this certificate's validity window must
// actually cover the moment the test runs.
const peerIdentity = generateEnrollment({ actorId: 'actor-peer', nowMs: Date.now() }).record
  .identity;

/** Maps a locally-verified identity back into the wire shapes the node would serve for
 * it (the inverse of `enrollment.ts`'s `buildEnrollRequest`), so a fake transport hands
 * the adapter real, verifiable bytes instead of stubbing verification away. */
function wireIdentityRoot(identity: typeof peerIdentity): { identityRoot: unknown } {
  const root = identity.ownRoster.root;
  return {
    identityRoot: {
      actorId: root.actorId,
      generation: root.generation,
      publicKey: root.publicKey,
      rootBytes: root.rootBytes,
      selfSignature: root.selfSignature,
      previousRootSignature: new Uint8Array(0),
    },
  };
}

function wireDeviceRoster(identity: typeof peerIdentity): unknown {
  const roster = identity.ownRoster;
  const device = identity.selfDevice;
  return {
    roster: {
      actorId: roster.actorId,
      sequence: BigInt(roster.sequence),
      rootGeneration: roster.rootGeneration,
      previousDigest: roster.previousDigest,
      digest: roster.rosterDigest,
      rosterBytes: roster.rosterBytes,
      rootSignature: roster.rootSignature,
      entries: roster.entries.map((entry) => ({
        deviceId: entry.deviceId,
        certificateDigest: entry.certificateDigest,
        active: entry.active,
      })),
    },
    certificates: [
      { certificateBytes: device.certificateBytes, rootSignature: device.rootSignature },
    ],
  };
}

function wireClaimResponse(identity: typeof peerIdentity): unknown {
  const device = identity.selfDevice;
  return {
    bundles: [
      {
        actorId: identity.actorId,
        deviceId: identity.deviceId,
        deviceCertificate: {
          certificateBytes: device.certificateBytes,
          rootSignature: device.rootSignature,
        },
        signedPrekey: { keyId: BigInt(identity.signedPreKey.id) },
        oneTimePrekey: undefined,
        oneTimePrekeyExhausted: true,
        bundleBytes: identity.ownBundle.bundleBytes,
        deviceSignature: identity.ownBundle.deviceSignature,
      },
    ],
    rosters: [],
  };
}

/** The seams only ever call the handful of RPCs stubbed per test; the cast keeps the
 * fixture from having to construct a whole Connect client. */
function apiWith(e2ee: Record<string, unknown>): E2eeApiSurface {
  return { e2ee } as unknown as E2eeApiSurface;
}

const identity = {
  actorId: 'actor-me',
  deviceId: 'device-me',
  ownRoster: { roster: {}, rootSignature: new Uint8Array(0) },
} as unknown as LocalDeviceIdentity;

describe('createWebEnrollmentTransport — getIdentityRoot', () => {
  it('reports absence when the node answers NOT_FOUND', async () => {
    const getIdentityRoot = vi.fn(() => Promise.reject(new ConnectError('no root', Code.NotFound)));

    const transport = createWebEnrollmentTransport({ api: apiWith({ getIdentityRoot }) });

    await expect(transport.getIdentityRoot('actor-me')).resolves.toBeUndefined();
  });

  it('throws — never reports absence — when the request itself fails', async () => {
    for (const code of [Code.Unavailable, Code.DeadlineExceeded, Code.Internal]) {
      const getIdentityRoot = vi.fn(() => Promise.reject(new ConnectError('boom', code)));
      const transport = createWebEnrollmentTransport({ api: apiWith({ getIdentityRoot }) });

      await expect(transport.getIdentityRoot('actor-me')).rejects.toBeInstanceOf(ConnectError);
    }
  });

  it('throws on a non-Connect failure (an offline fetch rejection)', async () => {
    const getIdentityRoot = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));

    const transport = createWebEnrollmentTransport({ api: apiWith({ getIdentityRoot }) });

    await expect(transport.getIdentityRoot('actor-me')).rejects.toThrow('Failed to fetch');
  });

  it('returns the published root when the node has one', async () => {
    const identityRoot = { actorId: 'actor-me', publicKey: new Uint8Array([1, 2, 3]) };
    const getIdentityRoot = vi.fn(() => Promise.resolve({ identityRoot }));

    const transport = createWebEnrollmentTransport({ api: apiWith({ getIdentityRoot }) });

    await expect(transport.getIdentityRoot('actor-me')).resolves.toBe(identityRoot);
  });
});

describe('createWebEnrollmentTransport — getCapability', () => {
  it('maps an absent capability to undefined and copies the version list', async () => {
    const getE2eeCapability = vi.fn(() => Promise.resolve({ capability: undefined }));
    const absent = createWebEnrollmentTransport({ api: apiWith({ getE2eeCapability }) });
    await expect(absent.getCapability()).resolves.toBeUndefined();

    const versions = ['patches-e2ee-v1'];
    const present = createWebEnrollmentTransport({
      api: apiWith({
        getE2eeCapability: vi.fn(() =>
          Promise.resolve({ capability: { state: 3, supportedProtocolVersions: versions } }),
        ),
      }),
    });

    const capability = await present.getCapability();

    expect(capability).toEqual({ state: 3, supportedProtocolVersions: versions });
    expect(capability?.supportedProtocolVersions).not.toBe(versions);
  });
});

describe('createWebE2eeTransports', () => {
  it('claims and verifies a real peer prekey bundle (ADR 0033)', async () => {
    const getIdentityRoot = vi.fn(() => Promise.resolve(wireIdentityRoot(peerIdentity)));
    const getDeviceRoster = vi.fn(() => Promise.resolve(wireDeviceRoster(peerIdentity)));
    const claimPrekeyBundles = vi.fn(() => Promise.resolve(wireClaimResponse(peerIdentity)));
    const transports = createWebE2eeTransports({
      api: apiWith({ getIdentityRoot, getDeviceRoster, claimPrekeyBundles }),
      identity,
    });

    const claimed = await transports.claimPrekeyBundles({
      conversationId: 'c',
      actorIds: ['actor-peer'],
    });
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.actorId).toBe('actor-peer');
    expect(claimed[0]?.deviceId).toBe(peerIdentity.deviceId);
    expect(claimPrekeyBundles).toHaveBeenCalled();
  });

  it('serves this device its own roster and verifies a real peer roster over the wire', async () => {
    const getIdentityRoot = vi.fn(() => Promise.resolve(wireIdentityRoot(peerIdentity)));
    const getDeviceRoster = vi.fn(() => Promise.resolve(wireDeviceRoster(peerIdentity)));
    const transports = createWebE2eeTransports({
      api: apiWith({ getIdentityRoot, getDeviceRoster }),
      identity,
    });

    await expect(transports.loadPeerRoster('actor-me')).resolves.toBe(identity.ownRoster);
    const peer = await transports.loadPeerRoster('actor-peer');
    expect(peer.devices[0]?.deviceId).toBe(peerIdentity.deviceId);
  });

  it('keeps every active device of every member in the fanout plan (ADR 0020 §7)', async () => {
    const getE2eeConversationState = vi.fn(() =>
      Promise.resolve({
        membershipEpoch: 4n,
        members: [
          { actorId: 'actor-a', supportsE2eeV1: true, activeDeviceIds: ['d1', 'd2'] },
          { actorId: 'actor-b', supportsE2eeV1: false, activeDeviceIds: ['d3'] },
        ],
      }),
    );
    const transports = createWebE2eeTransports({
      api: apiWith({ getE2eeConversationState }),
      identity,
    });

    const plan = await transports.loadFanoutPlan('conv-1');

    expect(plan.membershipEpoch).toBe(4n);
    expect(plan.targets).toEqual([
      { actorId: 'actor-a', deviceId: 'd1' },
      { actorId: 'actor-a', deviceId: 'd2' },
    ]);
  });

  it('acknowledges envelopes for this device with a mutable copy of the id list', async () => {
    let seen: { deviceId: string; envelopeIds: string[] } | undefined;
    const acknowledgeEnvelopes = vi.fn((request: { deviceId: string; envelopeIds: string[] }) => {
      seen = request;
      return Promise.resolve({});
    });
    const transports = createWebE2eeTransports({
      api: apiWith({ acknowledgeEnvelopes }),
      identity,
    });
    const ids: readonly string[] = ['e1', 'e2'];

    await transports.acknowledge(ids);

    expect(seen).toEqual({ deviceId: 'device-me', envelopeIds: ['e1', 'e2'] });
    // The wire init shape wants a mutable array; it must not alias the runtime's view.
    expect(seen?.envelopeIds).not.toBe(ids);
  });

  it('reads the mailbox cursor off the page, defaulting to exhausted', async () => {
    const listMailboxEnvelopes = vi.fn(() => Promise.resolve({ envelopes: [], page: undefined }));
    const transports = createWebE2eeTransports({
      api: apiWith({ listMailboxEnvelopes }),
      identity,
    });

    await expect(transports.listMailboxPage('')).resolves.toEqual({
      envelopes: [],
      nextCursor: '',
    });
  });
});
