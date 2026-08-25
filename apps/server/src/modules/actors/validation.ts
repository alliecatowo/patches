import { z } from 'zod';
import {
  MAX_ACTOR_FLAIR_BYTES,
  PAGE_BORDER_STYLES,
  PAGE_THEME_FIELD_MAX_CHARS,
  sanitizeText,
} from '@patches/domain';

import { AppError } from '../../common/errors/app-error.js';
import { safeUrlSchema } from '../../common/validation/url.js';

/**
 * Service-boundary validation for actor profile inputs (spec §58, §103). Limits mirror
 * `docs/architecture/api.md` §8 and `modules/auth/validation.ts`'s `DISPLAY_NAME_MAX_LENGTH`
 * (kept as a separate constant here rather than imported — a rename of the auth-registration
 * limit should not silently also change the profile-editing limit).
 */

export const DISPLAY_NAME_MAX_LENGTH = 80;
export const BIO_MAX_LENGTH = 500;
export const LOCATION_TEXT_MAX_LENGTH = 100;
export const WEBSITE_URL_MAX_LENGTH = 2048;
export const SEARCH_QUERY_MAX_LENGTH = 100;

/** Serialized-JSON byte budget for `actors.nameplate` (spec §173). */
export const NAMEPLATE_MAX_BYTES = 2048;
const NAME_COLOR_MAX_LENGTH = 32;
const GLYPH_MAX_LENGTH = 8;
const STATUS_LINE_MAX_LENGTH = LOCATION_TEXT_MAX_LENGTH;
const AVATAR_FRAME_MAX_LENGTH = 64;
const PROFILE_BORDER_MAX_LENGTH = 64;

export const displayNameSchema = z
  .string()
  .trim()
  .max(
    DISPLAY_NAME_MAX_LENGTH,
    `display name must be at most ${String(DISPLAY_NAME_MAX_LENGTH)} characters`,
  );

export const bioSchema = z
  .string()
  .trim()
  .max(BIO_MAX_LENGTH, `bio must be at most ${String(BIO_MAX_LENGTH)} characters`);

export const locationTextSchema = z
  .string()
  .trim()
  .max(
    LOCATION_TEXT_MAX_LENGTH,
    `location must be at most ${String(LOCATION_TEXT_MAX_LENGTH)} characters`,
  );

/** §104 URL-scheme allowlist (http(s) only, no embedded credentials), shared with
 * `modules/posts/validation.ts` via `common/validation/url.ts`. An empty string (field
 * cleared) is allowed through separately by the caller, not by this schema. */
export const websiteUrlSchema = safeUrlSchema(WEBSITE_URL_MAX_LENGTH, 'website URL');

export const uuidInputSchema = z.uuid('must be a valid id');

export const searchQuerySchema = z
  .string()
  .trim()
  .min(1, 'query is required')
  .max(
    SEARCH_QUERY_MAX_LENGTH,
    `search query must be at most ${String(SEARCH_QUERY_MAX_LENGTH)} characters`,
  );

/** `ResolveActor` (B-028): `user@domain`, no leading `acct:` (the proto field doc explains
 * why). Matches WebFinger's `acct` grammar loosely — a bare "no `@`, or more than one `@`"
 * shape check, not a full RFC 7565 validator; `RemoteActorService`/the remote WebFinger
 * responder are what actually reject a nonexistent handle. */
export const acctSchema = z
  .string()
  .trim()
  .min(3, 'acct must be in the form user@domain')
  .max(320, 'acct is too long')
  .regex(/^[^@\s]+@[^@\s]+$/, 'acct must be in the form user@domain');

/**
 * Client-writable nameplate fields (spec §173). `badges` is deliberately absent from this
 * schema — it is server-attested only, and `ActorService.updateProfile` never reads a client-
 * supplied value for it (see the caller).
 */
export const nameplateInputSchema = z.object({
  nameColor: z.string().trim().max(NAME_COLOR_MAX_LENGTH).optional(),
  glyph: z.string().trim().max(GLYPH_MAX_LENGTH).optional(),
  avatarFrame: z.string().trim().max(AVATAR_FRAME_MAX_LENGTH).optional(),
  statusLine: z.string().trim().max(STATUS_LINE_MAX_LENGTH).optional(),
  profileBorder: z.string().trim().max(PROFILE_BORDER_MAX_LENGTH).optional(),
});
export type NameplateInput = z.infer<typeof nameplateInputSchema>;

/** Rapid personalization (owner request 2026-08-25). Same 2,048-char budget as
 * `website_url`; http(s)-only comes from `safeUrlSchema` (§104). An empty string (field
 * cleared) is allowed through by the caller, not this schema. */
export const PROFILE_BANNER_URL_MAX_LENGTH = WEBSITE_URL_MAX_LENGTH;
export const profileBannerUrlSchema = safeUrlSchema(
  PROFILE_BANNER_URL_MAX_LENGTH,
  'profile banner URL',
);

