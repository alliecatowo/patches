# Issue #432 handoff

Implemented the proto source, server authenticated password-change flow, TUI command, web
settings form, generated TypeScript consumer declarations, and documentation.

Retry #14 fixes the remaining persisted `build-test` failure. The AuthService RPC contract test now
expects `ChangePassword`, matching the generated service surface reported by CI. Earlier retry
fixes remain intact: the protobuf-es descriptor contains the new RPC messages, subsequent
descriptor indexes are shifted correctly, ts-proto output is generator-equivalent, and the
server/web/API-doc formatting defects are fixed.

Retry #14 validation passed: the exact failing proto-loading test (9 tests), the complete proto
unit-test suite (3 files, 39 tests), and Prettier on the changed test. Prior validation covered Buf
format/lint/breaking, generated-code freshness, changed-file formatting, and `git diff --check`.

No commit, push, PR mutation, or remote-state polling was performed. Workspace changes are left
for the delivery harness.
