# Issue #432 handoff

Implemented the proto source, server authenticated password-change flow, TUI command, web
settings form, generated TypeScript consumer declarations, and documentation.

Retry #3 fixes the persisted CI failures. The protobuf-es descriptor now contains the new RPC
messages and all subsequent descriptor indexes are shifted correctly; ts-proto output is
generator-equivalent. Prettier failures in the server controller, web form, and API docs are also
fixed.

Validation passed: Buf format, lint, and breaking; byte-for-byte proof of the protobuf-es
descriptor transformation against the prior generated descriptor; ts-proto regeneration diff;
changed-file Prettier; and `git diff --check`. `mise run check proto` remains unavailable because
the managed sandbox rejects pnpm's workspace-resolution subprocess with `spawnSync /bin/sh
EPERM`; dependency repair is unavailable due the read-only home store and blocked registry.

No commit, push, PR mutation, or remote-state polling was performed. Workspace changes are left
for the delivery harness.
