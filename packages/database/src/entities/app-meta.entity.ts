import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Schema-level key/value metadata (e.g. a generated `instance_id`).
 *
 * Deliberately the only entity wired up in Phase 0 — proves the DataSource / migration /
 * snake_case-naming-strategy plumbing end to end before Phase 1 adds the real entities
 * (`users`, `actors`, ...; see `docs/architecture/data-model.md`).
 *
 * Every `@Column` below specifies an explicit `type`. This package builds with tsup
 * (esbuild), which does not emit `emitDecoratorMetadata` — so TypeORM can't infer a
 * column's SQL type by reflecting the TS property type at runtime the way it can under a
 * `tsc`-emitted build. See the package README for the full explanation; a test in
 * `src/entities/entity-column-types.test.ts` guards this invariant for every entity in
 * `ALL_ENTITIES`.
 */
@Entity({ name: 'app_meta' })
export class AppMeta {
  @PrimaryColumn({ type: 'text' })
  declare key: string;

  @Column({ type: 'jsonb' })
  declare value: unknown;

  // `@UpdateDateColumn`, not a plain column: TypeORM stamps it on every save, so the value
  // can't silently go stale when a caller forgets to set it by hand.
  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  declare updatedAt: Date;
}
