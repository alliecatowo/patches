# Issue #432 plan

- [x] Add `ChangePassword` to the auth protobuf and generated consumer surfaces.
- [x] Verify the authenticated caller's current password before hashing the replacement; replace
      the credential transactionally and revoke other sessions.
- [x] Expose the flow through `patches keys password` and web Settings → Sign-in methods.
- [x] Document the authenticated and recovery-email paths.
- [x] Retry #3: replace the hand-edited generated outputs with generator-equivalent output,
      including the protobuf-es descriptor and shifted message indexes.
- [x] Retry #3: repair formatting failures in the server controller, web settings form, and API
      documentation.
- [ ] Run workspace typecheck/tests through `mise run check`; the managed sandbox denies the
      subprocess that resolves the pnpm workspace (`spawnSync /bin/sh EPERM`).
