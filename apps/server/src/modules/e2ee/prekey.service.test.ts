import {
  Actor as ActorEntity,
  Block,
  E2eeDeviceIdentity as E2eeDeviceIdentityEntity,
  E2eeIdentityRoot as E2eeIdentityRootEntity,
  E2eeOneTimePrekey as E2eeOneTimePrekeyEntity,
  E2eeOneTimePrekeyKeyId as E2eeOneTimePrekeyKeyIdEntity,
  E2eeSignedPrekey as E2eeSignedPrekeyEntity,
} from '@patches/database';
import { E2EE_ONE_TIME_PREKEY_TARGET } from '@patches/domain';
import { describe, expect, it, vi } from 'vitest';
import type { DataSource, EntityManager } from 'typeorm';

import { encodeCertificateTranscript } from './e2ee.codec.js';
import { type E2eeRateLimitService } from './e2ee-rate-limit.service.js';
import { E2eePrekeyService } from './prekey.service.js';

// None of these tests exercise the identity-write rate limiter (issue #269) — they assert on
// storage/claim behavior — so a no-op stand-in keeps `uploadPrekeys`/`claimPrekeyBundles`
// callable without a real `DbRateLimitStore`.
const noopRateLimits = {
  consumeIdentityWrite: vi.fn().mockResolvedValue(undefined),
} as unknown as E2eeRateLimitService;

vi.mock('./roster-chain.js', () => ({
  // `claimPrekeyBundles` only needs the current row and its decoded entries.
  loadCurrentRosterRow: vi.fn().mockResolvedValue({
    actorId: 'target',
    sequence: '3',
    previousDigest: Buffer.alloc(32),
    digest: Buffer.alloc(32),
    rosterBytes: Buffer.alloc(0),
    rootSignature: Buffer.alloc(64),
    createdAt: new Date(0),
  }),
  decodeStoredRoster: vi.fn().mockReturnValue({
    entries: [
      {
        deviceId: 'device-1',
        certificateDigest: new Uint8Array(32),
        active: true,
        addedAt: new Date(0),
        revokedAt: null,
      },
    ],
    rootGeneration: 2,
  }),
  loadActiveRoot: vi.fn(),
}));

function certificateBytes(): Buffer {
  return Buffer.from(
    encodeCertificateTranscript({
      actorId: 'target',
      deviceId: 'device-1',
      rootGeneration: 2,
      rootPublicKey: new Uint8Array(32).fill(9),
      certificateVersion: 1,
      signingPublicKey: new Uint8Array(32).fill(1),
      agreementPublicKey: new Uint8Array(32).fill(2),
      supportedProtocolVersions: ['E2EE_V1'],
      createdAt: new Date(0),
      expiresAt: new Date(Date.now() + 3_600_000),
    }),
  );
}

describe('UploadPrekeys inventory-capacity rejection (audit P2)', () => {
  function run(oneTimePrekeys: number, ledgerInsertError?: unknown): Promise<unknown> {
    const manager = {
      getRepository(entity: unknown) {
        if (entity === E2eeDeviceIdentityEntity)
          return {
            findOne: vi.fn().mockResolvedValue({
              id: 'device-row-1',
              actorId: 'actor',
              deviceId: 'device-1',
              revokedAt: null,
            }),
          };
        if (entity === E2eeSignedPrekeyEntity)
          return {
            findOne: vi.fn().mockResolvedValue({
              deviceIdentityId: 'device-row-1',
              keyId: '1',
              publicKey: Buffer.alloc(32),
              signature: Buffer.alloc(64),
              createdAt: new Date(0),
              expiresAt: new Date(86_400_000),
              retiredAt: null,
            }),
          };
        if (entity === E2eeOneTimePrekeyEntity) {
          return {
            // One slot left at the target.
            count: vi.fn().mockResolvedValue(E2EE_ONE_TIME_PREKEY_TARGET - 1),
            insert: vi.fn(() => Promise.resolve(undefined)),
          };
        }
        if (entity === E2eeOneTimePrekeyKeyIdEntity) {
          return {
            insert:
              ledgerInsertError === undefined
                ? vi.fn().mockResolvedValue(undefined)
                : vi.fn().mockRejectedValue(ledgerInsertError),
          };
        }
        throw new Error(`Unexpected repository: ${String(entity)}`);
      },
    } as unknown as EntityManager;

    return new E2eePrekeyService(
      {
        transaction: (body: (m: EntityManager) => Promise<unknown>) => body(manager),
      } as unknown as DataSource,
      noopRateLimits,
    ).uploadPrekeys('actor', {
      deviceId: 'device-1',
      signedPrekey: undefined,
      prekeyBundleBytes: Buffer.alloc(0),
      prekeyBundleSignature: Buffer.alloc(0),
      oneTimePrekeys: Array.from({ length: oneTimePrekeys }, (_, index) => ({
        keyId: String(index + 100),
        publicKey: Buffer.alloc(32, index + 1),
      })),
    });
  }

  it('rejects an upload that would exceed the remaining inventory capacity instead of truncating', async () => {
    await expect(run(2)).rejects.toThrow(/inventory target of/);
  });

  it('still accepts an upload that fits the remaining capacity', async () => {
    await expect(run(1)).resolves.toMatchObject({
      oneTimePrekeyCount: E2EE_ONE_TIME_PREKEY_TARGET,
    });
  });

  it('rethrows an unrelated ledger unique violation instead of mapping it to a duplicate key id', async () => {
    const error = { code: '23505', constraint: 'some_other_unique_constraint' };
    await expect(run(1, error)).rejects.toBe(error);
  });
});

