/**
 * Deterministic outbound activity ids (ADR 0028 §4, `docs/decisions/
 * 0028-federating-social-depth.md`): any activity this node may later have to **undo** gets
 * an id reconstructed from the stable row that caused it — never `randomUUID()` per
 * emission — so a peer that saw the original can match the later `Undo` against exactly the
 * activity id it already recorded. One-shot activities with no undo path (`Create`/
 * `Delete`, and the outer `Undo` wrapper documents themselves) stay randomly minted at
 * their call sites; only the *undone inner* id must be stable. (The existing Follow/Like
 * paths predate this rule and still mint random inner ids on Undo — ticket B-079, to be
 * fixed separately; do not copy them for new activity types.)
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
