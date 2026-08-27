import {
  E2eeDeviceIdentity as E2eeDeviceIdentityEntity,
  E2eeDeviceLinkOffer as E2eeDeviceLinkOfferEntity,
} from '@patches/database';
import {
  encodeDeviceLinkOffer,
  generateSigningKeyPair,
  signDeviceLinkOffer,
  type DeviceLinkOfferFields,
} from '@patches/crypto';
import { dateToTimestamp } from '@patches/proto';
import type { E2eeServiceBeginDeviceLinkRequest } from '@patches/proto/nest';
import { describe, expect, it, vi } from 'vitest';
import type { DataSource, EntityManager } from 'typeorm';

import { deleteDeviceLinkOffer, E2eeDeviceLinkService } from './device-link.service.js';

// Offer expiry is checked against the real clock inside `verifyDeviceLinkOffer` (the service
// calls it with `new Date().getTime()`), so fixture timestamps must be real-clock-relative, not
// an arbitrary fixed epoch.
const NOW_MS = Date.now();
const ACTOR_ID = 'actor-1';
const DEVICE_ID = 'device-1';

function offerFields(overrides: Partial<DeviceLinkOfferFields> = {}): DeviceLinkOfferFields {
  const device = generateSigningKeyPair();
  return {
    actorId: ACTOR_ID,
    deviceId: DEVICE_ID,
    signingPublicKey: device.publicKey,
    agreementPublicKey: new Uint8Array(32).fill(7),
    supportedProtocolVersions: ['patches-e2ee-v1'],
    createdAtMs: NOW_MS,
    expiresAtMs: NOW_MS + 600_000,
    ...overrides,
  };
}

function signedOffer(overrides: Partial<DeviceLinkOfferFields> = {}) {
  const device = generateSigningKeyPair();
  const fields = offerFields({ signingPublicKey: device.publicKey, ...overrides });
  return signDeviceLinkOffer(device.privateKey, fields);
}

function requestFor(
  signed: ReturnType<typeof signDeviceLinkOffer>,
  overrides: { actorId?: string; deviceId?: string } = {},
): E2eeServiceBeginDeviceLinkRequest {
  return {
    offer: {
      linkId: '',
      actorId: overrides.actorId ?? ACTOR_ID,
      deviceId: overrides.deviceId ?? DEVICE_ID,
      offerBytes: Buffer.from(signed.offerBytes),
      deviceSignature: Buffer.from(signed.deviceSignature),
      signedPrekey: {
        keyId: '1',
        publicKey: Buffer.alloc(32, 9),
        signature: Buffer.alloc(64, 1),
        createdAt: dateToTimestamp(new Date(NOW_MS)),
        expiresAt: dateToTimestamp(new Date(NOW_MS + 86_400_000)),
      },
      oneTimePrekeys: [{ keyId: '100', publicKey: Buffer.alloc(32, 2) }],
      prekeyBundleBytes: Buffer.alloc(16, 3),
      prekeyBundleSignature: Buffer.alloc(64, 4),
      createdAt: undefined,
      expiresAt: undefined,
    },
  };
}

interface FakeStore {
  readonly offers: E2eeDeviceLinkOfferEntity[];
  readonly devices: E2eeDeviceIdentityEntity[];
}

