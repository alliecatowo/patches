# Try it — running Patches and testing multiple users

_Status: verified 2026-08-19 against the live node and a local stack._

## 1. Against the live node (recommended)

Install the latest release (Node 24+, no registry login — the repo is public). Check
[github.com/alliecatowo/patches/releases](https://github.com/alliecatowo/patches/releases) for
the newest prerelease tag and asset name, then:

```bash
npm install --global --allow-remote=all https://github.com/alliecatowo/patches/releases/download/<tag>/<asset>.tgz
# e.g. .../download/v0.1.0-alpha.3/patches-social-0.1.0-alpha.3.tgz
# (npm 12 blocks remote tarballs by default: keep `--allow-remote=all`, or download the .tgz and install the local file)
patches ping            # {"ok": true, "target": "patches-social.fly.dev:443", ...}
```

Already installed? `patches` itself checks for a newer release on every interactive launch (at
most once every 6 hours) and offers to upgrade in place — "A Patches upgrade is available: … →
… . Upgrade now? [y/n]"; `y` installs it and tells you to Ctrl+C and relaunch, `n` continues
into the app as normal. `patches upgrade` does the same thing non-interactively (forces a fresh
check, installs if newer, prints the result and exits) — handy after cutting a release
(`docs/operations/release.md`). Skip the check entirely with `--no-upgrade-check` or
`PATCHES_NO_UPGRADE_CHECK=1`; it's already off under `CI=true`.

Or from the repo checkout: `mise run tui:prod` (builds and runs the TUI against the live node;
`mise run ping:prod` for a connectivity check). Plain `patches` / `node apps/tui/dist/cli.js`
defaults to the live node; local development uses `--server 127.0.0.1:50051 --insecure`.

The node is **invite-only**. Mint invites with the admin CLI against the production database
(the Neon connection string is `neonctl connection-string --project-id shy-recipe-96135980`;
`NEON_API_KEY` lives in `.env`):

```bash
DATABASE_URL="<neon string>" DATABASE_SSL=true mise run admin -- invite create --by allie --max-uses 5
```

Register and use the TUI:

```bash
patches register --handle you --display-name "You" --email you@example.com --invite <code>
patches                 # the TUI: g h home · g l local · c compose (Ctrl+A attach image) · / search · f follow
patches --help          # every subcommand (login, logout, accounts, whoami, keys, verify, profile, visit …)
```

Email verification is delivered through Resend from the verified
`noreply@updates.allisons.dev` sender (`docs/operations/deployment.md`).

## 2. Testing several users at once

Sessions are stored per user under the XDG config/data dirs, so the simplest way to drive
two accounts side by side is two terminals with different config homes:

```bash
# terminal 1
XDG_CONFIG_HOME=$HOME/.patches-alice XDG_DATA_HOME=$HOME/.patches-alice-data patches
# terminal 2
XDG_CONFIG_HOME=$HOME/.patches-bob   XDG_DATA_HOME=$HOME/.patches-bob-data   patches
```

Log each in (`L` in the app, or `patches login --password --email-or-handle <handle>` with the
same env vars). Then: bob `/` searches `alice` → `Enter` → `f` follows; alice `c` composes; bob
`g h` sees it, `l` likes, `r` replies; alice `g n` sees the notifications. If you have no
graphical keyring, add `PATCHES_ALLOW_INSECURE_CREDENTIAL_FILE=1` (file-backed session store).

Headless/scripted variant (what the maintainers use): drive the TUI under `tmux`
(`tmux new-session -d -s a -x 100 -y 30 'patches'`, `tmux send-keys -t a c`, `tmux capture-pane -t a -p`).

## 3. Fully local stack

```bash
mise run setup                     # deps, compose (Postgres + MinIO + Mailpit), migrations, build
mise run server                    # gRPC on 127.0.0.1:50051 (needs JWT keys in .env: `pnpm keys:generate`)
mise run worker                    # jobs: emails (Mailpit at http://localhost:8025), media, federation
mise run tui                       # TUI against the local server (INVITE_ONLY=false locally → just register)
mise run fed:lab                   # optional: two federating nodes on one machine (docs/operations/federation.md)
```