/** `#RRGGBB` only — no named colours, no alpha, no gradients (the nameplate's own
 * `name_color` stays the gradient-capable field). */
export const accentColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'accent_color must be a #RRGGBB hex string.');

/** Storable `ProfileFrame` values — the wire enum names without the prefix. UNSPECIFIED is
 * deliberately absent: a caller must pick an explicit value (NONE clears), never "unset"
 * (that's omitting the mask path). */
export const PROFILE_FRAMES = ['NONE', 'BORDER', 'GLOW', 'GRADIENT'] as const;
export type ProfileFrameValue = (typeof PROFILE_FRAMES)[number];
export const profileFrameSchema = z.enum(PROFILE_FRAMES);

/** Storable `NameTagStyle` values, same rules as `PROFILE_FRAMES`. */
export const NAME_TAG_STYLES = ['NONE', 'BADGE', 'RIBBON', 'PILLED'] as const;
export type NameTagStyleValue = (typeof NAME_TAG_STYLES)[number];
export const nameTagStyleSchema = z.enum(NAME_TAG_STYLES);

const UNSAFE_GLYPH = /[\p{Cc}\p{Cf}\p{M}\u200B-\u200F\u202A-\u202E\u2060-\u206F]/u;
const DOUBLE_WIDTH =
  /[\p{Extended_Pictographic}\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe6f\uff00-\uff60\uffe0-\uffe6]/u;
const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;
const NAMED_COLOURS: Readonly<Record<string, string>> = Object.freeze({
  black: '#000000',
  red: '#ff0000',
  green: '#008000',
  yellow: '#ffff00',
  blue: '#0000ff',
  magenta: '#ff00ff',
  cyan: '#00ffff',
  white: '#ffffff',
  gray: '#808080',
  grey: '#808080',
});

/** Conservative terminal width-1 validation: one scalar, with formatting/combining/control,
 * emoji and East-Asian-wide ranges rejected (§184.2, §192). */
export function isWidthOneGlyph(value: string): boolean {
  return Array.from(value).length === 1 && !UNSAFE_GLYPH.test(value) && !DOUBLE_WIDTH.test(value);
}

export function validateLikeGlyph(value: string, allowList: readonly string[]): string {
  if (!isWidthOneGlyph(value) || !allowList.includes(value)) {
    throw AppError.validation(
      "like_glyph must be one width-1 codepoint from this node's allow-list.",
    );
  }
  return value;
}

const safeThemeText = z
  .string()
  .transform((value) => sanitizeText(value, { multiline: false }).trim())
  .pipe(z.string().max(PAGE_THEME_FIELD_MAX_CHARS));

const flairThemeSchema = z
  .object({
    accent: safeThemeText.optional(),
    background: safeThemeText.optional(),
    foreground: safeThemeText.optional(),
    border: z.enum(PAGE_BORDER_STYLES).optional(),
    avatarStyle: safeThemeText.optional(),
  })
  .strict();

const flairShapeSchema = z
  .object({
    post_accent: z.string().max(32).optional(),
    border_style: z.enum(PAGE_BORDER_STYLES).optional(),
    like_glyph: z.string().optional(),
    wall_theme: flairThemeSchema.optional(),
  })
  .strict();

/** Strictly validates and canonicalizes the opaque protobuf JSON string. */
export function parseActorFlairDocument(raw: string, glyphAllowList: readonly string[]): unknown {
  if (Buffer.byteLength(raw, 'utf8') > MAX_ACTOR_FLAIR_BYTES) {
    throw AppError.validation(`flair must be at most ${String(MAX_ACTOR_FLAIR_BYTES)} bytes.`);
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw) as unknown;
  } catch (error) {
    throw AppError.validation('flair document must be valid JSON.', { cause: error });
  }
  const parsed = parseInput(flairShapeSchema, decoded);
  if (parsed.like_glyph !== undefined) validateLikeGlyph(parsed.like_glyph, glyphAllowList);
  if (parsed.post_accent !== undefined) validateContrastColour(parsed.post_accent);
  const canonical = JSON.stringify(parsed);
  if (Buffer.byteLength(canonical, 'utf8') > MAX_ACTOR_FLAIR_BYTES) {
    throw AppError.validation(`flair must be at most ${String(MAX_ACTOR_FLAIR_BYTES)} bytes.`);
  }
  return parsed;
}

function validateContrastColour(raw: string): void {
  const hex = HEX_COLOUR.test(raw) ? raw : NAMED_COLOURS[raw.toLowerCase()];
  if (hex === undefined)
    throw AppError.validation('post_accent must be a named colour or #RRGGBB.');
  const rgb = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = rgb.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  const luminance = 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
  // Against the reference dark terminal canvas (#000). Renderers still degrade colours for
  // their actual palette, but the server rejects accents that are unreadably dark everywhere.
  if ((luminance + 0.05) / 0.05 < 3) {
    throw AppError.validation('post_accent does not meet the minimum contrast ratio.');
  }
}

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
