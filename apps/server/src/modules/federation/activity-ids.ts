import { createHash } from 'node:crypto';

/**
 * Deterministic outbound activity ids (ADR 0028 §4, `docs/decisions/
 * 0028-federating-social-depth.md`): any activity this node may later have to **undo** gets
 * an id reconstructed from the stable row that caused it — never `randomUUID()` per
 * emission — so a peer that saw the original can match the later `Undo` against exactly the
 * activity id it already recorded. One-shot activities with no undo path (`Create`/
 * `Delete`, and the outer `Undo` wrapper documents themselves) stay randomly minted at
 * their call sites; only the *undone inner* id must be stable.
 *
 * URI shape mirrors `activitystreams/uris.ts`'s other computed locals: derived purely from
 * `AppConfigService.publicOrigin` (passed in, no config reads here), persisted nowhere.
 */

/** A local repost's outbound `Announce` activity id — reconstructed from the repost pointer
 * row's surrogate id (`reposts.id`). Because an unrepost deletes that row and a re-repost
 * inserts a fresh one, unrepost/re-repost is a *new* activity id by design (ADR 0028
 * §4's consequences), while delivery retries of the same repost reconstruct byte-identical
 * ids every time. */
export function localRepostAnnounceUri(origin: string, repostId: string): string {
  return `${origin}/activities/announce/${repostId}`;
}

/**
 * A local `Follow`/`Like` outbound activity id (B-079) — reconstructed from `(kind, actorUri,
 * objectUri)` rather than from a database row's surrogate id, because neither edge has one
 * that survives to undo time: `follows` rows are hard-deleted on unfollow (`Follow`'s own doc
 * comment — "`NONE` is represented by the *absence* of a row") and `likes` has no surrogate id
 * at all, only the `(actor, post)` composite PK. A content hash of the edge's own identity is
 * the only value stable across both mint and undo.
 *
 * **This is a wire contract, not an implementation detail.** `unfollowRemoteActor`/
 * `unlikeRemotePost` (`activitypub-federation-gateway.service.ts`) call this with the exact
 * same inputs the original `Follow`/`Like` used, to name the *same* id inside `Undo`'s object
 * so a peer that recorded the original activity can match the undo against it. Changing the
 * hash algorithm, the input order, or the separator below changes every future id this node
 * mints — it does **not** retroactively change ids a peer already has on file, so any such
 * change permanently breaks Undo matching for edges that predate it. Treat this function's
 * body as append-only: if it ever needs to change, mint under a new URI path segment (bump
 * `kind` to e.g. `'follow-v2'`) rather than editing the hash of the existing one.
 *
 * `actorUri`/`objectUri` MUST be immutable identifiers, not anything that can change over an
 * actor's lifetime: a local actor's `localActorUri` is safe because handles are assigned once
 * at registration and never renamed (no handle-mutation path exists in `actor.service.ts`); a
 * remote actor's or post's `canonicalUri` is safe because it is the federated object's own AS2
 * `id`, set once at ingestion and never rewritten thereafter.
 */
export function localDeterministicActivityUri(
  origin: string,
  kind: 'follow' | 'like',
  actorUri: string,
  objectUri: string,
): string {
  const digest = createHash('sha256').update(`${kind}\n${actorUri}\n${objectUri}`).digest('hex');
  return `${origin}/activities/${kind}/${digest}`;
}
