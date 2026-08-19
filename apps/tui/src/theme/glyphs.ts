import type { GlyphSetName } from './themes/types.js';

export type GlyphName =
  | 'selection'
  | 'like'
  | 'reply'
  | 'repost'
  | 'cw'
  | 'unread'
  | 'onlineActive'
  | 'onlineIdle'
  | 'onlineOffline'
  | 'pending';

/**
 * Design vision §3.5: three glyph sets, never required for a control to function — every glyph
 * has a word alongside it or a plain-mode/ascii fallback that means the same thing. Nerd Font
 * glyphs are opt-in only and never auto-detected.
 */
const GLYPH_TABLE: Readonly<Record<GlyphName, Readonly<Record<GlyphSetName, string>>>> = {
  selection: { unicode: '▌', nerd: '▌', ascii: '>' },
  like: { unicode: '♥', nerd: '', ascii: '<3' },
  reply: { unicode: '↳', nerd: '', ascii: '->' },
  repost: { unicode: '⟲', nerd: '', ascii: 'RT' },
  cw: { unicode: '⚠', nerd: '', ascii: 'CW' },
  unread: { unicode: '✉', nerd: '', ascii: '*' },
  onlineActive: { unicode: '●', nerd: '●', ascii: 'ok' },
  onlineIdle: { unicode: '◐', nerd: '◐', ascii: '..' },
  onlineOffline: { unicode: '○', nerd: '○', ascii: 'off' },
  /** An optimistic send/action awaiting a server round-trip (P12-114). */
  pending: { unicode: '◌', nerd: '◌', ascii: '...' },
};

/** Every meaning this table can render, for tests that walk the whole set. */
export const GLYPH_NAMES = Object.keys(GLYPH_TABLE) as readonly GlyphName[];

export function glyph(name: GlyphName, set: GlyphSetName): string {
  return GLYPH_TABLE[name][set];
}

export interface GlyphSetEnvironment {
  /** `PATCHES_GLYPHS=unicode|nerd|ascii` (design vision §3.5). */
  envGlyphSet?: string | undefined;
  /** Persisted preference (`preferences/store.ts`'s `LocalPreferences.glyphSet`). */
  preferredGlyphSet?: GlyphSetName | undefined;
  /** `process.env.LANG`/`LC_ALL` — used only to tell UTF-8 locales from non-UTF-8 ones. */
  locale?: string | undefined;
}

function isGlyphSetName(value: string): value is GlyphSetName {
  return value === 'unicode' || value === 'nerd' || value === 'ascii';
}

function isUtf8Locale(locale: string | undefined): boolean {
  if (locale === undefined || locale === '') return true; // no locale info: assume capable
  return /utf-?8/i.test(locale);
}

/**
 * Precedence: `PATCHES_GLYPHS` env > persisted preference > auto-select. Auto-select falls back
 * to `ascii` only when the environment's locale isn't UTF-8 — Nerd Font is never auto-detected
 * (design vision §3.5: "never required and never auto-detected").
 */
export function resolveGlyphSet(env: GlyphSetEnvironment = {}): GlyphSetName {
  const fromEnv = env.envGlyphSet?.trim();
  if (fromEnv !== undefined && fromEnv !== '' && isGlyphSetName(fromEnv)) return fromEnv;
  if (env.preferredGlyphSet !== undefined) return env.preferredGlyphSet;
  return isUtf8Locale(env.locale) ? 'unicode' : 'ascii';
}
