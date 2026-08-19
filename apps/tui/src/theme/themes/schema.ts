import { z } from 'zod';

import { normalizeHexColor } from '../color.js';
import {
  SEMANTIC_COLOR_TOKENS,
  type AnyThemeDefinition,
  type SemanticColorToken,
} from './types.js';

/**
 * The on-disk shape of a user theme (design vision §4.1):
 * `$XDG_CONFIG_HOME/patches/themes/<name>.json`, validated here before it ever reaches a
 * `<Text color>` prop. `colors` must name every semantic token explicitly — a theme that
 * silently falls back to a hardcoded default for a token it forgot is how a role quietly
 * goes unreadable on some background.
 */
const themeColorSchema = z
  .union([z.literal(null), z.string()])
  .refine(
    (value) => value === null || normalizeHexColor(value) !== null,
    'must be a 6-digit hex colour like "#a855f7", or null for the terminal default',
  );

const colorsShape = Object.fromEntries(
  SEMANTIC_COLOR_TOKENS.map((token) => [token, themeColorSchema]),
) as Record<SemanticColorToken, typeof themeColorSchema>;

export const userThemeSchema = z
  .object({
    name: z.string().trim().min(1, 'name must not be blank'),
    colors: z.object(colorsShape).strict(),
    preferredGlyphSet: z.enum(['unicode', 'nerd', 'ascii']).default('unicode'),
    backgroundMode: z.enum(['paint', 'terminal']).default('paint'),
  })
  .strict();

export type UserThemeInput = z.infer<typeof userThemeSchema>;

export interface ParsedUserTheme {
  ok: true;
  theme: AnyThemeDefinition;
}

export interface InvalidUserTheme {
  ok: false;
  /** Human copy for the toast the caller shows — never a raw zod issue dump. */
  message: string;
}

function firstIssueMessage(error: z.ZodError): string {
  const [issue] = error.issues;
  if (issue === undefined) return 'is not a valid theme';
  const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
  return `${path}${issue.message}`;
}

/**
 * Validates a parsed JSON value against the user theme shape and, on success, normalizes it
 * into the same shape the built-in registry produces so callers never branch on
 * "is this a built-in or a user theme". Never throws — a malformed file is always a `toast +
 * default applied` (P12-101), never a crash.
 */
export function parseUserTheme(
  fileName: string,
  value: unknown,
): ParsedUserTheme | InvalidUserTheme {
  const result = userThemeSchema.safeParse(value);
  if (!result.success) {
    return { ok: false, message: `Theme "${fileName}" ${firstIssueMessage(result.error)}.` };
  }
  const { name, colors, preferredGlyphSet, backgroundMode } = result.data;
  const normalizedColors = Object.fromEntries(
    SEMANTIC_COLOR_TOKENS.map((token) => [
      token,
      colors[token] === null ? null : normalizeHexColor(colors[token]),
    ]),
  ) as AnyThemeDefinition['colors'];
  return {
    ok: true,
    theme: Object.freeze({
      name,
      colors: Object.freeze(normalizedColors),
      preferredGlyphSet,
      backgroundMode,
    }),
  };
}
