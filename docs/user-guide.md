# User guide

A guide for people _using_ Patches — running the `patches` terminal client and connecting to
a node. For contributor/developer setup, see the root [`README.md`](../README.md) and
[`docs/operations/local-development.md`](./operations/local-development.md); for the wire
protocol, see [`docs/architecture/api.md`](./architecture/api.md).

## What Patches is

Patches is a small, chronological, open-source social network whose first-class client is a
terminal app. Posts, replies, likes, bookmarks, follows, and a personal "Patches Page" (a
declarative profile page with text, links, a guestbook, and — once media is attached — inline
images), all sorted by time. No ranking algorithm, no ads, no infinite scroll. A **node** is a
server one or more people run; you connect the `patches` client to whichever node your account
lives on.

## Installing

**Status: planned until first publish.**

```bash
npm i -g patches-social
patches --version
```

`apps/tui` now builds as a single self-contained bundle (`apps/tui/tsup.config.ts`) with the
three workspace packages it needs (`@patches/domain`, `@patches/proto`,
`@patches/terminal-media`) inlined directly into `dist/cli.js`, so a plain `npm install -g` no
longer needs those packages published on their own — see `apps/tui/README.md`'s "Self-contained
build" section for how. Verified locally end-to-end (2026-08-18): building, packing, and
installing the tarball into a scratch global prefix produces a working `patches` binary that
runs `--version`, `--help`, and `ping` against the live node with no repo checkout on `PATH`.
What's still outstanding is the publish itself (`npm login` + `pnpm publish`, a manual step by
the package owner — see `docs/operations/deployment.md`'s "Publishing the TUI" section), so
`npm i -g patches-social` isn't runnable from the public registry yet.

Until it's published, run the client from a source checkout:

```bash
git clone <repo-url> patches && cd patches
mise install        # installs the pinned Node 24 / pnpm 11 / buf toolchain (mise.toml)
mise run setup       # pnpm install, .env, local Postgres+mailpit via compose, migrations, build
mise run tui         # builds and runs the TUI against a local server on 127.0.0.1:50051
```

`mise run tui` (see `mise.toml`) is a convenience wrapper around building `@patches/tui` and
running `node apps/tui/dist/cli.js --server 127.0.0.1:50051 --insecure`. `mise install` and
`mise run setup` are the only two commands needed for a from-scratch checkout; both are
defined in the repo's `mise.toml` and were run to verify this guide.

If you already have the toolchain and just want to build/run the client by hand:

```bash
pnpm --filter @patches/tui build
node apps/tui/dist/cli.js --help
```

## Connecting to a node

**The client's default is the flagship node, `patches-social.fly.dev:443`, over TLS.** Run
`patches` (or `patches ping`) with no flags and you're talking to it — no `--server`, no
`--insecure`. It's invite-only today (`INVITE_ONLY=true`); get a code from an existing
member to register.

Every subcommand and the interactive TUI itself also take a `--server`/`--node <host:port>`
flag (or the `PATCHES_SERVER` environment variable) to point at a different node instead —
most commonly a locally-run dev server. Local dev servers don't have a real TLS certificate,
so also pass `--insecure` (or set `PATCHES_INSECURE=1`) to connect over plaintext gRPC:

```bash
patches                                                # open the TUI against the flagship node
patches ping                                           # one-shot connectivity check, JSON out, exit 0/1

patches --server 127.0.0.1:50051 --insecure            # open the TUI against a local dev server
patches ping --server 127.0.0.1:50051 --insecure       # same, for local dev
```

Sessions are stored **per node**: `patches accounts` lists every (node, account) pair with a
stored session on this machine, and a token is never sent to a node other than the one that
issued it.

## What doesn't work yet on the live node

Verified against `patches-social.fly.dev` on 2026-08-18: register, login, `whoami`, posting,
search, follow, like, reply, thread view, notifications, and home feed all work end to end.
Three things don't yet, because they depend on credentials that are dashboard-only to
provision and haven't been fetched into this environment (tracked as `B-031`):

- **Image uploads.** The R2 bucket (`patches-media`) exists, but the node has no R2 S3 access
  keys configured, so `Ctrl+A`-attach in compose will fail server-side.
- **Verification email.** The node runs with `EMAIL_PROVIDER=console` (no Resend sending
  domain verified yet), so verification codes are written to the server's logs
  (`flyctl logs`), not delivered to your inbox. If your account needs email verification,
  ask a node administrator to read the code from the logs for you in the meantime.