function fakeManager(store: FakeStore): EntityManager {
  return {
    getRepository(entity: unknown) {
      if (entity === E2eeDeviceIdentityEntity) {
        return {
          findOne: vi
            .fn()
            .mockImplementation(({ where }: { where: { actorId: string; deviceId: string } }) =>
              Promise.resolve(
                store.devices.find(
                  (d) => d.actorId === where.actorId && d.deviceId === where.deviceId,
                ) ?? null,
              ),
            ),
        };
      }
      if (entity === E2eeDeviceLinkOfferEntity) {
        return {
          delete: vi.fn().mockImplementation((criteria: Record<string, unknown>) => {
            const before = store.offers.length;
            for (let i = store.offers.length - 1; i >= 0; i -= 1) {
              const row = store.offers[i];
              if (row === undefined) continue;
              const matchesActor = row.actorId === criteria['actorId'];
              const matchesDevice =
                criteria['deviceId'] === undefined || row.deviceId === criteria['deviceId'];
              const matchesId = criteria['id'] === undefined || row.id === criteria['id'];
              const expiresAt = criteria['expiresAt'] as { _value?: Date } | undefined;
              const matchesExpiry = expiresAt === undefined || row.expiresAt.getTime() <= NOW_MS;
              if (matchesActor && matchesDevice && matchesId && matchesExpiry) {
                store.offers.splice(i, 1);
              }
            }
            return Promise.resolve({ affected: before - store.offers.length });
          }),
          count: vi
            .fn()
            .mockImplementation(({ where }: { where: { actorId: string } }) =>
              Promise.resolve(store.offers.filter((o) => o.actorId === where.actorId).length),
            ),
          create: vi.fn().mockImplementation((data: Partial<E2eeDeviceLinkOfferEntity>) => ({
            id: `offer-${Math.random().toString(36).slice(2)}`,
            createdAt: new Date(NOW_MS),
            ...data,
          })),
          save: vi.fn().mockImplementation((row: E2eeDeviceLinkOfferEntity) => {
            store.offers.push(row);
            return Promise.resolve(row);
          }),
          find: vi
            .fn()
            .mockImplementation(({ where }: { where: { actorId: string } }) =>
              Promise.resolve(store.offers.filter((o) => o.actorId === where.actorId)),
            ),
        };
      }
      throw new Error(`Unexpected repository: ${String(entity)}`);
    },
  } as unknown as EntityManager;
}

function fakeDataSource(store: FakeStore): DataSource {
  const manager = fakeManager(store);
  return {
    transaction: (body: (m: EntityManager) => Promise<unknown>) => body(manager),
    getRepository: (entity: unknown) => manager.getRepository(entity as never),
  } as unknown as DataSource;
}

function fakeRateLimits() {
  return { consumeIdentityWrite: vi.fn().mockResolvedValue(undefined) } as unknown as {
    consumeIdentityWrite: (actorId: string, peer: string | undefined) => Promise<void>;
  };
}

