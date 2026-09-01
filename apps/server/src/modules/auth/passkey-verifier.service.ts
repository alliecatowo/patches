import { Injectable } from '@nestjs/common';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  type VerifiedAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type WebAuthnCredential,
} from '@simplewebauthn/server';
import {
  decodeClientDataJSON,
  isoBase64URL,
  parseAuthenticatorData,
} from '@simplewebauthn/server/helpers';

/** The subset of a stored `PASSKEY` credential `verifyAuthenticationResponse` needs — plain
 * `string[]` for `transports` rather than the library's `AuthenticatorTransportFuture[]`,
 * since that's exactly what round-trips through `credentials.metadata` (a generic `jsonb`
 * column with no way to persist a closed string-literal union). The cast to the library's own
 * `WebAuthnCredential` below is safe: every value in `transports` was itself written from a
 * previous `AuthenticatorTransportFuture[]` at registration time (`AuthService`'s
 * `completePasskeyRegistration`). */
export interface StoredPasskeyCredential {
  id: string;
  publicKey: Uint8Array;
  counter: number;
  transports?: string[];
}

/**
 * Thin wrapper around `@simplewebauthn/server`'s four ceremony functions (P15-004, ADR 0022;
 * exact signatures verified in `docs/research/simplewebauthn.md`). Exists as its own
 * DI-injected service — rather than `AuthService` calling the library directly — purely so
 * integration tests can stub it: a real WebAuthn ceremony requires a browser-side
 * authenticator, which nothing in this test suite can produce.
 */
@Injectable()
export class PasskeyVerifierService {
  generateRegistrationOptions(input: {
    rpID: string;
    rpName: string;
    userID: Uint8Array;
    userName: string;
    userDisplayName: string;
    excludeCredentials: { id: string }[];
  }): Promise<PublicKeyCredentialCreationOptionsJSON> {
    return generateRegistrationOptions({
      rpID: input.rpID,
      rpName: input.rpName,
      // `input.userID` is a plain, unparameterized `Uint8Array` (its only guaranteed shape from
      // `TextEncoder.encode`); the library's own type alias is `Uint8Array<ArrayBuffer>`
      // specifically. Safe to assert: `TextEncoder.encode` never backs its result with a
      // `SharedArrayBuffer`, which is the only case the two types actually disagree on.
      userID: input.userID as Uint8Array<ArrayBuffer>,
      userName: input.userName,
      userDisplayName: input.userDisplayName,
      attestationType: 'none',
      excludeCredentials: input.excludeCredentials,
      // `residentKey: 'required'` is what makes the credential discoverable — required for the
      // usernameless `BeginPasskeyLogin` ceremony (no `allowCredentials`) to be able to find it.
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    });
  }

  verifyRegistrationResponse(input: {
    response: RegistrationResponseJSON;
    expectedChallenge: string;
    expectedOrigin: string | string[];
    expectedRPID: string;
  }): Promise<VerifiedRegistrationResponse> {
    return verifyRegistrationResponse(input);
  }

  generateAuthenticationOptions(input: {
    rpID: string;
  }): Promise<PublicKeyCredentialRequestOptionsJSON> {
    // No `allowCredentials`: discoverable-credential ("usernameless") login — the credential
    // response itself identifies the account (`BeginPasskeyLoginRequest`'s doc comment).
    return generateAuthenticationOptions({ rpID: input.rpID, userVerification: 'preferred' });
  }

  verifyAuthenticationResponse(input: {
    response: AuthenticationResponseJSON;
    expectedChallenge: string;
    expectedOrigin: string | string[];
    expectedRPID: string;
    credential: StoredPasskeyCredential;
  }): Promise<VerifiedAuthenticationResponse> {
    return verifyAuthenticationResponse({
      ...input,
      credential: input.credential as WebAuthnCredential,
    });
  }

  /** The challenge value embedded in a credential response's `clientDataJSON` — used to look
   * up (and consume) the `webauthn_challenges` row it was issued against; no server-chosen id
   * exists on the wire (see `PasskeyChallengeService`'s doc comment). Uses the library's own
   * decoder rather than a hand-rolled base64url+`JSON.parse`, so this stays correct if the
   * wire encoding details ever change upstream. */
  decodeClientDataChallenge(clientDataJson: string): string {
    return decodeClientDataJSON(clientDataJson).challenge;
  }

  /**
   * The authenticator's own reported use counter, decoded straight from the credential
   * response's raw `authenticatorData` via the library's own parser — independent of (and
   * read *before*) `verifyAuthenticationResponse`, so `AuthService` can make its own
   * sign-count-regression decision (and write a `SECURITY` notification) even though
   * `verifyAuthenticationResponse` also rejects a regressed counter itself, as an
   * undifferentiated verification failure that can't be told apart from e.g. a bad signature
   * by error alone (`docs/research/simplewebauthn.md` §5).
   */
  readAuthenticatorCounter(authenticatorData: string): number {
    return parseAuthenticatorData(isoBase64URL.toBuffer(authenticatorData)).counter;
  }
}
