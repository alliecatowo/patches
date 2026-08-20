# Expo / React Native (apps/mobile, P10-002)

**Stack in scope:** Expo SDK, `expo-secure-store`, `@connectrpc/connect-web` fetch transport reused
from `@patches/client`, unary-only per ADR `0016-connect-transport-and-client-sdk.md`.
**Verified:** 2026-08-20 (npm registry queried live; docs fetched live from docs.expo.dev,
connectrpc.com, github.com/connectrpc).

## 1. Expo SDK version, RN/React versions, scaffolding

**Documented:**

- Current Expo SDK is **57.0.0** (`docs.expo.dev/versions/latest/`, fetched 2026-08-20), bundling
  **React Native 0.86** and **React 19.2.3**. Minimum Node 22.13.x (repo's `mise.toml` pins Node 24,
  which satisfies this).
- npm registry confirms the `latest` dist-tag: `expo@57.0.14`, `expo-secure-store@57.0.1` — same
  `57.x` major train (checked 2026-08-20 via `npm view expo dist-tags --json`).
- Scaffold command per current docs: `npx create-expo-app@latest --template default@sdk-57`
  (`docs.expo.dev/get-started/create-a-project/`).
- `create-expo-app` templates (`docs.expo.dev/more/create-expo/`):
  - `default` — **now Expo Router by default** ("Designed to build multi-screen apps. Includes
    ... Expo Router library and TypeScript configuration"). This is a change from the older
    "blank TS + App.tsx" default that training data would assume.
  - `blank` — minimal deps, **no navigation configured**, no Expo Router.
  - `blank-typescript` — blank + TypeScript.
  - `tabs` — Expo Router + TypeScript, file-based routing.
  - `bare-minimum` — blank + native `android/`/`ios/` dirs (ejected).

**Inferred:**

- For this task's "simplest viable structure" requirement (single `App.tsx`, manual state-based
  screen switching, no react-navigation/expo-router), **`--template blank-typescript`** is the
  correct choice, not `default`. The `default` template pulls in `expo-router` and its `app/`
  directory convention; you'd have to strip that out, which is more work than starting from
  `blank-typescript`.
- `blank-typescript` is still fully supported as a `create-expo-app` template option as of SDK 57 —
  nothing in the docs marks it deprecated or discourages a manual-navigation `App.tsx` structure.
  The docs don't show a worked example of manual screen-switching, but nothing about the current
  Expo CLI or SDK 57 makes it awkward; `blank-typescript` explicitly exists for building your own
  navigation. (inferred: docs describe the template's purpose, not this repo's specific pattern.)
- `blank-typescript` templates in recent Expo SDKs use `App.tsx` as entry with `babel.config.js`
  (`babel-preset-expo`) and `app.json`/`app.config.ts` for Expo config — this matches training-data
  expectations and nothing fetched contradicts it, but it was not directly re-verified byte-for-byte
  against the SDK 57 template source in this pass. **Flagged as not independently re-verified against
  the actual `blank-typescript` template repo contents** — worth a follow-up `WebFetch` of
  `github.com/expo/expo/tree/main/templates/expo-template-blank-typescript` before implementation if
  precision on the generated file list matters.

## 2. `expo-secure-store` API

**Documented** (`docs.expo.dev/versions/latest/sdk/securestore/`, fetched 2026-08-20):

- Import: `import * as SecureStore from 'expo-secure-store';`
- `SecureStore.setItemAsync(key: string, value: string, options?: SecureStoreOptions): Promise<void>`
- `SecureStore.getItemAsync(key: string, options?: SecureStoreOptions): Promise<string | null>` —
  resolves `null` if the key doesn't exist or has been invalidated.
- `SecureStore.deleteItemAsync(key: string, options?: SecureStoreOptions): Promise<void>`
- Synchronous variants (`setItem`/`getItem`) exist but **block the JS thread** — do not use them.
- `SecureStoreOptions`: `requireAuthentication` (biometric gate), `authenticationPrompt`,
  `keychainAccessible` (iOS-only), `keychainService` (Android: key alias; iOS: service id),
  `accessGroup` (iOS-only, cross-app sharing).
