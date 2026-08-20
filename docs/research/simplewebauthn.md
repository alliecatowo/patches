# SimpleWebAuthn (`@simplewebauthn/server` + `@simplewebauthn/browser`) — Reference

Stack: `@simplewebauthn/server@13.3.2` (Node, target: `apps/server`, NestJS 11, CJS build,
`module: NodeNext`), `@simplewebauthn/browser@13.3.0` (target: `apps/web`, Vite/ESM/React).
Node floor for the library is 20.0.0; this repo runs Node 24, satisfies it.

Verified 2026-08-19 against simplewebauthn.dev docs, the `MasterKale/SimpleWebAuthn` GitHub
source (`master` branch — the published-13.3.x source, not a future/unreleased branch), and
npm registry package metadata for both packages. Full source list at the bottom. This is a
real, actively-versioned API — training-data knowledge of SimpleWebAuthn v7/v8 (positional
args, flat `registrationInfo.credentialID`/`counter`) is **stale**; see §6 for the exact
version each rename landed in.

## 0. Bottom line: CJS compatibility (blocker check for `apps/server`)

**Documented fact — `@simplewebauthn/server@13.3.2` is fully CJS-compatible, not ESM-only.**
Confirmed two ways:

1. **npm registry package.json for the resolved `latest` version** (`registry.npmjs.org/@simplewebauthn/server`, fetched 2026-08-19):
   ```json
   "main": "./script/index.js",
   "module": "./esm/index.js",
   "exports": {
     ".": { "import": "./esm/index.js", "require": "./script/index.js" },
     "./helpers": { "import": "./esm/helpers/index.js", "require": "./script/helpers/index.js" }
   },
   "engines": { "node": ">=20.0.0" }
   ```
   No top-level `"type": "module"` field, `exports["."].require` is present and points at a
   real, separate CJS build (`./script/index.js`), not just an ESM file with a `.js`
   extension. This is a dual-build package with proper conditional exports, exactly what a
   CJS `module: NodeNext` consumer needs — `require('@simplewebauthn/server')` resolves the
   `require` condition to `script/index.js`, not the ESM build.
2. **Fetched `script/index.js` directly from unpkg** (`unpkg.com/@simplewebauthn/server@13.3.2/script/index.js`): it opens with `"use strict"` and TypeScript's standard CJS
   `__exportStar`/`Object.defineProperty(exports, "__esModule", ...)` boilerplate, then
   `require("./registration/genera...")` — genuine compiled CommonJS, not a wrapper that
   throws or a `.cjs`-shimmed ESM re-export. Safe to `require()` under Node 24 CJS/`NodeNext`.

`@simplewebauthn/browser@13.3.0`'s registry metadata shows the same dual-export shape
(`"exports": {".": {"import": "./esm/index.js", "require": "./script/index.js"}}`), plus an
`unpkg`-only UMD bundle for non-bundler use — irrelevant here since `apps/web` is
Vite/ESM and will resolve the `import` condition.

**No CJS blocker. No ADR needed on this axis.** (ADR 0022 already asserts this; this note is
the citation it points at.)

## 1. Package identity

| Package                   | Latest on npm (2026-08-19) | Types                                                                  |
| ------------------------- | -------------------------- | ---------------------------------------------------------------------- |
| `@simplewebauthn/server`  | `13.3.2`                   | bundled, no separate `@simplewebauthn/types` needed as of v13 (see §6) |
| `@simplewebauthn/browser` | `13.3.0`                   | bundled                                                                |

Both installable normally: `pnpm add @simplewebauthn/server --filter server`,
`pnpm add @simplewebauthn/browser --filter web`. `@simplewebauthn/types` is **deprecated as
of v13** — import `RegistrationResponseJSON`/`AuthenticationResponseJSON`/etc. directly from
`@simplewebauthn/server` or `@simplewebauthn/browser`, not from `@simplewebauthn/types`.

## 2. Server API — exact signatures (v13.3.2)

All four verified directly against source on GitHub (`packages/server/src/**`, `master`
branch matching the published 13.3.2 tag) plus cross-checked against
`simplewebauthn.dev/docs/packages/server`.

### `generateRegistrationOptions` — sync in wire terms but declared `async`