- **Federation.** Disabled by design for v0 (`FEDERATION_ENABLED=false`) — this node only
  talks to itself.

## Creating an account and signing in

```bash
patches register --server <host:port>   # prompts interactively for anything not passed as a flag
patches login --password --server <host:port>
patches login --ssh --server <host:port>
```

- `patches register` supports `--email`, `--handle`, `--display-name`, `--invite <code>` (if
  the node requires invites), `--password-stdin` (read the password from stdin instead of an
  interactive prompt), and `--ssh-key <path|fingerprint>` to also enroll an SSH key as a login
  credential during registration. Email is optional recovery/verification data, not your
  account identifier, unless the node's policy requires it.
- `patches login --password --email-or-handle <value>` signs in with a handle or recovery
  email plus a password.
- `patches login --ssh --ssh-key <path|fingerprint>` signs in via a challenge/response against
  a key already loaded in your SSH agent — Patches never reads or transmits your private key,
  only a locally-computed signature over a server-issued challenge.
- Signing in with a GitHub account is supported by the server (OAuth device flow), but there
  is no `patches login` flag for it yet — that client-side wiring hasn't landed.
- `patches logout` (add `--all` to sign out of every stored account on this machine, or `--user
<id>` to disambiguate when more than one account is stored for the same node).
- `patches whoami` prints who you're currently signed in as; `patches accounts` lists every
  stored account.
- `patches keys add [--ssh-key <path|fingerprint>] [--label <text>] [--yes]` enrolls an
  additional SSH key on your account (requires an explicit `y` confirmation, or `--yes`
  non-interactively); `patches keys list` lists your credentials (never a secret);
  `patches keys remove <fingerprint>` revokes one — the server refuses to revoke your last
  remaining credential, so you can never lock yourself out.
- **Email verification**: the server has `VerifyEmail`/`ResendVerification` RPCs, but the
  client-side `patches verify <code> [--resend]` command is being added and is not in this
  build yet (**Status: planned**, tracked as `A-028`) — if your node requires email
  verification, there is currently no client path to redeem a verification code.
- **Editing your profile** (display name, bio, location, website): also being added
  (`patches profile edit`, **Status: planned**, tracked as `A-027`) — today, display name and
  bio can only be set once, at `patches register` time.

## Using the TUI

Once signed in, running `patches` (with `--server`/`--insecure` as above) opens the
full-screen client. Screens and global keys (see
[`docs/architecture/tui.md`](./architecture/tui.md) for the authoritative table):

| Key          | Action                                                                 |
| ------------ | ---------------------------------------------------------------------- |
| `g h`        | go to Home feed (posts from people you follow)                         |
| `g l`        | go to Local feed (public posts on this node)                           |
| `g p`        | go to your own profile                                                 |
| `g n`        | go to notifications                                                    |
| `g b`        | go to your bookmarks                                                   |
| `g d`        | go to direct messages                                                  |
| `g c`        | go to communities on this node                                         |
| `g e`        | edit your display name, bio and nameplate                              |
| `g s` / `/`  | search                                                                 |
| `g v`        | go to your own Patches Page                                            |
| `: / Ctrl+P` | command palette — every key above, by name                             |
| `c`          | compose a new post                                                     |
| `j / ↓`      | move down one post                                                     |
| `k / ↑`      | move up one post                                                       |
| `n / space`  | load the next page of posts                                            |
| `Ctrl+R`     | refresh the current screen                                             |
| `Enter`      | open the selected post's thread                                        |
| `r`          | reply to the selected post                                             |
| `l`          | like/unlike the selected post                                          |
| `b`          | bookmark/unbookmark the selected post                                  |
| `R`          | repost/unrepost the selected post                                      |
| `Q`          | quote the selected post in a new post                                  |
| `d`          | delete your own selected post (confirm `y`/`n`)                        |
| `H`          | view the selected post's edit history                                  |
| `#`          | open the selected post's first tag timeline                            |
| `t`          | search tags                                                            |
| `p`          | open the selected post's author profile                                |
| `f`          | follow/unfollow the profile you're viewing                             |
| `J`          | join/leave the community you're viewing                                |
| `B`          | block/unblock the profile you're viewing (confirm `y`/`n`)             |
| `M`          | mute/unmute the profile you're viewing (confirm `y`/`n`)               |
| `!`          | report the selected post, or the profile you're viewing                |
| `v`          | visit the selected actor's Patches Page (or `patches visit @handle`)   |
| `e`          | edit your own Patches Page (opens `$EDITOR`)                           |
| `o`          | open the selected post's first attachment externally                   |
| `L`          | login / switch accounts                                                |
| `P`          | toggle plain mode (strip nameplate decoration)                         |
| `?`          | help — the full keymap, grouped; `j`/`k` scrolls, `Space`/`PgDn` pages |
| `q`          | quit                                                                   |
| `Esc`        | cancel the current modal/action; back one level otherwise              |