- Storage backing: Android uses `SharedPreferences` encrypted via Android Keystore; iOS uses
  Keychain Services and **persists across uninstalls** if the app is reinstalled with the same
  bundle ID (relevant: a logout/uninstall does not guarantee token deletion on iOS — call
  `deleteItemAsync` explicitly on logout, don't rely on uninstall).
- Size limit: docs state "large payloads can be rejected by the underlying platform" and call out
  that "historically, some iOS releases refused values above roughly 2048 bytes." **This is
  documented for iOS, not confirmed for Android** in current docs — the ~2048-byte figure you
  recalled is real but iOS-specific per current wording, not a hard Android SharedPreferences cap.
  Expo does not enforce or state a limit itself.
- Platform support: works in Expo Go; **`requireAuthentication` (biometric gate) does not work in
  Expo Go** on iOS (missing `NSFaceIDUsageDescription`) and needs a dev/native build. Plain
  get/set/delete (no biometric gate) works in Expo Go. No web support.
- This slice only needs plain `setItemAsync`/`getItemAsync`/`deleteItemAsync` (no
  `requireAuthentication`), so **Expo Go is sufficient** for this task; no dev build required.

**Inferred:**

- Access token (short-lived, per ADR 0016: 15m) and refresh token together are well under any
  plausible size limit — this is not a real constraint for this task, just noted per your question.

## 3. `@connectrpc/connect-web` `createConnectTransport` (fetch) in React Native

**Documented:**

- `connectrpc.com/docs/web/choosing-a-protocol/` (fetched 2026-08-20) describes the Connect
  transport as using the browser `fetch` API and is written **exclusively for browser
  environments** — it does not mention React Native at all. There is no official Connect-ES
  statement of RN support.
- `github.com/connectrpc/connect-es` issue #199 (source repo, fetched 2026-08-20 — already cited
  in ADR 0016) confirms: React Native's `fetch` is a polyfill built on `XMLHttpRequest` and **does
  not support streaming requests**; connect-es maintainers state there is "no real option to
  implement full streaming on React Native for Connect at the moment," with no workaround pending
  an RN core fix. This matches ADR 0016's framing exactly. **Unary-only is the only correct scope for
  RN** — confirmed, not just inferred.

**Inferred / unverified — flag for careful testing, not a documented Connect-ES statement:**

- Nothing in the fetched Connect-ES docs states whether unary requests over RN's fetch polyfill work
  _unmodified_. Given unary requests are a single request/single response (no streaming needed),
  and RN's fetch (via `whatwg-fetch`/the RN core polyfill) supports normal request/response bodies,
  unary Connect calls **should** work — but this is inference from the streaming-only limitation
  description, not a direct "unary works" confirmation from an official source. **Recommend a smoke
  test against a live server early in P10-002**, not just trusting this note.
- `crypto.randomUUID()` availability: `@patches/client`'s `bindService` calls this per request
  (per this task's brief). **Hermes (RN's default JS engine) does not provide a Web Crypto
  implementation (`crypto.getRandomValues`/`crypto.randomUUID`) out of the box.** This claim comes
  from secondary sources only (Medium articles, `facebook/hermes` GitHub issue #915 title, npm
  package descriptions for `react-native-get-random-values`) — **not verified against an official
  Meta/React Native or Hermes doc page in this pass**, flagged per spec §132 as secondary-source
  only. It is consistent with well-known RN behavior and training knowledge, but should be spot
  checked (e.g. log `typeof crypto?.randomUUID` on a real Expo Go session) before relying on it.
  - `expo-crypto`'s docs (`docs.expo.dev/versions/latest/sdk/crypto/`, fetched 2026-08-20) **do**
    document `Crypto.randomUUID()` as a first-class, official Expo SDK API: `import * as Crypto
from 'expo-crypto'; const id = Crypto.randomUUID();`. This is the **officially documented,
    lowest-risk fix**: call `Crypto.randomUUID()` directly (or assign it to `globalThis.crypto`
    yourself) rather than relying on a global polyfill — Expo's own docs do not describe an
    automatic global-`crypto` polyfill install step, so **inferred:** you likely need to either (a)
    inject `globalThis.crypto.randomUUID = Crypto.randomUUID` at app startup, or (b) parameterize
    `@patches/client`'s ID generation so the RN entry point can supply `expo-crypto`'s
    implementation instead of the global. Option (b) keeps `@patches/client` free of an RN-only
    dependency and fits the "transport-agnostic SDK" framing in ADR 0016 §9 better than a global
    polyfill import.
  - `react-native-get-random-values` (npm) is the commonly cited community polyfill for
    `crypto.getRandomValues` specifically (not `randomUUID` directly) — **secondary source, not
    independently verified here**; prefer `expo-crypto` since it's already an official, SDK-aligned
    package and avoids adding an unmanaged native module outside the Expo install flow.

## 4. Testing strategy

**Documented** (`docs.expo.dev/develop/unit-testing/`, fetched 2026-08-20):