```ts
async function generateRegistrationOptions(options: {
  rpName: string;
  rpID: string;
  userName: string;
  userID?: Uint8Array; // NOT a string — see below
  challenge?: string | Uint8Array;
  userDisplayName?: string;
  timeout?: number;
  attestationType?: 'direct' | 'enterprise' | 'none'; // 'indirect' REMOVED in v13
  excludeCredentials?: { id: Base64URLString; transports?: AuthenticatorTransportFuture[] }[];
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  extensions?: AuthenticationExtensionsClientInputs;
  supportedAlgorithmIDs?: COSEAlgorithmIdentifier[];
  preferredAuthenticatorType?: 'securityKey' | 'localDevice' | 'remoteDevice';
}): Promise<PublicKeyCredentialCreationOptionsJSON>;
```

- **`userID` must be `Uint8Array`, not a string.** Source throws explicitly: _"String values
  for `userID` are no longer supported."_ (dated back to the v10 Base64URLString
  standardization, §6). If omitted, the library generates a random one. If Patches wants
  `userID` to be its own `users.id` UUID, encode it to bytes first (e.g.
  `new TextEncoder().encode(userId)` or a UUID→16-byte encoder) — do not pass the UUID string
  directly, it will throw.
- `rpID` is the **hostname only** (no scheme/port) — matches ADR 0022's
  `new URL(PUBLIC_ORIGIN).hostname`.
- Field is **`rpID`** (capital ID), not `rpId`, on both `generate*` functions and both
  `verify*` functions' `expectedRPID`.

### `verifyRegistrationResponse` — async

```ts
async function verifyRegistrationResponse(options: {
  response: RegistrationResponseJSON;
  expectedChallenge: string | ((challenge: string) => boolean | Promise<boolean>);
  expectedOrigin: string | string[];
  expectedRPID?: string | string[];
  expectedType?: string | string[];
  requireUserPresence?: boolean;
  requireUserVerification?: boolean;
  supportedAlgorithmIDs?: COSEAlgorithmIdentifier[];
  attestationSafetyNetEnforceCTSCheck?: boolean;
}): Promise<VerifiedRegistrationResponse>;
```

`VerifiedRegistrationResponse`:

```ts
{ verified: false; registrationInfo?: never }
| {
    verified: true;
    registrationInfo: {
      fmt: AttestationFormat;
      aaguid: string;
      credential: {
        id: Base64URLString;      // credential ID, ALREADY base64url-encoded — do not re-encode
        publicKey: Uint8Array;    // raw COSE public key bytes — caller must encode for storage
        counter: number;          // starting sign count, usually 0
        transports?: string[];
      };
      credentialType: 'public-key';
      attestationObject: Uint8Array;
      userVerified: boolean;
      credentialDeviceType: 'singleDevice' | 'multiDevice';
      credentialBackedUp: boolean;
      origin: string;
      rpID?: string;
      authenticatorExtensionResults?: AuthenticationExtensionsAuthenticatorOutputs;
    };
  }
```

**Credential ID/public key/counter live under `registrationInfo.credential.*`, not flat on
`registrationInfo`.** This nesting is a v11 change (§6) — pre-v11 knowledge
(`registrationInfo.credentialID`, `.credentialPublicKey`, `.counter`) is wrong for 13.3.2.

### `generateAuthenticationOptions` — async

```ts
async function generateAuthenticationOptions(options: {
  rpID: string; // REQUIRED as of v10 (was optional before)
  allowCredentials?: { id: Base64URLString; transports?: AuthenticatorTransportFuture[] }[];
  challenge?: string | Uint8Array;
  timeout?: number;
  userVerification?: 'required' | 'preferred' | 'discouraged'; // default 'preferred'
  extensions?: AuthenticationExtensionsClientInputs;
}): Promise<PublicKeyCredentialRequestOptionsJSON>;
```

### `verifyAuthenticationResponse` — async

```ts
async function verifyAuthenticationResponse(options: {
  response: AuthenticationResponseJSON;
  expectedChallenge: string | ((challenge: string) => boolean | Promise<boolean>);
  expectedOrigin: string | string[];
  expectedRPID: string | string[]; // required here (not optional like registration's)
  credential: WebAuthnCredential; // the STORED credential — see below
  expectedType?: string | string[];
  requireUserVerification?: boolean;
  advancedFIDOConfig?: { userVerification?: UserVerificationRequirement };
}): Promise<VerifiedAuthenticationResponse>;
```

