import {
  AdminAuditLog,
  Actor,
  E2eeDeviceIdentity,
  E2eeDeviceRoster,
  E2eeGroupControlEvent,
  E2eeIdentityRoot,
  E2eeLogicalMessage,
  E2eeMailboxEnvelope,
  E2eeOneTimePrekey,
  E2eeReportEvidence,
  E2eeReportEvidenceItem,
  E2eeSignedPrekey,
} from '@patches/database';
import { describe, expect, it, vi } from 'vitest';
import type { DataSource, EntityManager, FindOperator } from 'typeorm';

import type { StorageClient } from '@patches/media';
import { PurgeAccountHandler } from './purge-account.handler.js';
import type { JobContext } from '../job-handler.js';

const actorId = '00000000-0000-4000-8000-000000000001';
const deviceId = 'device-row-1';

function inValues(value: unknown): unknown {
  return (value as FindOperator<string>).value;
}

function fakeStorage(): StorageClient {
  return { deleteObject: vi.fn(() => Promise.resolve(undefined)) } as unknown as StorageClient;
}

/** A repository whose every method is a no-op spy; individual tests override what they
 * observe. `delete` records its criteria so assertions can inspect purge reach. */
function genericRepo(
  entity: unknown,
  deleted: Array<{ entity: unknown; criteria: unknown }>,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    findOne: vi.fn(() => Promise.resolve(null)),
    findOneOrFail: vi.fn(() => Promise.resolve(null)),
    find: vi.fn(() => Promise.resolve([])),
    update: vi.fn(() => Promise.resolve(undefined)),
    save: vi.fn((input: unknown) => Promise.resolve(input)),
    create: vi.fn((input: unknown) => input),
    insert: vi.fn(() => Promise.resolve(undefined)),
    delete: vi.fn((criteria: unknown) => {
      deleted.push({ entity, criteria });
      return Promise.resolve({ affected: 1 });
    }),
    createQueryBuilder: vi.fn(() => {
      const qb = {
        delete: () => qb,
        where: () => qb,
        execute: () => Promise.resolve(undefined),
      };
      return qb;
    }),
    ...overrides,
  };
}

describe('PurgeAccountHandler E2EE scope (audit P1)', () => {
  it('deletes identity roots, devices/certs, rosters, prekeys, mail, sent messages, and signed events', async () => {
    const deleted: Array<{ entity: unknown; criteria: unknown }> = [];
    const manager = (entity: unknown): Record<string, unknown> => {
      if (entity === Actor) {
        return genericRepo(entity, deleted, {
          findOne: vi.fn(() =>
            Promise.resolve({ id: actorId, userId: null, deletedAt: new Date() }),
          ),
          delete: undefined,
        });
      }
      if (entity === E2eeDeviceIdentity) {
        return genericRepo(entity, deleted, {
          find: vi.fn(() => Promise.resolve([{ id: deviceId }])),
        });
      }
      return genericRepo(entity, deleted);
    };

    const dataSource = {
      // Outside the transaction the handler only reads media objects and export
      // archives (none in this fixture) plus the deletion request itself.
      getRepository: () => ({
        find: () => Promise.resolve([]),
        findOne: () => Promise.resolve({ cancelledAt: null, purgedAt: null }),
      }),
      transaction: async (body: (m: EntityManager) => Promise<void>) =>
        body({ getRepository: manager } as unknown as EntityManager),
    };

    await new PurgeAccountHandler(dataSource as unknown as DataSource, fakeStorage()).handle(
      { actorId },
      {} as JobContext,
    );

    const criteriaFor = (entity: unknown): unknown[] =>
      deleted.filter((entry) => entry.entity === entity).map((entry) => entry.criteria);

    const envelopeCriteria = criteriaFor(E2eeMailboxEnvelope)[0] as {
      recipientDeviceIdentityId: unknown;
    };
    expect(inValues(envelopeCriteria.recipientDeviceIdentityId)).toEqual([deviceId]);
    expect(
      inValues(
        (criteriaFor(E2eeOneTimePrekey)[0] as { deviceIdentityId: unknown }).deviceIdentityId,
      ),
    ).toEqual([deviceId]);
    expect(
      inValues(
        (criteriaFor(E2eeSignedPrekey)[0] as { deviceIdentityId: unknown }).deviceIdentityId,
      ),
    ).toEqual([deviceId]);
    expect(criteriaFor(E2eeDeviceIdentity)).toContainEqual({ actorId });
    expect(criteriaFor(E2eeDeviceRoster)).toContainEqual({ actorId });
    expect(criteriaFor(E2eeIdentityRoot)).toContainEqual({ actorId });
    expect(criteriaFor(E2eeLogicalMessage)).toContainEqual({ senderActorId: actorId });
    expect(criteriaFor(E2eeGroupControlEvent)).toContainEqual({ signerActorId: actorId });
  });

  it('never touches report evidence — ADR 0020 keeps it after the account is gone', async () => {
    const requestedEntities: unknown[] = [];
    const deleted: Array<{ entity: unknown; criteria: unknown }> = [];

    const manager = (entity: unknown): Record<string, unknown> => {
      requestedEntities.push(entity);
      if (entity === Actor) {
        return genericRepo(entity, deleted, {
          findOne: vi.fn(() =>
            Promise.resolve({ id: actorId, userId: null, deletedAt: new Date() }),
          ),
        });
      }
      return genericRepo(entity, deleted);
    };

    const dataSource = {
      getRepository: () => ({
        find: () => Promise.resolve([]),
        findOne: () => Promise.resolve({ cancelledAt: null, purgedAt: null }),
      }),
      transaction: async (body: (m: EntityManager) => Promise<void>) =>
        body({ getRepository: manager } as unknown as EntityManager),
    };

    await new PurgeAccountHandler(dataSource as unknown as DataSource, fakeStorage()).handle(
      { actorId },
      {} as JobContext,
    );

    expect(requestedEntities).not.toContain(E2eeReportEvidence);
    expect(requestedEntities).not.toContain(E2eeReportEvidenceItem);
  });

  it('records the audit log entry through the shared admin-audit helper', async () => {
    let savedAuditLog: unknown;
    const deleted: Array<{ entity: unknown; criteria: unknown }> = [];

    const manager = (entity: unknown): Record<string, unknown> => {
      if (entity === AdminAuditLog) {
        return genericRepo(entity, deleted, {
          findOne: vi.fn(() => Promise.resolve(null)),
          save: vi.fn((input: unknown) => {
            savedAuditLog = input;
            return Promise.resolve(input);
          }),
        });
      }
      if (entity === Actor) {
        return genericRepo(entity, deleted, {
          findOne: vi.fn(() =>
            Promise.resolve({ id: actorId, userId: null, deletedAt: new Date() }),
          ),
        });
      }
      return genericRepo(entity, deleted);
    };

    const dataSource = {
      getRepository: () => ({
        find: () => Promise.resolve([]),
        findOne: () => Promise.resolve({ cancelledAt: null, purgedAt: null }),
      }),
      transaction: async (body: (m: EntityManager) => Promise<void>) =>
        body({ getRepository: manager } as unknown as EntityManager),
    };

    await new PurgeAccountHandler(dataSource as unknown as DataSource, fakeStorage()).handle(
      { actorId },
      {} as JobContext,
    );

    expect(savedAuditLog).toMatchObject({ action: 'user.purge' });
  });
});