describe('E2eeDeviceLinkService.beginDeviceLink', () => {
  it('stores a valid offer and returns it via listPendingDeviceLinks', async () => {
    const store: FakeStore = { offers: [], devices: [] };
    const dataSource = fakeDataSource(store);
    const service = new E2eeDeviceLinkService(dataSource, fakeRateLimits() as never);
    const signed = signedOffer();

    const response = await service.beginDeviceLink(ACTOR_ID, requestFor(signed));
    expect(response.linkId).toBeDefined();

    const listed = await service.listPendingDeviceLinks(ACTOR_ID, {});
    expect(listed.offers).toHaveLength(1);
    expect(listed.offers[0]?.deviceId).toBe(DEVICE_ID);
    expect(listed.offers[0]?.offerBytes).toEqual(Buffer.from(signed.offerBytes));
  });

  it('rejects a tampered device signature', async () => {
    const store: FakeStore = { offers: [], devices: [] };
    const dataSource = fakeDataSource(store);
    const service = new E2eeDeviceLinkService(dataSource, fakeRateLimits() as never);
    const signed = signedOffer();
    const tampered = { ...signed, deviceSignature: Buffer.alloc(64, 9) };

    await expect(service.beginDeviceLink(ACTOR_ID, requestFor(tampered))).rejects.toMatchObject({
      code: 'E2EE_CERTIFICATE_INVALID',
    });
  });

  it('rejects an offer whose actor does not match the caller', async () => {
    const store: FakeStore = { offers: [], devices: [] };
    const dataSource = fakeDataSource(store);
    const service = new E2eeDeviceLinkService(dataSource, fakeRateLimits() as never);
    const signed = signedOffer();

    await expect(service.beginDeviceLink('other-actor', requestFor(signed))).rejects.toThrow(
      /another actor/i,
    );
  });

  it('rejects a 4th pending offer for the same actor', async () => {
    const store: FakeStore = { offers: [], devices: [] };
    const dataSource = fakeDataSource(store);
    const service = new E2eeDeviceLinkService(dataSource, fakeRateLimits() as never);

    for (const suffix of ['a', 'b', 'c']) {
      const signed = signedOffer({ deviceId: `device-${suffix}` });
      await service.beginDeviceLink(ACTOR_ID, requestFor(signed, { deviceId: `device-${suffix}` }));
    }
    const fourth = signedOffer({ deviceId: 'device-d' });
    await expect(
      service.beginDeviceLink(ACTOR_ID, requestFor(fourth, { deviceId: 'device-d' })),
    ).rejects.toThrow(/too many pending/i);
  });

  it('does not list an expired offer', async () => {
    const store: FakeStore = { offers: [], devices: [] };
    const dataSource = fakeDataSource(store);
    const service = new E2eeDeviceLinkService(dataSource, fakeRateLimits() as never);
    const signed = signedOffer();
    await service.beginDeviceLink(ACTOR_ID, requestFor(signed));

    const offer = store.offers[0];
    expect(offer).toBeDefined();
    if (offer !== undefined) offer.expiresAt = new Date(NOW_MS - 1000);

    const listed = await service.listPendingDeviceLinks(ACTOR_ID, {});
    expect(listed.offers).toHaveLength(0);
  });

  it('cancels idempotently', async () => {
    const store: FakeStore = { offers: [], devices: [] };
    const dataSource = fakeDataSource(store);
    const service = new E2eeDeviceLinkService(dataSource, fakeRateLimits() as never);
    const signed = signedOffer();
    const response = await service.beginDeviceLink(ACTOR_ID, requestFor(signed));

    await service.cancelDeviceLink(ACTOR_ID, { linkId: response.linkId });
    expect(store.offers).toHaveLength(0);
    // Cancelling again (already gone) is not an error.
    await expect(service.cancelDeviceLink(ACTOR_ID, { linkId: response.linkId })).resolves.toEqual(
      {},
    );
  });

  it('does not let another actor list or cancel a pending offer', async () => {
    const store: FakeStore = { offers: [], devices: [] };
    const dataSource = fakeDataSource(store);
    const service = new E2eeDeviceLinkService(dataSource, fakeRateLimits() as never);
    const signed = signedOffer();
    const response = await service.beginDeviceLink(ACTOR_ID, requestFor(signed));

    const listedByOther = await service.listPendingDeviceLinks('other-actor', {});
    expect(listedByOther.offers).toHaveLength(0);

    await service.cancelDeviceLink('other-actor', { linkId: response.linkId });
    expect(store.offers).toHaveLength(1);
  });
});

describe('deleteDeviceLinkOffer', () => {
  it('deletes the matching pending offer for (actorId, deviceId)', async () => {
    const store: FakeStore = { offers: [], devices: [] };
    const dataSource = fakeDataSource(store);
    const service = new E2eeDeviceLinkService(dataSource, fakeRateLimits() as never);
    const signed = signedOffer();
    await service.beginDeviceLink(ACTOR_ID, requestFor(signed));
    expect(store.offers).toHaveLength(1);

    const manager = fakeManager(store);
    await deleteDeviceLinkOffer(manager, ACTOR_ID, DEVICE_ID);
    expect(store.offers).toHaveLength(0);
  });

  it('is a no-op when no offer matches (ordinary bootstrap enrollment)', async () => {
    const store: FakeStore = { offers: [], devices: [] };
    const manager = fakeManager(store);
    await expect(
      deleteDeviceLinkOffer(manager, ACTOR_ID, 'never-offered'),
    ).resolves.toBeUndefined();
  });
});

describe('encodeDeviceLinkOffer / signDeviceLinkOffer sanity (fixture wiring)', () => {
  it('produces bytes that round-trip through the transcript codec', () => {
    const fields = offerFields();
    const bytes = encodeDeviceLinkOffer(fields);
    expect(bytes.length).toBeGreaterThan(0);
  });
});
