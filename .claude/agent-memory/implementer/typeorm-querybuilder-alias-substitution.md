---
name: typeorm-querybuilder-alias-substitution
description: 'TypeORM 1.x QueryBuilder''s alias.camelCaseProp -> "snake_case" column substitution in raw .andWhere() strings is unreliable once the same alias.property appears more than once inside one condition string — use a fully-qualified quoted column reference instead'
metadata:
  type: feedback
---

Found implementing `FeedService.applyVisibilityFilter`/`listHomeFeed` (P3-002): a raw
multi-line `.andWhere()` condition that referenced `post.authorActorId` (the querybuilder's
camelCase alias.property form) **twice** inside one OR/EXISTS-heavy string failed at runtime
with `QueryFailedError: column post.authoractorid does not exist` — Postgres received the
literal, unquoted text `post.authorActorId`, downcased it (unquoted identifiers are
case-folded), and looked for a column named `authoractorid` instead of `author_actor_id`.

A _single_ top-level `alias.camelCaseProp` reference in its own `.andWhere('post.authorActorId
= :actorId', ...)` call (pre-existing code, still works) is fine — TypeORM's alias substitution
handles that case. It's specifically a **repeated occurrence of the same alias.property inside
one raw condition string** (e.g. the same column referenced in an `OR` branch and again inside
a correlated `EXISTS` subquery) that doesn't get substituted reliably.

**How to apply:** Inside any raw multi-line `QueryBuilder.andWhere()`/`.where()` string that
references the same `alias.camelCaseProperty` more than once — especially across a top-level
condition and a nested correlated subquery — use the fully-qualified, quoted SQL column
reference instead (e.g. `"post"."author_actor_id"`, not `post.authorActorId`), for every
occurrence in that string. Verify empirically with an integration test that actually executes
the query (not just typecheck) — this is a runtime SQL error, invisible to `tsc`/lint. See
`apps/server/src/modules/feeds/feed.service.ts`'s `applyVisibilityFilter`/`listHomeFeed` for
the pattern and the comment explaining it in place.
