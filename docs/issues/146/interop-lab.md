# E2EE v1 interoperability lab

## Scope

The lab exercises the real server over the Connect HTTP edge and the Node reference driver. It
covers the web/HTTP transport boundary, server fanout/franking/mailbox behavior, and the reference
client's seal/open/decrypt assertions. The TUI uses the same domain/crypto contract, but a TUI
interactive session was not run in this workspace because the lab node was not running.

## Repeatable commands

```sh
bash -n infra/scripts/e2ee-lab.sh
infra/scripts/e2ee-lab.sh run
```

For a manual TUI pass:

```sh
infra/scripts/e2ee-lab.sh up
node apps/tui/dist/cli.js --insecure --server 127.0.0.1:50063
infra/scripts/e2ee-lab.sh down
```

The script creates an isolated `patches_e2ee_lab` database, registers two accounts, checks
`E2EE_CAPABILITY_STATE_ENABLED`, verifies both accounts with the admin CLI, then runs
`infra/scripts/e2ee-lab-driver.mjs`. The driver asserts roots, certified devices, mutual-follow
eligibility, E2EE conversation creation, atomic fanout, byte-identical ciphertext receipt, franking
tag issuance, mailbox acknowledgement, and drain.

## Evidence from this run

- `bash -n infra/scripts/e2ee-lab.sh`: pass.
- `infra/scripts/e2ee-lab.sh walk`: exit 1, fail-closed because `e2ee-server` was not running.
- No lab process, database, or message was created by the failed walk.

This is prerequisite evidence, not an interop pass. A green lab run is required before production
enablement and must be attached to the rollout record with the build SHA and sanitized logs.