The `credential` argument is **caller-supplied**, reconstructed from what was persisted at
registration: `{ id: Base64URLString; publicKey: Uint8Array; counter: number; transports?: string[] }`
(the type is literally the same `WebAuthnCredential` shape that `registrationInfo.credential`
returned — renamed from `AuthenticatorDevice` in v11, §6). This is how the library looks up
"what to verify against" — there is no server-side credential store inside the library; the
caller passes the row it looked up from Postgres, decoded back to `Uint8Array` for
`publicKey`.

`VerifiedAuthenticationResponse`:

```ts
{
  verified: boolean;
  authenticationInfo: {
    credentialID: Base64URLString;
    newCounter: number;              // <-- the field to persist, see §5
    userVerified: boolean;
    credentialDeviceType: 'singleDevice' | 'multiDevice';
    credentialBackedUp: boolean;
    origin: string;
    rpID: string;
    authenticatorExtensionResults?: AuthenticationExtensionsAuthenticatorOutputs;
  };
}
```

Note the asymmetry: registration's result nests under `registrationInfo.credential.counter`;
authentication's result is flat, `authenticationInfo.newCounter` (different key name too —
`counter` at registration, `newCounter` at authentication). Both verified directly from
source — this isn't a doc-generation inconsistency, it's the real shape.

## 3. `rpID` / `rpName` / `origin` / `userID` — how they're supplied

| Field                                                   | Where                                                          | Type                           | Notes                                                                                                                                    |
| ------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `rpID`                                                  | `generateRegistrationOptions`, `generateAuthenticationOptions` | `string`                       | hostname only, e.g. `"patches.social"`                                                                                                   |
| `rpName`                                                | `generateRegistrationOptions` only                             | `string`                       | human-readable, shown in some platform UI                                                                                                |
| `expectedOrigin`                                        | `verifyRegistrationResponse`, `verifyAuthenticationResponse`   | `string \| string[]`           | full origin incl. scheme, e.g. `"https://patches.social"` — matches ADR 0022's `PUBLIC_ORIGIN`                                           |
| `expectedRPID` (registration) / `rpID` (authentication) | `verify*`                                                      | `string \| string[]`           | **optional** on `verifyRegistrationResponse`, **required** on `verifyAuthenticationResponse` — asymmetry confirmed in source, not a typo |
| `userID`                                                | `generateRegistrationOptions` only                             | `Uint8Array`, **not `string`** | throws if given a string; omit to get a random one generated for you                                                                     |

## 4. Browser API (`@simplewebauthn/browser@13.3.0`)

```ts
async function startRegistration(options: {
  optionsJSON: PublicKeyCredentialCreationOptionsJSON; // the server's generateRegistrationOptions() output, as-is
  useAutoRegister?: boolean;
}): Promise<RegistrationResponseJSON>;

async function startAuthentication(options: {
  optionsJSON: PublicKeyCredentialRequestOptionsJSON; // the server's generateAuthenticationOptions() output, as-is
  useBrowserAutofill?: boolean;
  verifyBrowserAutofillInput?: boolean;
}): Promise<AuthenticationResponseJSON>;
```

**Both take a wrapper object with `optionsJSON`, not the raw options object directly.** This
is a **v11 breaking change** (§6): pre-v11 code called `startRegistration(options)`
positionally. Passing the raw options object as the whole argument in 13.x is a type error at
minimum, and functionally wrong.

`RegistrationResponseJSON` (the client payload the browser produces, POSTed back to the
server for `verifyRegistrationResponse`) fields, confirmed from source:

```ts
{
  id: string;               // base64url credential ID
  rawId: string;             // base64url, same content as id in the JSON form
  response: {
    attestationObject: string;   // base64url
    clientDataJSON: string;      // base64url
    transports?: AuthenticatorTransportFuture[];
    publicKeyAlgorithm?: number;
    publicKey?: string;          // base64url
    authenticatorData?: string;  // base64url
  };
  type: 'public-key';
  clientExtensionResults: AuthenticationExtensionsClientOutputs;
  authenticatorAttachment?: AuthenticatorAttachment;
}
```

`AuthenticationResponseJSON` (from `startAuthentication`, POSTed for
`verifyAuthenticationResponse`) has the analogous shape with `response.authenticatorData`,
`response.signature`, `response.userHandle` in place of the attestation fields — not
re-quoted in full here since it wasn't independently re-verified field-by-field this pass;
treat as **inferred** from the `simplewebauthn.dev` docs page structure until read from
source if it becomes load-bearing.

