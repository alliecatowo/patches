import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Inbox activity dedupe (P8-006, `INITIAL_VISION.md` §109's "deduplicate activities").
 * ActivityPub activities are re-delivered (retries, shared-inbox fan-out landing twice), and
 * an `id` is the only thing every activity is guaranteed to carry — so it is the primary key
 * here, not a surrogate one. `FederationInboxService` inserts a row (or rejects on conflict)
 * *before* doing any side-effecting work for an incoming activity.
 */
@Entity({ name: 'inbox_activities' })
@Index(['receivedAt'])
export class InboxActivity {
  /** The activity's own `id` URI (spec §110: canonical URIs, not surrogate ids, are the
   * federation identity). Capped by the ingestion size limits before this is ever written. */
  @PrimaryColumn({ type: 'text' })
  declare id: string;

  /** AS2 `type` (`Follow`, `Create`, ...) — operator visibility only. */
  @Column({ type: 'text' })
  declare activityType: string;

  /** The remote actor URI that sent this activity (AS2 `actor`). */
  @Column({ type: 'text' })
  declare actorUri: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  declare receivedAt: Date;
}
