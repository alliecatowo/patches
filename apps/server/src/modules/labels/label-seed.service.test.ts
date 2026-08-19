import { Labeler } from '@patches/database';
import type { DataSource, EntityManager } from 'typeorm';
import { describe, expect, it } from 'vitest';

import type { AppConfigService } from '../../config/app-config.service.js';
import { LabelSeedService } from './label-seed.service.js';
import type { LabelerVocabularyEntryView } from './label.dto.js';

/** A minimal `AppConfigService` stub — only `labelVocabulary` is read by this service. */
function fakeConfig(labelVocabulary: readonly string[]): AppConfigService {
  return { labelVocabulary } as unknown as AppConfigService;
}

/** A fake `DataSource` whose `.transaction()` runs the callback against a fake `EntityManager`
 * backed by a single in-memory `Labeler` row (or none) — no real Postgres needed, since the
 * behavior under test (`buildVocabulary`'s merge logic) has nothing to do with SQL. */
function fakeDataSource(existing: Labeler | null): {
  dataSource: DataSource;
  saved: Labeler[];
} {
  const saved: Labeler[] = [];
  let current = existing;
  const manager = {
    query: () => Promise.resolve(),
    getRepository: (entity: unknown) => {
      if (entity !== Labeler) throw new Error(`unexpected entity: ${String(entity)}`);
      return {
        findOne: () => Promise.resolve(current),
        create: (input: Partial<Labeler>) => ({ ...input }) as Labeler,
        save: (row: Labeler) => {
          current = row;
          saved.push(row);
          return Promise.resolve(row);
        },
      };
    },
  } as unknown as EntityManager;

  const dataSource = {
    transaction: (callback: (manager: EntityManager) => Promise<void>) => callback(manager),
  } as unknown as DataSource;

  return { dataSource, saved };
}

function labelerRow(vocabulary: readonly LabelerVocabularyEntryView[]): Labeler {
  return {
    id: 'node-labeler-id',
    actorId: null,
    actor: null,
    communityId: null,
    community: null,
    isNodeLabeler: true,
    vocabulary,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('LabelSeedService.onModuleInit (P14-026, spec §200.3)', () => {
  it('seeds a fresh row with WARN/not-mandatory defaults when none exists', async () => {
    const { dataSource, saved } = fakeDataSource(null);
    const service = new LabelSeedService(dataSource, fakeConfig(['spam', 'nsfw']));

    await service.onModuleInit();

    expect(saved).toHaveLength(1);
    expect(saved[0]?.vocabulary).toEqual([
      { value: 'spam', description: '', defaultAction: 'WARN', mandatory: false },
      { value: 'nsfw', description: '', defaultAction: 'WARN', mandatory: false },
    ]);
  });

  it('preserves a value’s mandatory flag (set via the admin CLI) across an unchanged resync', async () => {
    const existing = labelerRow([
      { value: 'spam', description: '', defaultAction: 'WARN', mandatory: false },
      { value: 'nsfw', description: 'Adult content', defaultAction: 'HIDE', mandatory: true },
    ]);
    const { dataSource, saved } = fakeDataSource(existing);
    const service = new LabelSeedService(dataSource, fakeConfig(['spam', 'nsfw']));

    await service.onModuleInit();

    // No net change ⇒ no save call, same as the pre-P14-026 idempotent-boot behavior.
    expect(saved).toHaveLength(0);
    expect(existing.vocabulary).toEqual([
      { value: 'spam', description: '', defaultAction: 'WARN', mandatory: false },
      { value: 'nsfw', description: 'Adult content', defaultAction: 'HIDE', mandatory: true },
    ]);
  });

  it('adds a newly configured value with defaults while preserving an existing mandatory flag', async () => {
    const existing = labelerRow([
      { value: 'nsfw', description: '', defaultAction: 'HIDE', mandatory: true },
    ]);
    const { dataSource, saved } = fakeDataSource(existing);
    const service = new LabelSeedService(dataSource, fakeConfig(['nsfw', 'spam']));

    await service.onModuleInit();

    expect(saved).toHaveLength(1);
    expect(saved[0]?.vocabulary).toEqual([
      { value: 'nsfw', description: '', defaultAction: 'HIDE', mandatory: true },
      { value: 'spam', description: '', defaultAction: 'WARN', mandatory: false },
    ]);
  });

  it('drops a value no longer in LABEL_VOCABULARY, prior state and all', async () => {
    const existing = labelerRow([
      { value: 'spam', description: '', defaultAction: 'WARN', mandatory: false },
      { value: 'nsfw', description: '', defaultAction: 'HIDE', mandatory: true },
    ]);
    const { dataSource, saved } = fakeDataSource(existing);
    const service = new LabelSeedService(dataSource, fakeConfig(['spam']));

    await service.onModuleInit();

    expect(saved).toHaveLength(1);
    expect(saved[0]?.vocabulary).toEqual([
      { value: 'spam', description: '', defaultAction: 'WARN', mandatory: false },
    ]);
  });

  it('degrades to fresh defaults, without throwing, when the stored vocabulary is malformed', async () => {
    const existing = labelerRow(
      // Deliberately shaped wrong (missing `mandatory`) to exercise the defensive parse.
      [{ value: 'spam' }] as unknown as LabelerVocabularyEntryView[],
    );
    const { dataSource, saved } = fakeDataSource(existing);
    const service = new LabelSeedService(dataSource, fakeConfig(['spam']));

    await expect(service.onModuleInit()).resolves.toBeUndefined();

    expect(saved).toHaveLength(1);
    expect(saved[0]?.vocabulary).toEqual([
      { value: 'spam', description: '', defaultAction: 'WARN', mandatory: false },
    ]);
  });
});