Everything in `optionsJSON` on both calls is exactly what the corresponding server
`generate*Options` function returned, serialized as JSON over the wire (protobuf/JSON string
field, or a plain JSON body depending on how `apps/web` calls the server) — no client-side
reshaping needed.

## 5. Sign-count regression / clone detection — official guidance

Persist **`verification.authenticationInfo.newCounter`** after every successful
`verifyAuthenticationResponse` call, replacing the credential's stored counter.

Quoted from `simplewebauthn.dev/docs/packages/server` (fetched 2026-08-19), the library's own
stated rationale — paraphrased close to source, exact claims marked:

> "@simplewebauthn/server knows how to properly check the signature counter on subsequent
> authentications" — the library does **not** reject on a regressed counter itself; it
> surfaces `newCounter` and leaves the accept/reject decision to the caller.
>
> "the counter on subsequent authentications should only ever increment; if your stored
> counter is greater than zero, and a subsequent authentication response's counter is the
> same or lower, then perhaps the authenticator just used to authenticate is in a compromised
> state" — i.e. **clone-detection signal is: `storedCounter > 0 && newCounter <= storedCounter`.**
>
> "certain high profile authenticators, like Touch ID on macOS, [are known] to always return
> `0` (zero) for the signature counter. In this case there is nothing an RP can really do to
> detect a cloned authenticator" — **a `newCounter` of `0` is not itself suspicious**; it is
> the documented behavior of many platform/synced authenticators (matches ADR 0022's own
> "many platform authenticators report 0 unconditionally" reasoning — that reasoning is
> library-sanctioned, not a Patches-invented exception).

So the condition to treat as a security event is exactly: `storedCounter > 0 && newCounter <=
storedCounter`. A `newCounter` of `0` when `storedCounter` is also `0` (never incremented,
platform authenticator) is normal and must not be flagged.

## 6. Encoding — what the library gives you vs. what you must do yourself

- **Credential ID**: already `Base64URLString` (a plain string) everywhere it appears —
  `registrationInfo.credential.id`, `authenticationInfo.credentialID`, and the `id`/`rawId`
  fields of the browser's JSON payloads. No manual encoding needed to store it as text.
- **Public key**: `registrationInfo.credential.publicKey` is a **raw `Uint8Array`** (the COSE
  key bytes) — the library does **not** base64-encode it for you. Caller must encode for a
  `text` column and decode back to `Uint8Array` before passing it into
  `verifyAuthenticationResponse`'s `credential.publicKey`.
- **Provided encoding helper**: `@simplewebauthn/server/helpers` exports `isoBase64URL`
  (confirmed from `packages/server/src/helpers/iso/index.ts` and
  `.../iso/isoBase64URL.ts` source), with methods `fromBuffer(bytes) → base64url string`,
  `toBuffer(base64urlString) → Uint8Array`, and `toBase64(base64urlString) → standard-base64
string` (converts base64url to base64 padding/alphabet, does not take raw bytes). There is
  no single "`Uint8Array` → standard base64" method — compose `isoBase64URL.toBase64(isoBase64URL.fromBuffer(bytes))`,
  or just use Node's own `Buffer.from(bytes).toString('base64')` since `apps/server` already
  runs Node and a `Uint8Array` is a valid `Buffer.from` input — **inferred**, not
  library-provided, but Node's `Buffer` API is a safe, standard substitute the library itself
  doesn't need to duplicate.
  - **Inferred, for ADR 0022's schema**: `credentials.identifier` (the WebAuthn credential
    ID) can store `registrationInfo.credential.id` verbatim, no conversion. `credentials
.publicMaterial` (ADR 0022: "COSE public key, base64-encoded", matching the existing
    convention of standard base64 rather than base64url for this column) needs
    `Buffer.from(registrationInfo.credential.publicKey).toString('base64')` on write, and
    `new Uint8Array(Buffer.from(storedPublicMaterial, 'base64'))` on read, to reconstruct the
    `credential.publicKey: Uint8Array` verifyAuthenticationResponse expects. This mapping was
    not found written out anywhere in official docs — it's this note's own inference from the
    documented types, flagged as such.

## 7. Version history — breaking changes across majors (why stale training data is wrong)

Verified from `github.com/MasterKale/SimpleWebAuthn/blob/master/CHANGELOG.md`
(fetched 2026-08-19). Only the changes relevant to the API surface Patches will call:

