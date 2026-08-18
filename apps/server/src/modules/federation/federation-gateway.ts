import type { EntityManager } from 'typeorm';

/**
 * The federation architectural seam (`INITIAL_VISION.md` §105, `docs/architecture/
 * federation.md` §1) — domain services (`PostService`, `GraphService`, `ReactionsService`)
 * call this interface and never touch ActivityPub structures directly.
 *
 * Extended past the spec's original three-method sketch (`publishActor`/`publishPost`/
 * `publishDelete`) to cover Follow/Like — Stage F1 (`docs/architecture/federation.md` §4)
 * needs those delivered too, and the same "domain code stays AS2-agnostic" reasoning applies
 * to them. Every method takes the caller's transactional `EntityManager` so a federation
 * delivery is enqueued (via `DeliveryService`, into the same durable `outbox_jobs` table)
 * atomically with the local write that caused it — never a best-effort side call after
 * commit, which would leave "post created, no delivery job" a possible outcome.
 */
export interface FederationGateway {
  /** A local public post was created — deliver `Create(Note)` to the author's remote
   * followers. No-op for a non-public post or an author with no remote followers. */
  publishPost(manager: EntityManager, postId: string): Promise<void>;

  /** A local post was tombstoned — deliver `Delete` to the author's remote followers. */
  publishDelete(manager: EntityManager, postId: string): Promise<void>;

  /** A local actor followed a remote one — deliver `Follow`. */
  followRemoteActor(
    manager: EntityManager,
    followerActorId: string,
    targetActorId: string,
  ): Promise<void>;

  /** A local actor unfollowed (or withdrew a pending follow of) a remote one — deliver
   * `Undo(Follow)`. */
  unfollowRemoteActor(
    manager: EntityManager,
    followerActorId: string,
    targetActorId: string,
  ): Promise<void>;

  /** A local actor liked a remote actor's post — deliver `Like`. No-op if the post is local. */
  likeRemotePost(manager: EntityManager, actorId: string, postId: string): Promise<void>;

  /** A local actor unliked a remote actor's post — deliver `Undo(Like)`. */
  unlikeRemotePost(manager: EntityManager, actorId: string, postId: string): Promise<void>;
}

export const FEDERATION_GATEWAY = Symbol('FEDERATION_GATEWAY');

/** Stage F0 default (`docs/architecture/federation.md` §4) and what every node runs when
 * `FEDERATION_ENABLED=false` (the default, spec §176). */
export class NoopFederationGateway implements FederationGateway {
  async publishPost(): Promise<void> {
    // intentionally empty — see class doc comment
  }
  async publishDelete(): Promise<void> {
    // intentionally empty
  }
  async followRemoteActor(): Promise<void> {
    // intentionally empty
  }
  async unfollowRemoteActor(): Promise<void> {
    // intentionally empty
  }
  async likeRemotePost(): Promise<void> {
    // intentionally empty
  }
  async unlikeRemotePost(): Promise<void> {
    // intentionally empty
  }
}