describe('E2eePrekeyService.claimPrekeyBundles hardening (audit P1/P2)', () => {
  function setup(options: { readonly targetDeletedAt: Date | null }): {
    readonly dataSource: unknown;
    readonly manager: EntityManager;
    readonly queryMock: ReturnType<typeof vi.fn>;
    readonly transactionUsed: () => boolean;
  } {
    let transactionUsed = false;
    const queryMock = vi.fn((sql: string) =>
      Promise.resolve(sql.includes('count(*)') ? [{ count: 0 }] : [[], 0]),
    );
    const manager = {
      getRepository(entity: unknown) {
        const repo =
          entity === ActorEntity
            ? {
                find: vi
                  .fn()
                  .mockResolvedValue([{ id: 'target', deletedAt: options.targetDeletedAt }]),
              }
            : entity === Block
              ? { find: vi.fn().mockResolvedValue([]) }
              : entity === E2eeIdentityRootEntity
                ? {
                    findOne: vi.fn().mockResolvedValue({
                      id: 'root-1',
                      generation: 2,
                      publicKey: Buffer.alloc(32),
                      rotatedAt: null,
                      createdAt: new Date(0),
                    }),
                  }
                : entity === E2eeDeviceIdentityEntity
                  ? {
                      find: vi.fn().mockResolvedValue([
                        {
                          id: 'device-row-1',
                          actorId: 'target',
                          deviceId: 'device-1',
                          generation: 2,
                          signingPublicKey: Buffer.alloc(32, 1),
                          agreementPublicKey: Buffer.alloc(32, 2),
                          certificateBytes: certificateBytes(),
                          rootSignature: Buffer.alloc(64),
                          certificateCreatedAt: new Date(0),
                          expiresAt: new Date(Date.now() + 86_400_000),
                          revokedAt: null,
                        },
                      ]),
                    }
                  : entity === E2eeSignedPrekeyEntity
                    ? {
                        findOne: vi.fn().mockResolvedValue({
                          deviceIdentityId: 'device-row-1',
                          keyId: '4',
                          publicKey: Buffer.alloc(32),
                          signature: Buffer.alloc(64),
                          createdAt: new Date(0),
                          expiresAt: new Date(86_400_000),
                          retiredAt: null,
                        }),
                      }
                    : {};
        return repo;
      },
      query: queryMock,
    } as unknown as EntityManager;
    const dataSource = {
      transaction: async (body: (m: EntityManager) => Promise<unknown>) => {
        transactionUsed = true;
        return body(manager);
      },
    };
    return { dataSource, manager, queryMock, transactionUsed: () => transactionUsed };
  }

  it('runs entirely inside one claiming transaction', async () => {
    const { dataSource, transactionUsed, queryMock } = setup({ targetDeletedAt: null });
    await new E2eePrekeyService(dataSource as DataSource, noopRateLimits).claimPrekeyBundles(
      'caller',
      {
        conversationId: '',
        actorIds: ['target'],
        deviceIds: [],
      },
    );
    expect(transactionUsed()).toBe(true);
    expect(queryMock).toHaveBeenCalled();
  });

  it('never serves a deleted actor’s bundles between deletion and purge', async () => {
    const { dataSource, queryMock } = setup({ targetDeletedAt: new Date() });
    const response = await new E2eePrekeyService(
      dataSource as DataSource,
      noopRateLimits,
    ).claimPrekeyBundles('caller', { conversationId: '', actorIds: ['target'], deviceIds: [] });
    expect(response.bundles).toEqual([]);
    expect(response.rosters).toEqual([]);
    // The drain/consume SQL must never have run for a deleted actor.
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('checks the per-device drain budget through the transactional manager before consuming', async () => {
    const { dataSource, queryMock } = setup({ targetDeletedAt: null });
    await new E2eePrekeyService(dataSource as DataSource, noopRateLimits).claimPrekeyBundles(
      'caller',
      {
        conversationId: '',
        actorIds: ['target'],
        deviceIds: [],
      },
    );
    const sqls = queryMock.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(sqls.some((sql) => sql.includes('count(*)'))).toBe(true);
    expect(sqls.some((sql) => sql.includes('FOR UPDATE SKIP LOCKED'))).toBe(true);
    // Count strictly before consume.
    expect(sqls.findIndex((sql) => sql.includes('count(*)'))).toBeLessThan(
      sqls.findIndex((sql) => sql.includes('SKIP LOCKED')),
    );
  });
});
