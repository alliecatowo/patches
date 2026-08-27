import { generateSigningKeyPair, sign } from '@patches/crypto';
import { E2eeDeviceIdentity as E2eeDeviceIdentityEntity } from '@patches/database';
import { describe, expect, it, vi } from 'vitest';
import type { DataSource, EntityManager } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { e2eeDigest } from './e2ee-crypto.adapter.js';
import { encodeCertificateTranscript, encodePrekeyBundleTranscript } from './e2ee.codec.js';
import { type E2eeRateLimitService } from './e2ee-rate-limit.service.js';
import { E2eeDeviceRosterService } from './device-roster.service.js';

const { loadActiveRoot, appendRoster } = vi.hoisted(() => ({
  loadActiveRoot: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  appendRoster: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));

vi.mock('./roster-chain.js', () => ({
  loadActiveRoot,
  appendRoster,
  loadCurrentRosterRow: vi.fn().mockResolvedValue(null),
  decodeStoredRoster: vi.fn().mockReturnValue({ entries: [], rootGeneration: 1 }),
  toIdentityRootView: (root: { actorId: string; generation: number; publicKey: Uint8Array }) => ({
    actorId: root.actorId,
    generation: root.generation,
    publicKey: root.publicKey,
    rootBytes: new Uint8Array(0),
    selfSignature: new Uint8Array(0),
  }),
}));

// Certificate/prekey `expiresAt` must be in the future relative to the real clock — enrollDevice
// checks it against `new Date()`, not an injectable clock — so these are derived from `Date.now()`
// rather than a fixed epoch.
// Whole seconds only: the proto `Timestamp` round-trip through `CREATED_AT_TIMESTAMP`/
// `EXPIRES_AT_TIMESTAMP` drops sub-second precision, and `enrollDevice`'s
// `assertBytesEqual(encodeCertificateTranscript(...), certView.certificateBytes, ...)` requires
// the transcript rebuilt from the decoded proto timestamp to byte-match the one built here.
const CREATED_AT_MS = Math.floor((Date.now() - 60_000) / 1000) * 1000;
const EXPIRES_AT_MS = Math.floor((Date.now() + 86_400_000) / 1000) * 1000;
const CREATED_AT = new Date(CREATED_AT_MS);
const EXPIRES_AT = new Date(EXPIRES_AT_MS);
const CREATED_AT_TIMESTAMP = { seconds: String(Math.floor(CREATED_AT_MS / 1000)), nanos: 0 };
const EXPIRES_AT_TIMESTAMP = { seconds: String(Math.floor(EXPIRES_AT_MS / 1000)), nanos: 0 };

function fakeRateLimits(consumeIdentityWrite = vi.fn().mockResolvedValue(undefined)) {
  return { consumeIdentityWrite } as unknown as E2eeRateLimitService;
}

describe('E2eeDeviceRosterService (issues #267, #268, #269)', () => {
  const rootKeys = generateSigningKeyPair();
  const deviceKeys = generateSigningKeyPair();
  const fakeRoot = {
    id: 'root-1',
    actorId: 'actor-1',
    generation: 1,
    publicKey: rootKeys.publicKey,
    rotatedAt: null,
  };

  function certView() {
    const certificateBytes = encodeCertificateTranscript({
      actorId: 'actor-1',
      deviceId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      rootGeneration: 1,
      rootPublicKey: rootKeys.publicKey,
      certificateVersion: 1,
      signingPublicKey: deviceKeys.publicKey,
      agreementPublicKey: new Uint8Array(32).fill(7),
      supportedProtocolVersions: ['patches-e2ee-v1'],
      createdAt: CREATED_AT,
      expiresAt: EXPIRES_AT,
    });
    const rootSignature = sign(rootKeys.privateKey, certificateBytes);
    const certificateDigest = e2eeDigest(certificateBytes);
    return { certificateBytes, rootSignature, certificateDigest };
  }

  /** A `toProtoRoster`-shaped roster row, so `appendRoster`'s mocked return maps cleanly through
   * `E2eeDeviceRosterService`'s real, unmocked response mapping. */
  function fakeRosterRow() {
    return {
      id: 'roster-1',
      actorId: 'actor-1',
      sequence: '2',
      previousDigest: Buffer.alloc(32),
      digest: Buffer.alloc(32),
      rosterBytes: Buffer.alloc(0),
      rootSignature: Buffer.alloc(64),
      createdAt: CREATED_AT,
    };
  }

  function fakeRosterEntry(deviceId: string, certificateDigest: Uint8Array, active: boolean) {
    return {
      deviceId,
      certificateDigest,
      active,
      addedAt: CREATED_AT,
      revokedAt: active ? undefined : CREATED_AT,
    };
  }

  function enrollRequest() {
    const { certificateBytes, rootSignature, certificateDigest } = certView();
    const signedPrekeyId = 1n;
    const signedPrekeyCreatedAt = CREATED_AT;
    const signedPrekeyExpiresAt = EXPIRES_AT;
    const signedPrekeyPublicKey = new Uint8Array(32).fill(3);
    const prekeyBundleBytes = encodePrekeyBundleTranscript({
      certificateDigest,
      actorId: 'actor-1',
      deviceId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      signedPrekeyId,
      signedPrekeyPublicKey,
      signedPrekeyCreatedAt,
      signedPrekeyExpiresAt,
    });
    const bundleSignature = sign(deviceKeys.privateKey, prekeyBundleBytes);
    return {
      certificate: {
        actorId: 'actor-1',
        deviceId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        rootGeneration: 1,
        certificateVersion: 1,
        signingPublicKey: Buffer.from(deviceKeys.publicKey),
        agreementPublicKey: Buffer.alloc(32, 7),
        supportedProtocolVersions: ['patches-e2ee-v1'],
        createdAt: CREATED_AT_TIMESTAMP,
        expiresAt: EXPIRES_AT_TIMESTAMP,
        certificateBytes: Buffer.from(certificateBytes),
        rootSignature: Buffer.from(rootSignature),
        certificateDigest: Buffer.from(certificateDigest),
      },
      roster: { actorId: 'actor-1' },
      signedPrekey: {
        keyId: signedPrekeyId.toString(),
        publicKey: Buffer.from(signedPrekeyPublicKey),
        createdAt: CREATED_AT_TIMESTAMP,
        expiresAt: EXPIRES_AT_TIMESTAMP,
        signature: Buffer.from(bundleSignature),
      },
      prekeyBundleBytes: Buffer.from(prekeyBundleBytes),
      prekeyBundleSignature: Buffer.from(bundleSignature),
      oneTimePrekeys: [],
    };
  }

  function fakeManager(callOrder: string[]): EntityManager {
    const deviceRepo = {
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn((input: unknown) => input),
      save: vi.fn((input: Record<string, unknown>) => {
        callOrder.push('save-device-row');
        return Promise.resolve({ id: 'device-row-1', ...input });
      }),
    };
    return {
      getRepository: vi.fn((entity: unknown) =>
        entity === E2eeDeviceIdentityEntity
          ? deviceRepo
          : {
              save: vi.fn((input: unknown) => Promise.resolve(input)),
              create: vi.fn((input: unknown) => input),
              findOne: vi.fn().mockResolvedValue(null),
              insert: vi.fn().mockResolvedValue(undefined),
              count: vi.fn().mockResolvedValue(0),
            },
      ),
    } as unknown as EntityManager;
  }

  function fakeDataSource(manager: EntityManager): DataSource {
    return {
      transaction: (body: (m: EntityManager) => Promise<unknown>) => body(manager),
    } as unknown as DataSource;
  }

  it('locks the active identity root before appending a roster on enrollDevice (#267)', async () => {
    loadActiveRoot.mockResolvedValue(fakeRoot);
    appendRoster.mockResolvedValue({
      row: fakeRosterRow(),
      entries: [
        fakeRosterEntry('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', certView().certificateDigest, true),
      ],
    });
    const service = new E2eeDeviceRosterService(fakeDataSource(fakeManager([])), fakeRateLimits());
    await service.enrollDevice('actor-1', enrollRequest() as never);
    expect(loadActiveRoot).toHaveBeenCalledWith(expect.anything(), 'actor-1', { lock: true });
  });

  it('saves the enrolling device row before appending the roster (#268)', async () => {
    loadActiveRoot.mockResolvedValue(fakeRoot);
    const callOrder: string[] = [];
    appendRoster.mockImplementation(() => {
      callOrder.push('append-roster');
      return Promise.resolve({
        row: fakeRosterRow(),
        entries: [
          fakeRosterEntry(
            'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            certView().certificateDigest,
            true,
          ),
        ],
      });
    });
    const service = new E2eeDeviceRosterService(
      fakeDataSource(fakeManager(callOrder)),
      fakeRateLimits(),
    );
    await service.enrollDevice('actor-1', enrollRequest() as never);
    expect(callOrder).toEqual(['save-device-row', 'append-roster']);
  });

  it('locks the active identity root on revokeDevice and publishDeviceRoster (#267)', async () => {
    loadActiveRoot.mockResolvedValue(fakeRoot);
    appendRoster.mockResolvedValue({
      row: {
        id: 'roster-1',
        actorId: 'actor-1',
        sequence: '2',
        previousDigest: Buffer.alloc(32),
        digest: Buffer.alloc(32),
        rosterBytes: Buffer.alloc(0),
        rootSignature: Buffer.alloc(64),
        createdAt: CREATED_AT,
      },
      entries: [
        {
          deviceId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          certificateDigest: new Uint8Array(32),
          active: false,
          addedAt: CREATED_AT,
          revokedAt: CREATED_AT,
        },
      ],
    });
    const revokeManager = {
      getRepository: vi.fn(() => ({
        findOne: vi.fn().mockResolvedValue({
          id: 'device-row-1',
          actorId: 'actor-1',
          deviceId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          revokedAt: null,
        }),
        save: vi.fn((input: unknown) => Promise.resolve(input)),
        delete: vi.fn().mockResolvedValue({ affected: 0 }),
      })),
    } as unknown as EntityManager;

    const revokeService = new E2eeDeviceRosterService(
      fakeDataSource(revokeManager),
      fakeRateLimits(),
    );
    await revokeService.revokeDevice('actor-1', {
      deviceId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      roster: { actorId: 'actor-1' },
    } as never);
    expect(loadActiveRoot).toHaveBeenLastCalledWith(expect.anything(), 'actor-1', { lock: true });

    const publishService = new E2eeDeviceRosterService(
      fakeDataSource(fakeManager([])),
      fakeRateLimits(),
    );
    await publishService.publishDeviceRoster('actor-1', {
      roster: { actorId: 'actor-1' },
    } as never);
    expect(loadActiveRoot).toHaveBeenLastCalledWith(expect.anything(), 'actor-1', { lock: true });
  });

  it('checks the identity-write rate limit before opening the transaction (#269)', async () => {
    const transaction = vi.fn();
    const dataSource = { transaction } as unknown as DataSource;
    const rejection = new AppError('RATE_LIMITED', 'Too many identity writes.');
    const service = new E2eeDeviceRosterService(
      dataSource,
      fakeRateLimits(vi.fn().mockRejectedValue(rejection)),
    );
    await expect(
      service.publishDeviceRoster('actor-1', { roster: { actorId: 'actor-1' } } as never),
    ).rejects.toBe(rejection);
    expect(transaction).not.toHaveBeenCalled();
  });
});
