---
name: shared-checkout-check-sibling-commits-for-contract
description: When implementing a new proto RPC while another agent owns the consuming client (e.g. apps/tui) in the same shared checkout, check their already-landed commits for the exact request shape/auth assumptions before finalizing the server handler — don't just match the task brief's wording
metadata:
  type: feedback
---

Found implementing B-024 (`SocialGraphService.ListMutualFollows`): the task brief said "requires
an authenticated session" was a reasonable default matching this controller's sibling RPCs
(`FollowActor`/`UnfollowActor`/`GetRelationship` all require `AuthGuard`), so that's what got
implemented first. Before committing, `git log --oneline` on the shared branch showed the TUI
agent had _already_ landed `feat(tui): client + fake-api support for ListMutualFollows/
ResolveActor, Friends block` — and its `FriendsBlockView` calls `context.api.listMutualFollows(...)`
with **no `accessToken`**, because it renders on a public Page (`PageScreen`) a signed-out
visitor can view. Requiring auth server-side would have silently broken that feature (every
call would 401) despite both sides typechecking fine (auth failures are a runtime gRPC status,
invisible to `tsc`).

**How to apply:** In a shared checkout where another agent owns the client half of an API you're
implementing the server half of, `git log --oneline <branch>` for their commits before finalizing
auth/shape decisions the brief didn't pin down explicitly, and read the actual call sites (not
just type imports) — a client passing `undefined` for `accessToken`, or a specific field
name/shape, is a real constraint your server implementation must match, not just "reasonable
defaults" you're free to pick independently. This is cheap (one `git show --stat` + a `grep` of
the relevant call site) relative to shipping a contract mismatch nobody's tests would catch, since
each side's own test suite mocks the other side's behavior.
