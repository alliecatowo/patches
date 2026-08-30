# Issue #432 plan

- Add `ChangePassword` to the auth protobuf and generated consumer surfaces.
- Verify the authenticated caller's current password before hashing the replacement; replace
  the credential transactionally and revoke other sessions.
- Expose the flow through `patches keys password` and web Settings → Sign-in methods.
- Document the authenticated and recovery-email paths and validate the changed workspaces.
