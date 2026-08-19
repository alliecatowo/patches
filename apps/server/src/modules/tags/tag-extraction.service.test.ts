import type { EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';

import { TagExtractionService } from './tag-extraction.service.js';

describe('TagExtractionService', () => {
  it('replaces relations atomically and returns canonical names', async () => {
    const deleteRelations = vi.fn().mockResolvedValue(undefined);
    const saveRelation = vi.fn().mockResolvedValue(undefined);
    const findTag = vi.fn().mockResolvedValue(null);
    const saveTag = vi.fn((tag: { name: string; displayName: string }) =>
      Promise.resolve({ ...tag, id: `id-${tag.name}` }),
    );
    const tagRepository = {
      findOne: findTag,
      create: (value: unknown) => value,
      save: saveTag,
    };
    const postTagRepository = {
      delete: deleteRelations,
      create: (value: unknown) => value,
      save: saveRelation,
    };
    const nestedManager = {
      getRepository: vi.fn((entity: { name: string }) =>
        entity.name === 'Tag' ? tagRepository : postTagRepository,
      ),
    };
    const manager = {
      transaction: vi.fn(async (run: (nested: EntityManager) => Promise<string[]>) =>
        run(nestedManager as unknown as EntityManager),
      ),
    } as unknown as EntityManager;

    await expect(
      new TagExtractionService().extractAndAttach(manager, 'post-id', '#TypeScript #café'),
    ).resolves.toEqual(['typescript', 'café']);
    expect(deleteRelations).toHaveBeenCalledWith({ postId: 'post-id' });
    expect(saveRelation).toHaveBeenCalledTimes(2);
  });

  it('swallows extraction persistence failures', async () => {
    const manager = {
      transaction: vi.fn().mockRejectedValue(new Error('database unavailable')),
    } as unknown as EntityManager;
    await expect(
      new TagExtractionService().extractAndAttach(manager, 'post-id', '#safe'),
    ).resolves.toEqual([]);
  });

  it('surfaces an eleventh tag as INVALID_ARGUMENT without touching persistence', async () => {
    const transaction = vi.fn();
    const manager = { transaction } as unknown as EntityManager;
    const body = Array.from({ length: 11 }, (_, index) => `#tag${String(index)}`).join(' ');
    await expect(
      new TagExtractionService().extractAndAttach(manager, 'post-id', body),
    ).rejects.toThrow('at most 10 tags');
    expect(transaction).not.toHaveBeenCalled();
  });
});
