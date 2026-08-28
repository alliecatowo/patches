# Native passkey login/enrollment on mobile (issue #222, from P10-017)

Verified 2026-08-28, reusing and extending the 2026-08-20 findings already recorded in
`docs/research/expo-react-native.md` §6 (Apple Developer docs, npm registry live, GitHub source
repos for `react-native-passkeys` and `expo-passkeys`, fetched on that date). This note narrows
that research to a concrete spike plan and cross-checks it against the actual server contract
(`packages/proto/proto/patches/v1/auth.proto`), which the earlier note did not enumerate.

## 1. What the server actually expects (documented — reading the proto/impl directly)

`AuthService` in `packages/proto/proto/patches/v1/auth.proto` (lines 151–170) carries every
passkey payload as an **opaque `string`** — "the corresponding `@simplewebauthn/*` JSON type
carried verbatim... rather than a field-by-field proto mirror of the WebAuthn spec's own
options/response objects":

- `BeginPasskeyRegistration` / `BeginPasskeyLogin` return a JSON-serialized
  `PublicKeyCredentialCreationOptionsJSON` / `PublicKeyCredentialRequestOptionsJSON` (whatever
  `@simplewebauthn/server`'s `generateRegistrationOptions`/`generateAuthenticationOptions`
  produce — see `docs/research/simplewebauthn.md` §2).
- `CompletePasskeyRegistration` / `CompletePasskeyLogin` expect the JSON string form of
  `RegistrationResponseJSON` / `AuthenticationResponseJSON` back, which the server feeds
  straight into `@simplewebauthn/server`'s `verifyRegistrationResponse`/
  `verifyAuthenticationResponse`.
- `BeginPasskeyLogin` is unauthenticated and discoverable-credential-only: no handle/username is
  ever sent: the assertion's own credential id identifies the account.

**Consequence for mobile:** whatever a native wrapper returns from its `create`/`get` calls must
serialize to byte-identical (or `@simplewebauthn/server`-parseable) JSON in that exact shape —
this is the compatibility gap the existing research already flagged as unverified from docs
alone, and it is the single largest risk in this spike.

## 2. Platform requirements to even attempt a native ceremony (documented)

Restating `docs/research/expo-react-native.md` §6, which is the authoritative source for these
claims (all fetched 2026-08-20):

- **iOS**: `ASAuthorizationPlatformPublicKeyCredentialProvider` requires the **Associated
  Domains entitlement** plus a hosted `apple-app-site-association` file (HTTPS, publicly
  reachable, `Content-type: application/json`, `webcredentials` section naming the app's bundle
  id) — Apple Developer docs
  (`developer.apple.com/documentation/xcode/supporting-associated-domains`,
  `developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.associated-domains`).
- **Android**: the Credential Manager / Digital Asset Links pattern needs a hosted
  `.well-known/assetlinks.json` with `delegate_permission/common.handle_all_urls` AND
  `delegate_permission/common.get_login_creds` relations naming the app's real package name and
  signing certificate fingerprint.
- **`react-native-passkeys`** (npm `latest` 0.4.2 as of 2026-08-20, peer deps
  `expo>=53.0.0`/`react-native>=0.71.0`) is the only actively maintained wrapper found with a
  plausible API (`create`/`get` mirroring `navigator.credentials`). It explicitly requires
  **"Prebuild and run your app"** — i.e. a custom dev client / EAS build, not Expo Go — plus
  `expo-build-properties` entries (iOS deployment target ≥15.0, Android `compileSdkVersion`
  ≥34).
- **`expo-passkeys`** (npm `latest` 0.1.11) self-describes as **not production-ready**
  ("iOS (in development)... will currently don't work inside other projects") — not viable as
  a dependency today.
- No official Apple, Google, Expo, or `react-native-passkeys` doc makes an explicit claim that
  the wrapper's output JSON matches `RegistrationResponseJSON`/`AuthenticationResponseJSON` byte
  for byte. This is inferred from "stays close to the standard `navigator.credentials`" wording
  and general WebAuthn-wrapper convention, not a documented guarantee.

## 3. Why a spike, not an implementation task

Every item above is either (a) infrastructure Patches does not yet operate for mobile (a stable
HTTPS origin serving AASA/asset-links tied to the app's real bundle id/package name — which in
turn requires the app to already be registered with Apple/Google under a real identifier, not a
placeholder), or (b) an unverified compatibility claim that only a runtime test can settle. None
of it can be resolved by more documentation reading; `docs/research/expo-react-native.md` §6
already reached that conclusion in general terms. This note turns it into a bounded spike plan.

## 4. Spike plan (what the follow-up implementation issue should scope)

1. **Exit Expo Go.** Stand up a custom dev client (`expo prebuild` + EAS build or local
   Xcode/Android Studio build) for `apps/mobile`, since `react-native-passkeys` cannot run under
   Expo Go (§2).
2. **Host the two well-known files** at the domain `apps/mobile` will actually ship under
   (`PUBLIC_ORIGIN` per `docs/architecture/federation.md`'s identity model, or a dedicated
   mobile-app domain if the product wants app-store bundle ids decoupled from the node's public
   origin): `apple-app-site-association` with a `webcredentials` section, and
   `.well-known/assetlinks.json` with both required relations. Both need the app's real, final
   bundle id / package name and (for Android) signing certificate fingerprint — meaning this step
   cannot start until those identifiers are finalized with Apple/Google.
3. **Wire `react-native-passkeys`** behind the existing `AuthService` RPCs: call
   `BeginPasskeyRegistration`/`BeginPasskeyLogin` for the challenge JSON, feed it to the
   wrapper's `create`/`get`, and send the wrapper's response JSON straight to
   `CompletePasskeyRegistration`/`CompletePasskeyLogin` with no transformation — if the server
   round trip fails `@simplewebauthn/server`'s verification, that is the compatibility gap this
   spike exists to find.
4. **Record the outcome.** If the wrapper's JSON is compatible: file the real implementation
   task (proto is already mobile-agnostic — no protocol change needed, only client wiring) and
   update this note with the confirmed shape. If it is not compatible: either a translation layer
   is buildable (documented in a follow-up note) or the ADR-0011/0022 "web-client-only" scope
   should be reaffirmed explicitly for mobile rather than left as an open question.

## 5. Sources

- `docs/research/expo-react-native.md` §6 (2026-08-20) — Apple Developer docs, npm registry
  (`react-native-passkeys`, `expo-passkeys`), GitHub source for both packages.
- `docs/research/simplewebauthn.md` (2026-08-19) — `@simplewebauthn/server`/`browser` v13
  request/response JSON shapes the server actually verifies against.
- `packages/proto/proto/patches/v1/auth.proto` lines 151–170 (read directly, 2026-08-28) — the
  opaque-JSON-string RPC contract every native ceremony's output must satisfy.
- Apple: `developer.apple.com/documentation/xcode/supporting-associated-domains`,
  `developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.associated-domains`
  (fetched 2026-08-20, per the source note).
