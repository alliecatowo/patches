import { z } from 'zod';

import { AppError } from '../../common/errors/app-error.js';

/**
 * Service-boundary validation for auth inputs (spec §58, §103: limits exist in the protobuf
 * contract, again in the service layer, and again in the database where practical — this is
 * the middle one, and it is the one that is actually enforced).
 *
 * Handle rules are §22: ASCII letters, digits and underscore, 3–30 characters, with a
 * lowercase canonical form. Case is preserved for display and discarded for uniqueness.
 */

export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 30;
export const DISPLAY_NAME_MAX_LENGTH = 80;
export const EMAIL_MAX_LENGTH = 254;
export const CREDENTIAL_LABEL_MAX_LENGTH = 80;

/**
 * Minimum 12 rather than NIST SP 800-63B's floor of 8 — this node's own policy — and a
 * maximum of 256 so an unbounded input can't be used to make Argon2id burn CPU on request.
 * Length is the only composition rule: character-class requirements are counterproductive.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;

const handleSchema = z
  .string()
  .trim()
  .min(HANDLE_MIN_LENGTH, `handle must be at least ${String(HANDLE_MIN_LENGTH)} characters`)
  .max(HANDLE_MAX_LENGTH, `handle must be at most ${String(HANDLE_MAX_LENGTH)} characters`)
  .regex(/^[A-Za-z0-9_]+$/, 'handle may contain only letters, digits and underscores');

const emailSchema = z
  .string()
  .trim()
  .max(EMAIL_MAX_LENGTH, `email must be at most ${String(EMAIL_MAX_LENGTH)} characters`)
  .pipe(z.email('email must be a valid address'));

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `password must be at least ${String(PASSWORD_MIN_LENGTH)} characters`)
  .max(PASSWORD_MAX_LENGTH, `password must be at most ${String(PASSWORD_MAX_LENGTH)} characters`);

const displayNameSchema = z
  .string()
  .trim()
  .max(
    DISPLAY_NAME_MAX_LENGTH,
    `display name must be at most ${String(DISPLAY_NAME_MAX_LENGTH)} characters`,
  );

const labelSchema = z
  .string()
  .trim()
  .max(
    CREDENTIAL_LABEL_MAX_LENGTH,
    `label must be at most ${String(CREDENTIAL_LABEL_MAX_LENGTH)} characters`,
  );

/** An emailed code, an invite code, or a GitHub device code: opaque to us, but bounded so it
 * can't be abusive. */
export const opaqueCodeSchema = z
  .string()
  .trim()
  .min(1, 'code is required')
  .max(200, 'code is too long');

export const registerInputSchema = z.object({
  handle: handleSchema,
  displayName: displayNameSchema,
  email: emailSchema.optional(),
  password: passwordSchema.optional(),
  inviteCode: opaqueCodeSchema.optional(),
  sshPublicKey: z.string().trim().min(1).max(4096).optional(),
  clientRequestId: z.uuid().optional(),
  // §204.2: 0 (proto's default) means "not acknowledged" — a real version starts at 1.
  privacyNoticeVersionAcknowledged: z.number().int().min(0).default(0),
});

export const loginInputSchema = z.object({
  emailOrHandle: z.string().trim().min(1, 'handle or email is required').max(EMAIL_MAX_LENGTH),
  password: z.string().min(1, 'password is required').max(PASSWORD_MAX_LENGTH),
});

/** P15-003: same `emailOrHandle` shape as `loginInputSchema`; `code` is bounded the same way
 * `opaqueCodeSchema` bounds other server-minted single-use codes (a recovery code is minted by
 * `generateRecoveryCode` below at a fixed, much shorter length — the wide ceiling here is just
 * "don't let an unbounded string reach the database", not a real format constraint). */
export const recoveryLoginInputSchema = z.object({
  emailOrHandle: z.string().trim().min(1, 'handle or email is required').max(EMAIL_MAX_LENGTH),
  code: z.string().trim().min(1, 'recovery code is required').max(200),
});

export const codeInputSchema = z.object({ code: opaqueCodeSchema });

export const resetPasswordInputSchema = z.object({
  code: opaqueCodeSchema,
  newPassword: passwordSchema,
});

export const requestPasswordResetInputSchema = z.object({ email: emailSchema });

export const addCredentialInputSchema = z.object({
  secret: z.string().min(1, 'secret is required').max(4096),
  label: labelSchema.optional(),
});

export const refreshTokenInputSchema = z.object({
  refreshToken: z.string().trim().min(1, 'refresh token is required').max(512),
});

export const uuidInputSchema = z.uuid('must be a valid id');

/** A serialized `RegistrationResponseJSON`/`AuthenticationResponseJSON` (P15-004): comfortably
 * bounds even a `'direct'`-attestation payload without constraining the normal `'none'`-
 * attestation case (`docs/research/simplewebauthn.md`) this node actually requests. */
export const webauthnCredentialJsonSchema = z
  .string()
  .trim()
  .min(1, 'credential response is required')
  .max(16_384, 'credential response is too large');

export const completePasskeyRegistrationInputSchema = z.object({
  credentialJson: webauthnCredentialJsonSchema,
  label: labelSchema.optional(),
});

export const completePasskeyLoginInputSchema = z.object({
  credentialJson: webauthnCredentialJsonSchema,
});

/** `null`/empty proto scalars mean "absent"; protobuf has no way to distinguish the two. */
export function optionalText(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export function normalizeHandle(handle: string): string {
  return handle.trim().toLowerCase();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Runs a schema and converts a failure into a client-safe `VALIDATION_ERROR`.
 *
 * Zod's own message is used verbatim because every message above is written to be shown to a
 * user; nothing here echoes the *value* that failed, which is how a validation error leaks a
 * password into a log or an error string.
 */
export function parseInput<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
): z.infer<Schema> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  const details = result.error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path.length === 0 ? issue.message : `${path}: ${issue.message}`;
    })
    .join('; ');
  throw AppError.validation(details.length === 0 ? 'Invalid request.' : details);
}
