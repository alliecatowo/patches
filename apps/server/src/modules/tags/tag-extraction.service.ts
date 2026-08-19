import { Injectable, Logger } from '@nestjs/common';
import { PostTag, Tag } from '@patches/database';
import type { EntityManager } from 'typeorm';

import { extractTagCandidates, parseTags } from './tag-grammar.js';

export { parseTags };

/**
 * Write-time tag extraction (`INITIAL_VISION.md` §181, §148 — "do not make tag extraction a
 * critical v0 system"). `extractAndAttach` is called by `PostService.createPost`/`editPost`
 * (P11-006) in the post write transaction. Author-facing validation (notably the eleventh-tag
 * error) is allowed to throw; persistence/system failures inside attachment are caught and
 * logged so a broken extraction subsystem cannot fail an otherwise-valid post.
 */
@Injectable()
export class TagExtractionService {
  private readonly logger = new Logger(TagExtractionService.name);

  /**
   * Idempotent: safe to call more than once for the same `postId` (e.g. a retried `EditPost`)
   * — existing `post_tags` rows for the post are replaced with exactly what `body` parses to
   * now. `manager` must already be inside the same transaction as the post write it follows
   * (or at least a transaction of its own), matching the exact signature P11-006's task line
   * specifies.
   *
   * Returns the canonical tag names attached, or `[]` on a persistence/extraction-system
   * failure (§181, §148). Input validation errors still surface to the author.
   */
  async extractAndAttach(manager: EntityManager, postId: string, body: string): Promise<string[]> {
    // This author-facing validation is deliberately outside the non-critical persistence
    // catch: an eleventh tag is INVALID_ARGUMENT, never a swallowed extraction-system error
    // (§181). `PostService` may also call `parseTags` before writing, but this public hook
    // enforces the contract for every caller on its own.
    parseTags(body);
    try {
      const candidates = extractTagCandidates(body);
      return await manager.transaction(async (tagManager) => {
        // A nested transaction becomes a savepoint when `manager` is already transactional.
        // That means an extraction error preserves the old complete attachment set instead
        // of leaving a half-deleted/half-inserted set behind when the error is swallowed.
        await tagManager.getRepository(PostTag).delete({ postId });

        const names: string[] = [];
        for (const candidate of candidates) {
          const tag = await this.findOrCreateTag(tagManager, candidate.name, candidate.displayName);
          await this.attachTag(tagManager, postId, tag.id);
          names.push(tag.name);
        }
        return names;
      });
    } catch (error) {
      this.logger.warn(
        `Tag extraction failed for post ${postId}; the post itself is unaffected.`,
        error instanceof Error ? error.stack : undefined,
      );
      return [];
    }
  }

  private async attachTag(manager: EntityManager, postId: string, tagId: string): Promise<void> {
    const postTags = manager.getRepository(PostTag);
    try {
      await postTags.save(postTags.create({ postId, tagId }));
    } catch (error) {
      // The `(post_id, tag_id)` composite PK only collides if this exact pair already exists
      // — harmless under the delete-then-reinsert flow above (same reasoning as
      // `GraphService.followActor`'s unique-violation swallow).
      if (!isUniqueViolation(error)) throw error;
    }
  }

  private async findOrCreateTag(
    manager: EntityManager,
    name: string,
    displayName: string,
  ): Promise<Tag> {
    const tags = manager.getRepository(Tag);
    const existing = await tags.findOne({ where: { name } });
    if (existing !== null) return existing;

    try {
      return await tags.save(tags.create({ name, displayName }));
    } catch (error) {
      // Two posts introducing the same brand-new tag concurrently race the unique `name`
      // index — the loser just re-reads what the winner created.
      if (!isUniqueViolation(error)) throw error;
      const winner = await tags.findOne({ where: { name } });
      if (winner === null) throw error;
      return winner;
    }
  }
}

/** PostgreSQL's `unique_violation` SQLSTATE, surfaced by `pg` as a plain `{ code: string }` —
 * same helper `GraphService.followActor` uses for its own idempotency race. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}
