# Moderation

> Two kinds of statement appear below. **Status: implemented** means the
> behaviour is in the code today. **Status: planned** means
> `INITIAL_VISION.md` §196–§210 (Amendment C) requires it and it does not
> exist yet. If a section carries no marker, it is implemented.

Patches doesn't believe an architecture alone can guarantee a healthy
community — chronological feeds and no algorithmic amplification remove one
class of problem (rage-bait doesn't get a ranking boost), but people can
still be cruel to each other on a perfectly well-designed timeline. This
document is the other half: enforceable rules, a clear process for handling
reports, and tooling that makes moderation someone's actual job rather than
an afterthought.

This is a living document. It will get more detailed as the moderator
tooling and community grow. During the invite-only alpha, treat it as the
current best statement of the rules — not a finished legal contract.

## Community guidelines

The following are not allowed on Patches:

- **Harassment.** Repeated unwanted contact, pile-ons, targeted mockery, or
  campaigns organized to make someone feel unsafe or unwelcome.
- **Hate.** Content that attacks, demeans, or dehumanizes people based on
  race, ethnicity, national origin, religion, caste, sexual orientation,
  sex, gender identity, disability, or serious illness.
- **Threats.** Statements of intent to harm a person or group, physically
  or otherwise, whether "serious" or "joking" — context matters, but the
  burden is on the poster to be unambiguous.
- **Doxxing.** Posting someone's private information — home address, phone
  number, workplace, legal name if they haven't disclosed it, or similar —
  without their consent, or with intent to enable harassment.
- **Impersonation.** Creating an account that misrepresents itself as
  another real person, organization, or as a Patches account it isn't (e.g.
  faking an official or moderator identity), in a way intended to deceive.
- **Spam.** Repetitive, unsolicited, or automated low-value content;
  coordinated inauthentic behavior; artificial amplification.
- **Illegal content.** Anything that's illegal to host or distribute under
  applicable law, including but not limited to child sexual abuse material
  (reported immediately to the relevant authorities, not just removed).
- **Non-consensual intimate media (NCII).** Sharing or threatening to share
  intimate images or video of someone without their consent. Zero
  tolerance — this is an immediate ban, not a warning.
- **Abuse of technical infrastructure.** Attempts to compromise, overload,
  scrape at abusive scale, or otherwise misuse the service outside normal
  use of the product.

This list will grow as real situations surface ones we didn't think to
write down. If something happens that isn't covered above but is clearly
in the same spirit, moderators can and will act on it — these guidelines
describe the spirit of what's not welcome here, not an exhaustive legal
checklist with loopholes to find.

## Enforcement ladder

Most violations move through an escalating ladder rather than jumping
straight to a permanent ban. Severity and pattern both matter — a single
careless comment gets treated differently than a sustained campaign, and
some things (NCII, credible threats, CSAM) skip straight to the end of the
ladder regardless of history.

1. **Warn.** A private notice explaining what rule was broken and why. No
   visible restriction on the account. Most first-time, lower-severity
   issues stop here.
2. **Suspend.** A temporary restriction — the account can't post, reply,
   or interact for a set period. Used for repeated violations after a
   warning, or a single more serious violation that doesn't warrant a
   permanent ban.
3. **Ban.** Permanent loss of account access. Reserved for severe
   violations (NCII, credible threats, illegal content), or a pattern of
   behavior that a warning and suspension already failed to correct.

Every enforcement action is tied to a specific report or a specific piece
of evidence, and every action is logged (see [Audit logging](#audit-logging)
below). Moderators aren't expected to explain every internal detail of a
decision publicly, but they are expected to be able to justify it
internally, on request, always.

## Report handling flow

Reports move through a fixed set of states:

```text
OPEN        the report has been filed, not yet looked at
   |
   v
REVIEWING   a moderator has picked it up and is actively assessing it
   |
   +--> RESOLVED    action was taken (warn/suspend/ban/content removed)
   |
   +--> DISMISSED   no violation found, or already handled elsewhere
```

A report captures who filed it, what's being reported (a post or an
actor), a reason, optional free-text details, and — once a moderator has
looked at it — a moderator note and who resolved it.

