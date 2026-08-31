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
- [x] Retry #14: diagnose the persisted `build-test` failure from its check annotation and add
      `ChangePassword` to the explicit AuthService RPC contract expectation.
- [x] Retry #14: rerun the failing proto-loading test and the complete proto unit-test suite.
