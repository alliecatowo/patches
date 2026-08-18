# Moderation

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

```text
invite create
invite list

user inspect <handle>
user suspend <handle>
user unsuspend <handle>

report list
report inspect <id>
report resolve <id>
report dismiss <id>

post remove <id>
```

This is expected to grow — bulk actions, better search, and a
domain-blocklist story once federation lands are all reasonable next
steps. If you're a moderator and the CLI is missing something you need
regularly, that's worth a feature request.

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

If you believe an enforcement action against you was made in error, you
can appeal it. During the alpha, the way to do that is to contact a
moderator directly (through whatever channel invited you to the alpha, or
via the contact listed in [`SECURITY.md`](../../SECURITY.md) if nothing
else is available) and ask for a review.

A formal in-product appeals flow is on the roadmap but doesn't exist yet.
Until it does, appeals are handled by hand — expect a real person to look
at your case, but also expect it to take longer than a polished appeals
UI eventually will.

## Invite-only alpha

During the alpha, registration is invite-only. This is a deliberate
moderation choice, not a scarcity gimmick: a small, invited community is
dramatically easier to keep healthy than an open-signup one, and it lets
moderation tooling and norms mature before the surface area gets large.
Open registration is a post-alpha decision, made once the guidelines,
tooling, and process above have actually been tested against real
reports.