A few rules that shape this flow:

- **Reported content is not auto-deleted.** A report alone doesn't remove
  anything. Content comes down only after a moderator confirms a
  violation, or in the small number of cases (CSAM, active NCII) where an
  automated hold is justified pending review.
- **Reporters get a resolution signal**, even if it's just "reviewed, no
  action taken" — being ignored is its own kind of harm.
- **Reports are not public.** Who reported what, and any internal notes,
  are visible only to moderators.

## Moderator tooling

Because Patches is TUI-first, moderation tooling is a CLI, not a web
dashboard — building a React admin panel before the actual product works
would be backwards. The admin CLI (`patches-admin`, invoked as `pnpm admin`
in the monorepo) is the primary moderation surface:

Actual `patches-admin --help` output (`pnpm --filter @patches/admin build && node
apps/admin/dist/main.js --help`):

```text
  invite create [--max-uses N] [--expires <iso>]
  invite list
  invite revoke <id>

  user list
  user show <handle>
  user suspend <handle> --reason <text>
  user unsuspend <handle>
  user delete <handle> [--reason <text>]

  report list [--status open]
  report show <id>
  report resolve <id> --action <none|remove-post|suspend> [--note <text>]

  post remove <id> --reason <text>

  jobs list [--status DEAD]
  jobs show <id>
  jobs replay <id>

  domain block <domain> [--reason <text>] [--reason-category <category>]
  domain unblock <domain>
  domain list
  domain review-list <file>

  appeal list [--status open]
  appeal inspect <id>
  appeal resolve <id> --outcome <upheld|overturned|modified> --reason <text>
```

`report resolve --action none` is how a report is dismissed — there is no separate `dismiss`
subcommand. `user delete` moves an account through the same request-then-purge deletion path
as self-service account deletion (Amendment C §197.4) in addition to its existing immediate
status flip, rather than being a second, weaker deletion. `jobs` inspects/replays the
background job queue (exports, purges, media processing, federation delivery) — see
[`docs/architecture/jobs.md`](../architecture/jobs.md).

Domain blocking (`domain block|unblock|list|review-list`) is enforced on inbound federation
traffic and at outbound delivery time, and additionally filtered into recipient resolution
itself (§201.5) — see [`docs/architecture/federation.md`](../architecture/federation.md) §5.5
and §6. `domain review-list <file>` reviews a third-party blocklist file as reference input for
an operator to read — it never writes to `domain_blocks` on its own (§201.6).

## Audit logging

Every admin/moderator action — suspensions, bans, report resolutions,
post removals, invites issued — is written to an append-only audit log
(`admin_audit_log`) recording who did what, to what, and when, with
whatever structured context is relevant to that action type.

The audit log deliberately never records passwords, access tokens,
refresh tokens, or reset codes, even in its metadata — moderation history
and credential material are kept strictly separate.

The audit log exists so moderation is accountable, not just to users but
to other moderators and, eventually, to some form of external review. If
an action can't be justified by pointing at the report and the log entry,
that's a problem with the action, not the log.

## Appeals

