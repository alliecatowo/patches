# Identity chrome parity — web ↔ TUI

Status: implemented

One rule set for how `Actor.nameplate` (spec §173) renders wherever an actor's name appears,
kept identical in meaning across `apps/web` and `apps/tui`. Cosmetic only (Amendment B §184.3):
a nameplate never changes identity resolution, authorization, feed position, or access to
function — it only changes how a name looks.

## The rule

1. **Colour.** `nameplate.nameColor` is either a single hex colour, or two hex stops separated
   by a comma (`"#a,#b"`) meant as a gradient. Absent/empty means no colour override — render
   the handle/name in the surrounding text colour.
   - Web (`apps/web/src/components/Nameplate.tsx`) can render the true two-stop
     `linear-gradient` via CSS (`.gradient` class + `--nameplate-gradient` custom property).
   - TUI (`apps/tui/src/components/Nameplate.tsx`) has no gradient primitive in Ink's `<Text>`,
     so it renders the gradient's **first stop** as a flat colour. This is a documented,
     accepted client capability gap, not a bug — see the component's own doc comment.
2. **Glyph.** `nameplate.glyph` is a single narrow glyph rendered immediately before the
   name/handle, marked `aria-hidden`/non-semantic on both clients since it is decorative.
3. **Degradation.** A nameplate is never required to read a post or identify who posted it
   (§173). No nameplate, or one with an empty colour/glyph, renders a plain `@handle` — never an
   error, placeholder box, or broken layout.
   - TUI additionally strips colour and glyph unconditionally in plain mode
     (`usePlainMode()` / `PATCHES_PLAIN=1` / `--plain` / runtime `P`), the required
     high-contrast/no-decoration fallback (§173).
   - Web has no plain-mode toggle; it relies on standard OS/browser contrast and forced-colors
     support, and a nameplate colour never overrides `color-scheme`-driven text contrast to the
     point of being unreadable (component never sets a colour without the surrounding CSS's
     contrast guarantees).
4. **Never gates function.** Neither client ever uses `nameplate` presence/absence to decide
   whether a name is a link, whether an action is available, or whether content loads.

## Where it applies (this pass)

Excludes Thread/Profile screens and Messages/DM surfaces (owned by a concurrent E2EE
workstream); those already had their own `Nameplate` usage before this change and were not
touched here.

| Surface                                      | Web                                                                                            | TUI                                               |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Feed rows                                    | `PostCard.tsx` (author + quoted-post author)                                                   | `PostRow.tsx`                                     |
| Search results (people)                      | `SearchRoute.tsx` — now uses `Nameplate`/`CosmeticText` (was plain text; fixed in this change) | `SearchScreen.tsx`                                |
| Notifications                                | via `ActorList.tsx`                                                                            | `NotificationsScreen.tsx`                         |
| Page attribution (Top 8, Friends, Guestbook) | `PageBlocks.tsx` — now uses `Nameplate`/`CosmeticText` (was plain text; fixed in this change)  | `pages/render/blocks.tsx`                         |
| Actor lists (follow requests, mutuals)       | `ActorList.tsx`                                                                                | `ActorListScreen.tsx`, `FollowRequestsScreen.tsx` |

## What changed in this pass

`apps/web/src/routes/SearchRoute.tsx` and `apps/web/src/components/PageBlocks.tsx`
(`TopEightBlock`, `FriendsBlock`, guestbook author attribution) rendered `displayName`/`handle`
as plain text with no nameplate styling — every other listed surface, and the TUI equivalents,
already applied it. Both now use the same `Nameplate`/`CosmeticText` pair `PostCard.tsx` already
uses, closing the parity gap.
