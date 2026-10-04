import { randomBytes, randomUUID } from 'node:crypto';

import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Actor, User } from '@patches/database';
import { type DataSource, type EntityManager } from 'typeorm';

import { getRequestContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { enforceWindowPeerRateLimit } from '../../common/rate-limit/window-rate-limiter.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { toActorSummary, type SessionEnvelope } from '../auth/auth.dto.js';
import { createActorAndUser } from '../auth/auth.service.js';
import { DbRateLimitStore } from '../auth/db-rate-limit-store.service.js';
import { TokenService } from '../auth/token.service.js';
import { GraphService } from '../graph/graph.service.js';
import { PostService } from '../posts/post.service.js';
import { ReactionsService } from '../reactions/reaction.service.js';
import {
  DEMO_FOLLOWS,
  DEMO_FRIENDS,
  DEMO_POSTS,
  type DemoAuthor,
  type DemoPersona,
} from './demo-seed.js';
import { peerBucket } from './peer-bucket.js';

const HOUR_MS = 60 * 60_000;
const MINUTE_MS = 60_000;

/** Sandboxes deleted per sweep pass, so one pass after a long sleep stays short. */
const PURGE_BATCH = 25;

export interface DemoSandbox {
  readonly sandboxId: string;
  readonly expiresAt: Date;
  readonly visitor: SessionEnvelope;
  readonly friends: readonly SessionEnvelope[];
}

interface SandboxAccount {
  readonly key: DemoAuthor;
  readonly actorId: string;
  readonly handle: string;
  readonly session: SessionEnvelope;
}

/**
 * Per-visitor demo sandbox (ADR 0044). Only ever active on the dedicated demo node
 * (`DEMO_MODE=true`): that node's database holds nothing but sandboxes, so a sandbox account
 * is invisible to — and cannot reach — a real account because no real account exists in the
 * same database, not because some query remembers to filter it out.
 *
 * Lifecycle:
 *  - `start` rate-limits per peer, caps live sandboxes, creates one visitor plus three fake
 *    friends in one transaction (each carrying `sandbox_id` and the same `sandbox_expires_at`),
 *    then seeds follows, posts, replies and likes through the ordinary services.
 *  - The expiry is enforced on every token use (`assertSandboxNotExpired`), so it holds even
 *    while the scale-to-zero node is asleep and no sweep can run.
 *  - `purgeExpired` hard-deletes expired sandboxes; it runs at boot, inside every `start`, and
 *    on an unref'd interval while the node is awake. Every delete is scoped by
 *    `sandbox_expires_at IS NOT NULL`, so a real account can never be selected.
 *
 * E2EE: the node never holds a private key. Direct messages are seeded by the visitor's own
 * browser with the real client runtime, using the friend sessions returned here.
 */
@Injectable()
export class DemoSandboxService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DemoSandboxService.name);
  private sweepTimer: NodeJS.Timeout | undefined;
  private sweeping = false;

  constructor(
    private readonly config: AppConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tokens: TokenService,
    private readonly rateLimitStore: DbRateLimitStore,
    private readonly posts: PostService,
    private readonly graph: GraphService,
    private readonly reactions: ReactionsService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.demoMode) return;
    const run = (): void => {
      void this.sweep();
    };
    run();
    this.sweepTimer = setInterval(run, this.config.demoSweepIntervalSeconds * 1000);
    // Never keep a node awake just to sweep: the sandbox expiry is enforced on every request,
    // so a sleeping node loses nothing, and the next boot sweeps first thing.
    this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer !== undefined) clearInterval(this.sweepTimer);
  }

  async start(now: Date = new Date()): Promise<DemoSandbox> {
    if (!this.config.demoMode) {
      throw new AppError('DEMO_DISABLED', 'The demo is not available on this node.');
    }

    await enforceWindowPeerRateLimit(
      this.rateLimitStore,
      'demo_start',
      peerBucket(getRequestContext()?.peer),
      this.config.demoStartsPerPeerPerHour,
      HOUR_MS,
      now,
    );

    await this.sweep(now);

    if ((await this.liveSandboxCount(now)) >= this.config.demoMaxLiveSandboxes) {
      throw new AppError(
        'SERVICE_UNAVAILABLE',
        'The demo is busy right now. Try again in a few minutes.',
      );
    }

    const sandboxId = randomUUID();
    const expiresAt = new Date(now.getTime() + this.config.demoTtlMinutes * MINUTE_MS);
    const accounts = await this.dataSource.transaction((manager) =>
      this.createAccounts(manager, sandboxId, expiresAt),
    );

    try {
      await this.seed(accounts, now);
    } catch (error) {
      // A half-seeded sandbox is worse than none: remove it and let the visitor retry.
      await this.purgeSandbox(sandboxId).catch((purgeError: unknown) => {
        this.logger.error(`failed to roll back sandbox ${sandboxId}: ${String(purgeError)}`);
      });
      throw error;
    }

    const visitor = accounts.find((account) => account.key === 'you');
    if (visitor === undefined) throw AppError.internal();
    return {
      sandboxId,
      expiresAt,
      visitor: visitor.session,
      friends: accounts.filter((account) => account.key !== 'you').map((a) => a.session),
    };
  }

  // ---------------------------------------------------------------- creation

  private async createAccounts(
    manager: EntityManager,
    sandboxId: string,
    expiresAt: Date,
  ): Promise<SandboxAccount[]> {
    const suffix = randomBytes(3).toString('hex');
    const people: ReadonlyArray<{
      key: DemoAuthor;
      handle: string;
      displayName: string;
      bio: string;
      locationText: string | null;
    }> = [
      {
        key: 'you',
        handle: `you_${suffix}`,
        displayName: 'You (demo)',
        bio: 'A throwaway account in the Patches demo sandbox. It is deleted when the demo ends.',
        locationText: null,
      },
      ...DEMO_FRIENDS.map((friend: DemoPersona) => ({
        key: friend.key,
        handle: `${friend.handleBase}_${suffix}`,
        displayName: friend.displayName,
        bio: friend.bio,
        locationText: friend.locationText,
      })),
    ];

    const accounts: SandboxAccount[] = [];
    for (const person of people) {
      const actor = await createActorAndUser(manager, {
        handle: person.handle,
        handleNormalized: person.handle,
        displayName: person.displayName,
        email: null,
        emailNormalized: null,
        clientRequestId: null,
        privacyNoticeVersionAcknowledged: this.config.privacyNoticeVersion,
      });
      const userId = actor.userId;
      if (userId === null) throw AppError.internal();

      await manager
        .getRepository(Actor)
        .update({ id: actor.id }, { bio: person.bio, locationText: person.locationText });
      await manager.getRepository(User).update(
        { id: userId },
        {
          sandboxId,
          sandboxExpiresAt: expiresAt,
          // No mailbox exists behind a sandbox account; "unverified" would only gate features.
          emailVerifiedAt: new Date(),
        },
      );

      const tokens = await this.tokens.issueSession(manager, { userId, actorId: actor.id });
      const fresh = await manager.getRepository(Actor).findOneByOrFail({ id: actor.id });
      accounts.push({
        key: person.key,
        actorId: actor.id,
        handle: person.handle,
        session: {
          tokens,
          actor: toActorSummary(fresh),
          emailVerified: true,
          node: this.config.nodeDomain,
        },
      });
    }
    return accounts;
  }

  // ---------------------------------------------------------------- seeding

  private async seed(accounts: readonly SandboxAccount[], now: Date): Promise<void> {
    const byKey = new Map(accounts.map((account) => [account.key, account]));
    const actorOf = (key: DemoAuthor): SandboxAccount => {
      const account = byKey.get(key);
      if (account === undefined) throw AppError.internal();
      return account;
    };
    const you = actorOf('you');

    for (const [follower, followee] of DEMO_FOLLOWS) {
      await this.graph.followActor(actorOf(follower).actorId, actorOf(followee).actorId);
    }

    const postIds = new Map<string, string>();
    for (const post of DEMO_POSTS) {
      const author = actorOf(post.author);
      const created = await this.posts.createPost({
        authorActorId: author.actorId,
        clientRequestId: randomUUID(),
        body: post.body.replaceAll('{you}', you.handle),
        visibility: 'PUBLIC',
        mediaIds: [],
        quotePolicy: 'ANYONE',
        ...(post.replyTo === undefined ? {} : { inReplyToId: requireKey(postIds, post.replyTo) }),
      });
      postIds.set(post.key, created.id);
      // Back-date so the sandbox looks lived in. Replies stay later than their parents because
      // `DEMO_POSTS` is ordered and `minutesAgo` strictly decreases along every reply chain.
      await this.dataSource.query('UPDATE posts SET created_at = $2 WHERE id = $1', [
        created.id,
        new Date(now.getTime() - post.minutesAgo * MINUTE_MS),
      ]);
    }

    for (const post of DEMO_POSTS) {
      const postId = requireKey(postIds, post.key);
      for (const liker of post.likedBy ?? []) {
        if (liker === post.author) continue;
        await this.reactions.likePost(actorOf(liker).actorId, postId);
      }
    }
  }

  // ---------------------------------------------------------------- expiry

  async liveSandboxCount(now: Date = new Date()): Promise<number> {
    const rows = await this.dataSource.query<Array<{ live: string }>>(
      `SELECT COUNT(DISTINCT sandbox_id) AS live FROM users
       WHERE sandbox_expires_at IS NOT NULL AND sandbox_expires_at > $1`,
      [now],
    );
    return Number(rows[0]?.live ?? 0);
  }

  /** One non-overlapping sweep pass; never throws (a failed sweep must not fail a request). */
  async sweep(now: Date = new Date()): Promise<number> {
    if (this.sweeping) return 0;
    this.sweeping = true;
    try {
      return await this.purgeExpired(now);
    } catch (error) {
      this.logger.error(`demo sandbox sweep failed: ${String(error)}`);
      return 0;
    } finally {
      this.sweeping = false;
    }
  }

  /** Hard-deletes every sandbox whose expiry has passed. Returns how many it removed. */
  async purgeExpired(now: Date = new Date()): Promise<number> {
    const expired = await this.dataSource.query<Array<{ sandbox_id: string }>>(
      `SELECT DISTINCT sandbox_id FROM users
       WHERE sandbox_expires_at IS NOT NULL AND sandbox_id IS NOT NULL AND sandbox_expires_at <= $1
       LIMIT $2`,
      [now, PURGE_BATCH],
    );
    let purged = 0;
    for (const row of expired) {
      try {
        await this.purgeSandbox(row.sandbox_id);
        purged += 1;
      } catch (error) {
        // Leave it for the next pass; it is already dead to its holder (token expiry).
        this.logger.error(`failed to purge sandbox ${row.sandbox_id}: ${String(error)}`);
      }
    }
    if (purged > 0) this.logger.log(`purged ${String(purged)} expired demo sandbox(es)`);
    return purged;
  }

  /**
   * Deletes one sandbox and everything it owns. Scope is the `sandbox_id` of rows that are
   * *also* marked with an expiry, so a real account (both columns NULL) cannot be matched even
   * by a wrong id. Order matters: tables whose actor FK is `RESTRICT` go first, then the user
   * rows (`users.actor_id` is `RESTRICT`), then the actors, whose remaining dependents
   * cascade.
   */
  async purgeSandbox(sandboxId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const members = await manager.query<Array<{ user_id: string; actor_id: string }>>(
        `SELECT id AS user_id, actor_id FROM users
         WHERE sandbox_id = $1 AND sandbox_expires_at IS NOT NULL`,
        [sandboxId],
      );
      if (members.length === 0) return;
      const userIds = members.map((member) => member.user_id);
      const actorIds = members.map((member) => member.actor_id);

      // Conversations the sandbox's actors belong to (E2EE direct messages): the conversation
      // row cascades its members, logical messages and mailbox envelopes.
      await manager.query(
        `DELETE FROM conversations WHERE id IN (
           SELECT conversation_id FROM conversation_members WHERE actor_id = ANY($1::uuid[])
         )`,
        [actorIds],
      );
      // `RESTRICT` / `NO ACTION` owners.
      await manager.query(`DELETE FROM posts WHERE author_actor_id = ANY($1::uuid[])`, [actorIds]);
      await manager.query(`DELETE FROM communities WHERE created_by_actor_id = ANY($1::uuid[])`, [
        actorIds,
      ]);
      await manager.query(`DELETE FROM media WHERE owner_actor_id = ANY($1::uuid[])`, [actorIds]);
      await manager.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
      await manager.query(`DELETE FROM actors WHERE id = ANY($1::uuid[])`, [actorIds]);
    });
  }
}

function requireKey(map: ReadonlyMap<string, string>, key: string): string {
  const value = map.get(key);
  if (value === undefined) throw AppError.internal();
  return value;
}
