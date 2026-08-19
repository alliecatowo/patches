import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Labeler } from '@patches/database';
import { DataSource } from 'typeorm';

import { AppConfigService } from '../../config/app-config.service.js';
import type { LabelerVocabularyEntryView } from './label.dto.js';

/** Arbitrary fixed key for `pg_advisory_xact_lock` — serializes concurrent boots (multiple
 * server processes starting at once, e.g. a rolling deploy) racing to seed the same "the
 * node's own labeler" row, since `labelers` has no unique constraint enforcing "at most one
 * `is_node_labeler = true` row" beyond the service layer (`labeler.entity.ts`'s doc). Any
 * stable int works; this one has no other meaning. */
const NODE_LABELER_SEED_LOCK_KEY = 890_014_009;

/**
 * Boot-time seed for the node's own labeler (spec §200.3: "The node's own labeler is
 * subscribed by default and is always listed by name"). Idempotent across restarts: creates
 * the row once, and on every subsequent boot re-syncs its `vocabulary` to the current
 * `LABEL_VOCABULARY` env value so an operator can change the published vocabulary by
 * redeploying — there is no `UpdateLabeler` RPC (spec §203's `LabelService` surface has none).
 *
 * Runs from Nest's `OnModuleInit` lifecycle hook, which only fires once `app.listen()` (or
 * `app.init()`) has been called — `main.ts` always calls `app.listen()` (ADR 0016 §4), so this
 * runs on every real boot, but `test/support/test-server.ts#startTestServer()` only calls it
 * when invoked as `startTestServer({ http: true })`; a test asserting on this seed must opt in
 * to that option or the seed silently never runs (found the hard way — see
 * `docs/agents/LEARNINGS.md`).
 */
@Injectable()
export class LabelSeedService implements OnModuleInit {
  private readonly logger = new Logger(LabelSeedService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: AppConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const vocabulary = this.buildVocabulary();
    await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [NODE_LABELER_SEED_LOCK_KEY]);

      const labelers = manager.getRepository(Labeler);
      const existing = await labelers.findOne({ where: { isNodeLabeler: true } });
      if (existing === null) {
        await labelers.save(
          labelers.create({ actorId: null, communityId: null, isNodeLabeler: true, vocabulary }),
        );
        this.logger.log('Seeded the node’s own labeler.');
        return;
      }
      if (JSON.stringify(existing.vocabulary) !== JSON.stringify(vocabulary)) {
        existing.vocabulary = vocabulary;
        await labelers.save(existing);
        this.logger.log('Synced the node’s own labeler vocabulary to LABEL_VOCABULARY.');
      }
    });
  }

  /** `LABEL_VOCABULARY` values only carry a name (spec §200.2's comma-list convention, same
   * as `LIKE_GLYPH_ALLOW_LIST`) — every entry gets an empty description and `WARN` as a
   * conservative starting default action (never `HIDE`: the node's own labeler should not
   * silently remove content from a subscriber's view by default). None are `mandatory` — this
   * node has not designated any value legally mandatory (spec §200.3); an operator wanting
   * that has no RPC to set it and would need a follow-up admin-CLI/migration mechanism. */
  private buildVocabulary(): LabelerVocabularyEntryView[] {
    return this.config.labelVocabulary.map((value) => ({
      value,
      description: '',
      defaultAction: 'WARN',
      mandatory: false,
    }));
  }
}
