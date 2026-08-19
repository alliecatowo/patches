---
name: tui-cli-credential-store-flag-gap
description: register/login subcommands don't accept --allow-insecure-credential-file; only the env var works
metadata:
  type: project
---

`apps/tui`'s `register`/`login` CLI subcommands each hand-roll their own flag parser
(`parseRegisterFlags`/`parseLoginFlags`) and reject any unrecognized flag before
`openCredentialStore(io, env, rest)` ever runs — so `--allow-insecure-credential-file`
(which `isAllowInsecureCredentialFile` checks for in `rest`) is unreachable from those two
subcommands even though the check exists. `PATCHES_ALLOW_INSECURE_CREDENTIAL_FILE=1` (env
var) is the only way to skip the OS-keyring requirement for `register`/`login` in a sandbox
with no keyring.

**Why:** hit this running `infra/lab/fed-lab.sh` (B-029) end to end — `register --handle
alice --password-stdin --allow-insecure-credential-file` fails with "Unknown option for
register", even though the flag is real and documented for other auth subcommands.

**How to apply:** when scripting/documenting `patches register`/`patches login` in an
environment without a keyring (CI, sandboxes, containers), set
`PATCHES_ALLOW_INSECURE_CREDENTIAL_FILE=1` in the environment rather than passing the flag.
Worth a `/retro`-filed follow-up to either accept the flag on these two subcommands too, or
document the inconsistency in the TUI's own `--help`.