- **v9.0.0**: `@simplewebauthn/typescript-types` package renamed to `@simplewebauthn/types`.
- **v10.0.0**: Node 20+ required. Credential IDs standardized to `Base64URLString` everywhere
  (previously mixed raw-buffer/base64url usage across the API). `userID` in
  `generateRegistrationOptions` restricted to `Uint8Array` (string no longer accepted).
  `generateAuthenticationOptions`'s `rpID` became **required** (previously optional). Several
  `isoBase64URL` helper methods renamed (`isBase64url` → `isBase64URL`, `toString` →
  `toUTF8String`, `fromString` → `fromUTF8String`) — irrelevant to the four main verify/
  generate calls but relevant if Patches ever imports `helpers` directly.
- **v11.0.0**: **`startRegistration`/`startAuthentication` (browser) moved from positional
  args to `{ optionsJSON, ...otherOpts }`.** **`AuthenticatorDevice` type renamed to
  `WebAuthnCredential`**; `verifyRegistrationResponse`'s result nested the previously-flat
  `credentialID`/`credentialPublicKey`/`counter` under `registrationInfo.credential.{id,
publicKey, counter}`; `verifyAuthenticationResponse`'s input parameter renamed from
  `authenticator` to `credential`.
- **v13.0.0**: `@simplewebauthn/types` package retired — import types directly from
  `@simplewebauthn/server`/`@simplewebauthn/browser`. `attestationType: 'indirect'` removed
  from `generateRegistrationOptions` (use `'none'` or `'direct'`).

**Anything in training data describing flat `registrationInfo.credentialID`, a
`startRegistration(options)` positional call, or an `@simplewebauthn/types` import is
pre-v11/pre-v13 and wrong for 13.3.2.** The signatures in §2 and §4 above are what to actually
write against.

## Sources

- [SimpleWebAuthn server docs](https://simplewebauthn.dev/docs/packages/server) — §0, §2, §3, §5
- [SimpleWebAuthn browser docs](https://simplewebauthn.dev/docs/packages/browser) — §4
- npm registry package metadata, `registry.npmjs.org/@simplewebauthn/server` and
  `.../@simplewebauthn/browser`, `dist-tags.latest` = `13.3.2` / `13.3.0` respectively,
  `exports`/`main`/`module`/`engines` fields read directly — §0, §1
- [`script/index.js` via unpkg, `@simplewebauthn/server@13.3.2`](https://unpkg.com/@simplewebauthn/server@13.3.2/script/index.js) — §0 (confirmed real CJS output, not a stub)
- [`generateRegistrationOptions.ts` source](https://github.com/MasterKale/SimpleWebAuthn/blob/master/packages/server/src/registration/generateRegistrationOptions.ts) — §2, §3
- [`verifyRegistrationResponse.ts` source](https://github.com/MasterKale/SimpleWebAuthn/blob/master/packages/server/src/registration/verifyRegistrationResponse.ts) — §2
- [`generateAuthenticationOptions.ts` source](https://github.com/MasterKale/SimpleWebAuthn/blob/master/packages/server/src/authentication/generateAuthenticationOptions.ts) — §2, §3
- [`verifyAuthenticationResponse.ts` source](https://github.com/MasterKale/SimpleWebAuthn/blob/master/packages/server/src/authentication/verifyAuthenticationResponse.ts) — §2, §3
- [`startRegistration.ts` source](https://github.com/MasterKale/SimpleWebAuthn/blob/master/packages/browser/src/methods/startRegistration.ts) — §4
- [`helpers/index.ts` source](https://github.com/MasterKale/SimpleWebAuthn/blob/master/packages/server/src/helpers/index.ts) — §6
- [`helpers/iso/index.ts` source](https://github.com/MasterKale/SimpleWebAuthn/blob/master/packages/server/src/helpers/iso/index.ts) — §6
- [`helpers/iso/isoBase64URL.ts` source](https://github.com/MasterKale/SimpleWebAuthn/blob/master/packages/server/src/helpers/iso/isoBase64URL.ts) — §6
- [Repo `CHANGELOG.md`](https://github.com/MasterKale/SimpleWebAuthn/blob/master/CHANGELOG.md) — §7
- [Repo `packages/server/README.md`](https://github.com/MasterKale/SimpleWebAuthn/blob/master/packages/server/README.md) — §0, §1 (Node floor, install)