**Status: implemented** (§201.2–§201.3, P14-011). Every enforcement action against you
generates an in-product moderation notice, readable via `ModerationService.
ListMyModerationNotices` — reachable even from a suspended or pending-deletion account, since
those are precisely the actions being appealed (`SuspensionTolerantAuthGuard`). File an appeal
against a notice with `AppealService.CreateAppeal` (one per notice, rate-limited 5/day, rejected
once the node's appeal window has closed); `GetAppeal`/`ListMyAppeals` are visible only to the
appellant, never the reporter or the public. Admin-side resolution is CLI-only
(`patches-admin appeal list|inspect|resolve`, mirroring `report list|inspect|resolve`) — there
is deliberately no gRPC resolve RPC, and resolving an appeal never automatically reverses the
underlying enforcement action (an admin who overturns a suspension still runs `user unsuspend`
separately).

## Node moderation is the floor, not the whole system

**Status: implemented** (§196–§201, P14-007 through P14-011). Everything above this line —
guidelines, the enforcement ladder, reports, the admin CLI, the audit log —
is the node's own floor, and Amendment C does not weaken it: a node ban
removes an account for everyone, regardless of what any individual has
chosen to filter, subscribe to, or trust. What Amendment C adds sits above
that floor and is entirely opt-in:

- **Your own filters** — keyword, phrase, tag, author, and link-domain
  rules that hide or collapse posts for _you_, evaluated by the server so
  every client agrees, never shared with anyone, never affecting anyone
  else's view (§198).
- **Filter lists** you can publish or subscribe to — curated collections
  of filter terms, with your identity as publisher always shown to
  subscribers. Subscribing can never create a block on your behalf; you
  choose the action, and you can promote any single entry to a real block
  yourself (§199).
- **Labelers** — actors or communities that annotate posts/accounts with
  labels from a bounded, node-published vocabulary (no free text, no
  scores). A label is visible only to that labeler's own subscribers and
  never changes feed order or ranking for anyone (§200).

None of this is a second moderation system with its own authority — it's a
set of opt-in lenses a viewer can put on or take off, on top of a floor
that stays exactly as strict as it is today.

## Public moderation log

**Status: implemented** (§201.4, P14-012, P14-027).
`ModerationService.ListModerationLog` (unauthenticated, keyset-paginated) publishes the node's
own enforcement actions — domain blocks fully identified (which domain, why), and
account/post-level actions (warn/suspend/ban/removal) recorded only as an anonymized entry:
action taken, reason category, timestamp, whether it was appealed. **No handle or post is ever
named in the public log** — publishing "who" would turn a transparency page into a harassment
target list, which is the opposite of the point; account/post/media entries have no
actor-id/post-id column to leak in the first place. Today `patches-admin domain block` writes
`DOMAIN_BLOCK` entries; `user suspend`/`user delete` write `SUSPEND`/`BAN` account-kind entries;
`report resolve --action remove-post`/`--action suspend` write `POST_REMOVAL`/`SUSPEND` entries
(`--action none` writes none). The person the action was taken against sees the full detail in
their own moderation notice (`ListMyModerationNotices`); moderators see it in the audit log;
the public sees that the floor is being enforced, and for what. See
[`api.md`](../architecture/api.md)'s `ModerationService` section.

## Direct messages and communities

**Status: implemented.** Direct messages and communities each have their own moderation
surface, layered on top of the node floor above, not separate from it.

**Direct messages** (§183.4): `ModerationService.ReportMessage` snapshots the reported message
plus up to ten surrounding messages for moderator review — a DM report is unactionable without
that evidence, which is one reason v0 DMs are server-visible rather than end-to-end encrypted
(see [`privacy.md`](privacy.md#direct-messages)). Blocking is bidirectional and immediate: it
stops delivery both ways and hides the conversation from the blocker, and a blocked sender's
send simply fails the way any unavailable recipient's would, revealing nothing. Message and
message-request sends are rate-limited per actor and per peer.

**Communities** (§182.3): the creator is the first moderator; moderators may appoint/remove
other moderators (never the creator), remove a post _from the community_ — the post survives
on the author's own profile with `community_id` cleared, and the removal is audit-logged — and
ban an actor from the community (`CommunityService.RemovePostFromCommunity`/
`BanFromCommunity`/`SetCommunityRole`). Community moderation is scoped to that community only:
it cannot suspend an account globally, delete a post outside the community, or reach any other
community. Node moderators outrank community moderators everywhere — the node floor above is
never bypassable by a community's own moderation.

## Invite-only alpha

During the alpha, registration is invite-only. This is a deliberate
moderation choice, not a scarcity gimmick: a small, invited community is
dramatically easier to keep healthy than an open-signup one, and it lets
moderation tooling and norms mature before the surface area gets large.
Open registration is a post-alpha decision, made once the guidelines,
tooling, and process above have actually been tested against real
reports.