- Expo's own docs recommend **Jest with the `jest-expo` preset** as the primary unit-testing setup
  ("a Jest preset that mocks the native part of the Expo SDK"), paired with **React Native Testing
  Library** for component-level tests.
- Expo's docs explicitly warn to move away from `react-test-renderer` ("does not support React 19
  and above" — relevant since SDK 57 bundles React 19.2.3).
- For UI testing, Expo's own recommendation is **end-to-end tests instead of snapshot unit tests**
  for components — i.e. even Expo's official guidance is lukewarm on unit-testing RN component
  trees at all.
- **No mention of Vitest anywhere in Expo's testing docs.** This is a real discrepancy with this
  repo's blanket Vitest convention (`docs/agents/PACKAGE_CONVENTIONS.md`: "Tests: Vitest 4
  `projects`... `vitest.config.ts` with `defineProject`").

**Discrepancy with repo convention — flag for architect / ADR:**

- PACKAGE_CONVENTIONS.md mandates Vitest workspace-wide with a `vitest.config.ts` per package
  feeding root `turbo`-driven `test`. Official Expo guidance is Jest (`jest-expo`) + RNTL, not
  Vitest, and does not document a jsdom/Vitest path for RN component code at all.
- **Recommendation for this task specifically** (not verified against an official "Vitest + RN"
  guide, since none exists in Expo's docs — this is this note's own synthesis, flagged as
  inference): keep `apps/mobile`'s screen components (`.tsx` files using RN primitives like
  `View`/`Text`/`TextInput`) **thin and untested by unit tests**, matching this task's own framing.
  Put all real logic — the Connect transport wiring, `SecureStore`-backed credential store
  (mockable: `expo-secure-store` is a plain async API, trivially mocked with
  `vi.mock('expo-secure-store', ...)`), session-restore/refresh logic, request/response mapping —
  in plain `.ts` modules with **no RN imports**, and unit-test those with Vitest per the repo
  convention. This keeps `apps/mobile` consistent with every other workspace's `test` script
  (Vitest, `defineProject`) without fighting RN's native-module-heavy component layer, at the cost
  of zero automated coverage on the screens themselves (acceptable per Expo's own "prefer E2E for
  UI" stance).
  - This means `apps/mobile` should **not** need `jest-expo` or React Native Testing Library at all
    for this task's scope, since components stay thin/untested — reconsider only if/when the task
    list adds true component-level UI test coverage, at which point Jest+`jest-expo` (not Vitest)
    is the officially-supported path and would need its own ADR-level decision about mixing test
    runners in one monorepo.

## 5. `expo` package version / install method tension

**Documented:**

- npm `latest` dist-tag for `expo` is `57.0.14`; `expo-secure-store` `latest` is `57.0.1` — both on
  the `57.x` train, consistent with Expo SDK versioning where SDK N corresponds to `expo@N.x` and
  compatible native modules are pinned to the same major (checked live via `npm view`, 2026-08-20).
- `docs.expo.dev/workflow/using-libraries/` (fetched 2026-08-20): Expo "recommend[s] always using
  `npx expo install` instead of `npm install` or `yarn add` directly because it allows Expo CLI to
  pick a compatible version of a library when possible and also warn you about known
  incompatibilities." The docs show pnpm explicitly supported: `pnpm expo install <package-name>`.

**Tension with repo convention, flagged (not a contradiction requiring an ADR, but worth noting in
the task/PR):**

- `PACKAGE_CONVENTIONS.md` says "Add with `pnpm add <pkg> --filter @patches/<name>`." For
  `apps/mobile` specifically, prefer **`pnpm --filter @patches/mobile exec expo install <pkg>`**
  (or run `npx expo install <pkg>` from within `apps/mobile/`) over a bare `pnpm add` for any
  Expo-SDK-versioned package (`expo-*` packages, `react-native` itself) — `expo install` checks the
  installed SDK version and selects the matching native-module version, which bare `pnpm add` does
  not do. Plain non-Expo-native TS dependencies (e.g. workspace deps like `@patches/client`) should
  still use ordinary `pnpm add --filter @patches/mobile` per repo convention, since `expo install`
  has no opinion on those.

## 6. Native passkeys (WebAuthn) on Expo/React Native (P10-017)

**Verified:** 2026-08-20 (Apple Developer docs, npm registry live, GitHub source repo for
`react-native-passkeys` and `expo-passkeys`).

**Documented:**

- Apple's native passkey APIs (`ASAuthorizationPlatformPublicKeyCredentialProvider`) require an
  **Associated Domains entitlement** and a hosted `apple-app-site-association` file with a
  `webcredentials` section listing the app's bundle identifier, served over HTTPS with
  `Content-type: application/json`, publicly reachable, not behind a VPN
  (`developer.apple.com/documentation/xcode/supporting-associated-domains`,
  `developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.associated-domains`,
  fetched 2026-08-20).
- `react-native-passkeys` (npm `latest` **0.4.2**, peer deps `expo>=53.0.0`,
  `react-native>=0.71.0` — checked live via `npm view`, so it is nominally SDK-57-compatible) is the
  most credible third-party wrapper found. Its README/GitHub docs state:
  - API surface is two functions, **`create`** (registration) and **`get`** (authentication) —
    mirroring `navigator.credentials.create`/`.get`, with "automatic conversion of base64-url
    encoded strings to buffer."
  - Setup requires **"Prebuild and run your app"** for both iOS and Android, plus
    `expo-build-properties` config-plugin entries (min iOS deployment target 15.0, min Android
    `compileSdkVersion` 34) — i.e. a **custom dev client / EAS build, not Expo Go**.
  - iOS: host AASA at `.well-known/apple-app-site-association`, add
    `"associatedDomains": ["webcredentials:<domain>"]` to `app.json`.
  - Android: host `.well-known/assetlinks.json` with both
    `delegate_permission/common.handle_all_urls` and `delegate_permission/common.get_login_creds`
    relations (Google's Digital Asset Links / Credential Manager pattern).
- `expo-passkeys` (npm `latest` **0.1.11**) explicitly states in its own npm description: **"iOS
  (in development)... this package will currently don't work inside other projects. Please wait for
  complete implementation"** — i.e. self-declared not production-ready for consumers.
- Neither `docs.expo.dev` nor Apple nor Google publish a first-party guide describing the exact
  output JSON shape of these native ceremonies as matching WebAuthn's
  `PublicKeyCredentialCreationOptionsJSON`/`RegistrationResponseJSON`/etc. — no page fetched (Apple
  passkey docs, `react-native-passkeys` README) makes an explicit "this equals
  `@simplewebauthn/server`'s expected JSON" claim.

**Inferred / unverified — flagged:**

- `react-native-passkeys`'s "aims to stay close to the standard `navigator.credentials`" plus
  base64url auto-conversion **suggests** its output is close to WebAuthn JSON shape, and other
  WebAuthn wrapper libraries in the ecosystem generally target that shape by convention — but this
  is inference, not a documented guarantee from Apple, Google, Expo, or the library's own docs. A
  byte-level compatibility check against `@simplewebauthn/server`'s `verifyRegistrationResponse`/
  `verifyAuthenticationResponse` input types was not (and could not be, from docs alone) performed.
  Would require a runtime spike, not a docs read.
- No official Apple/Google doc addresses Expo Go compatibility directly (they don't know Expo
  exists); "Expo Go doesn't support it" is inferred from Expo's own general rule (documented
  elsewhere in this file, §2) that native modules requiring custom entitlements/build config need a
  dev client, combined with `react-native-passkeys`'s "prebuild" instruction — not a direct Expo
  statement about this specific library.

**Discrepancy with spec/training assumptions:**

- None with `INITIAL_VISION.md` directly, but this bears on the existing proto comment: the
  ADR-0011/0022-cited rationale ("Web-client-only — the TUI has no browser relying party") does not
  by itself rule out mobile, since native apps _can_ have a WebAuthn relying party via platform
  authenticator APIs — this note establishes mobile is **technically distinct** from "browser," not
  automatically excluded by that comment's stated reasoning.

**Verdict:** No sound, low-risk v0-viable path today. A native passkey flow is _theoretically_
buildable (Apple and Google both document the platform primitives, and `react-native-passkeys`
0.4.2 is an actively maintained wrapper), but it requires: (a) exiting Expo Go for a custom dev
client/EAS build, (b) hosting and maintaining AASA + `assetlinks.json` at a stable HTTPS origin tied
to the app's real bundle ID/package name (infra Patches doesn't yet have configured for mobile), and
(c) an unverified assumption that the wrapper's JSON output is byte-compatible with
`@simplewebauthn/server` — nothing official confirms that, only inferred from "stays close to the
standard." `expo-passkeys` is explicitly not production-ready per its own description. Recommend the
sibling agent **write a "not viable yet" note / defer passkey login on mobile** rather than build
the button now; if the product still wants this, it needs its own spike task (dev-client build +
AASA hosting + a runtime compatibility check against the real server RPCs) before implementation,
not a research-note-only green light.