This table is checked against the TUI's own binding table by
`apps/tui/test/docs-keymap.test.ts`, so it cannot drift from the keys the app
actually ships. Press `?` in the app for the complete, contextual list.

### Composing and attaching images

Press `c` to compose. `Ctrl+S` is the only way to submit — `Enter` always inserts a newline,
so you can't accidentally post mid-thought. `Ctrl+A` prompts for a local image path and
attaches it (uploaded, validated, and processed before the post goes out — see
[`docs/architecture/media.md`](./architecture/media.md)). `Esc` closes the compose screen
without discarding your draft; drafts persist locally so a stray `Esc` or terminal resize
won't lose your text.

### Following and search

`g s` or `/` opens actor search (handle prefix and display-name match). From a profile, `f`
follows or unfollows; `Ctrl+A`/attach and the rest of compose behave the same whether you're
posting fresh or replying (`r`).

### Notifications

`g n` lists notifications (replies, mentions, likes, follows), deduplicated server-side.

### Blocking, muting, and reporting

From a profile: `B` blocks (removes any existing follow in either direction), `M` mutes
(doesn't touch follows), both idempotent and confirmed with `y`/`n`. `!` reports the selected
post or the profile you're viewing, with a reason and optional free text. `patches-admin`
(the moderator-facing CLI, not covered here — see
[`docs/operations/moderation.md`](./operations/moderation.md)) is how a node's administrators
review reports, suspend accounts, and act on them.

### Patches Pages

`patches visit @handle[/slug]` (or `v` from a profile/post) opens straight to that actor's
Patches Page — a personal, declarative profile page (text, markdown, links, your recent
posts, a "Top 8"-style friend list, and a guestbook other users can sign). It is inert data,
never executable code, in every client. Press `e` on your own Page to edit it — this opens the
underlying document in your `$EDITOR` (whatever `$EDITOR` is set to in your shell); save and
exit to publish the new revision.

## Plain mode and accessibility

Pass `--plain` (or set `PATCHES_PLAIN=1`), or press `P` at runtime, to strip nameplate
decoration (colored badges/frames) from the UI — useful for screen readers, low-color
terminals, or just personal preference. Image rendering itself gracefully degrades: on a
terminal with Kitty graphics protocol support (e.g. Ghostty, kitty), images render inline; on
any other terminal, Patches falls back to a placeholder box rather than failing or dumping
raw escape codes.

## Troubleshooting

- **Can't reach the node / connection refused.** Confirm `--server`/`PATCHES_SERVER` points at
  the right `host:port`, and that the server is actually reachable from your machine (for a
  local dev server, confirm it's running — `mise run server` in another terminal, or
  `mise run tui` which builds+runs the client but does not start the server for you).
- **TLS errors against a local server.** Local dev servers usually don't have a real TLS
  certificate — pass `--insecure` (or `PATCHES_INSECURE=1`). Don't pass `--insecure` against a
  real production node; it's a plaintext connection.
- **"no OS keyring is available" warning.** Patches prefers storing your refresh token in the
  OS keyring (via `@napi-rs/keyring`); on headless environments or ones without a working
  keyring backend (e.g. some containers/CI, some Linux setups without a D-Bus session), it
  falls back to a plaintext file (mode `0600`) and warns once. To silence the warning and
  explicitly accept the plaintext fallback, set `PATCHES_ALLOW_INSECURE_CREDENTIAL_FILE=1`.
  Without that variable set, Patches refuses to fall back silently and raises instead.
- **Lost/forgot your password.** `RequestPasswordReset`/`ResetPassword` are implemented on
  the server, but there is no `patches` client command for them yet — the flow is server-only
  today. If you still have an SSH key or GitHub credential on the account, use
  `patches login --ssh` (or wait for GitHub login to land in the client) instead; otherwise
  contact your node's administrators.

## Reporting bugs

This is an open-source project; file issues against the repository the `patches` client was
cloned from. Include your client version (`patches --version`), the node you were connecting
to (not the account/credentials), and the exact command or in-app action that triggered the
problem.
