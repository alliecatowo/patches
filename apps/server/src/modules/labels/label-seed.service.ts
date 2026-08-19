import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Labeler } from '@patches/database';
import { DataSource } from 'typeorm';

import { AppConfigService } from '../../config/app-config.service.js';
import type { LabelerVocabularyEntryView } from './label.dto.js';
import { parseStoredVocabulary } from './label-validation.js';

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
    await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [NODE_LABELER_SEED_LOCK_KEY]);

      const labelers = manager.getRepository(Labeler);
      const existing = await labelers.findOne({ where: { isNodeLabeler: true } });
      const vocabulary = this.buildVocabulary(existing?.vocabulary);
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

  /** `LABEL_VOCABULARY` names which values exist and their order — a value's `description`/
   * `default_action`/`mandatory` (P14-026, spec §200.3) are preserved from the row's prior
   * state when the value already existed, so `patches-admin labeler vocabulary set-mandatory`
   * (the only writer of those three fields — there is no RPC) survives the next boot's resync
   * instead of being silently reset to the fresh-entry defaults below on every restart. A
   * value newly added to `LABEL_VOCABULARY` gets an empty description and `WARN` as a
   * conservative starting default action (never `HIDE`: the node's own labeler should not
   * silently remove content from a subscriber's view by default) and `mandatory: false` — an
   * operator designating it mandatory does so afterward, via the admin CLI. A value removed
   * from `LABEL_VOCABULARY` is dropped, prior state and all — there is no RPC referencing a
   * value that no longer exists, so nothing else on the schema keys off dropped vocabulary
   * rows. */
  private buildVocabulary(existingRaw: unknown): LabelerVocabularyEntryView[] {
    const priorByValue = new Map<string, LabelerVocabularyEntryView>();
    if (existingRaw !== undefined) {
      // Malformed prior state (should be unreachable — `existingRaw` is only ever written by
      // this same method or the admin CLI's identically-shaped write) must not block boot;
      // falling back to fresh defaults for every value is the same "empty vocabulary is
      // honest, never invented" reasoning the rest of this module already applies.
      try {
        for (const entry of parseStoredVocabulary(existingRaw))
          priorByValue.set(entry.value, entry);
      } catch {
        // swallow: see comment above — an unreadable prior row degrades to fresh defaults.
      }
    }
    return this.config.labelVocabulary.map((value) => {
      const prior = priorByValue.get(value);
      return {
        value,
        description: prior?.description ?? '',
        defaultAction: prior?.defaultAction ?? 'WARN',
        mandatory: prior?.mandatory ?? false,
      };
    });
  }
}
