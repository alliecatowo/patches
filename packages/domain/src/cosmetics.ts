/**
 * Identity cosmetic packs (B-117 / #241).
 *
 * The existing nameplate pipeline gives every actor a server-attested `Nameplate`
 * (`name_color`/`glyph`/`badges`, spec §173) plus the rapid-personalization columns
 * (`profile_frame`, `name_tag_style`, `accent_color`). What has been missing is a single,
 * *shared* place to decide how those inputs become concrete treatment tokens that the web
 * (CSS) and TUI (Ink/terminal) collaters can both consume — otherwise every client rolls its
 * own ad-hoc `frameData()`/`nameTagData()`/inline ternary and the packs drift apart.
 *
 * This module is that shared catalog. It is:
 *
 *  - **Pure and deterministic** — no platform imports (it ships to the browser bundle as well
 *    as Node), no randomness, no locale dependence; the same seed always yields the same art.
 *    `deterministicIdentityArt` is the "deterministic algorithmic identity art" of #241.
 *  - **Accessibility-first** — every treatment function takes an `IdentityCosmeticCaps`
 *    capability descriptor (`plain`, `highContrast`, `reducedMotion`, `colorDepth`) and
 *    returns the degraded, accessible variant when a capability is missing. This is #241's
 *    "degrade to accessible static/plain output, honor reduced-motion/terminal capability".
 *    The TUI's "plain mode" (`PATCHES_PLAIN`/`--plain`/`P`) and the web's
 *    `prefers-reduced-motion` both map onto these caps.
 *  - **Hostile-input safe** — the *motifs* and *tokens* returned are a closed, allow-listed
 *    set of static ASCII/Unicode glyphs and class names, never derived from user text. User
 *    strings (a handle, a display name, `name_color`) are always sanitized *separately* by
 *    the existing `sanitizeText`/`sanitizeForTerminal` — cosmetics never splice user input
 *    into a renderer.
 *  - **Functionally inert** — cosmetics never gate function (§184.3). Nothing here changes
 *    identity resolution, authorization, feed position, or access to any feature.
 *
 * No user code executes anywhere in this module, and nothing here proxies or constructs an
 * upload URL (both hard rules of the issue).
 */

/** Terminal colour depth, in the same degradation order chalk/Ink already use (§173). */
export type CosmeticColorDepth = 'truecolor' | '256' | '16' | 'none';

/**
 * What a client is able (and willing) to render right now. All treatment selectors inspect
 * this and degrade to the plain/static variant on the first `true`/`'none'` that applies.
 *
 *  - `plain`      — the viewer asked for no decoration at all (TUI plain mode; web's
 *                   high-contrast/plain preference). Strips colour, glyphs, frames, pop.
 *  - `highContrast` — the viewer needs stronger figure/ground; glow-on-colour and
 *                   low-saturation treatments are dropped.
 *  - `reducedMotion` — the viewer asked for reduced motion; any animated "pop" is dropped.
 *  - `colorDepth` — terminal capability; `'none'` behaves like `plain`, `'16'`/`'256'`
 *                   keep the frame but drop the glow that depends on exact colour.
 */
export interface IdentityCosmeticCaps {
  readonly plain: boolean;
  readonly highContrast?: boolean;
  readonly reducedMotion: boolean;
  readonly colorDepth: CosmeticColorDepth;
}

/** The default caps a client uses when it has no explicit user preference signal: the full
 * web/truecolour treatment, animations allowed, normal contrast. Production callers almost
 * always supply real caps; this exists so a selector is trivial to invoke in a test. */
export const DEFAULT_COSMETIC_CAPS: IdentityCosmeticCaps = {
  plain: false,
  highContrast: false,
  reducedMotion: false,
  colorDepth: 'truecolor',
};

/**
 * `ProfileFrame` as a plain string union (mirrors `ProfileFrame` in `patches/v1/actors.proto`
 * by value, minus the `PROFILE_FRAME_` prefix), so this `packages/domain` module — which the
 * browser bundle imports and must stay free of a Connect/proto runtime dependency — can reason
 * about a frame without importing the generated enum. Renderers translate the wire enum to
 * these strings at their boundary (see `avatarFrameToken`'s docs).
 */
export type CosmeticsProfileFrame = 'none' | 'border' | 'glow' | 'gradient';

/**
 * A web CSS class token for an avatar frame, one of a fixed, allow-listed set that
 * `apps/web/src/routes/ProfileRoute.module.css` (and any future consumer) declares
 * selectors for. `'none'` means "no frame".
 *
 * Degradation, in order:
 *  1. `plain` (or `colorDepth: 'none'`) → `'none'` — a frame is decoration and is stripped
 *     wholesale from a plain render.
 *  2. `highContrast` → `'border'` — the only frame that adds no ambiguous glow/blend.
 *  3. otherwise → the requested frame verbatim.
 */
export function avatarFrameToken(
  frame: CosmeticsProfileFrame,
  caps: IdentityCosmeticCaps,
): CosmeticsProfileFrame {
  if (caps.plain || caps.colorDepth === 'none') return 'none';
  if (frame === 'none') return 'none';
  if (caps.highContrast === true) return 'border';
  return frame;
}

/**
 * Whether to apply the "restrained pop" emphasis — a subtle, short accent treatment that
 * draws the eye to the actor's identity without turning into a full animation. #241 calls for
 * pop to be *restrained* and to honor reduced motion: at most a gentle one-beat pulse (web)
 * or a single accent underline (terminal), and never anything when the viewer asked for
 * reduced motion or plain output.
 *
 * Returns `true` only when every decoration capability is present.
 */
export function popEmphasis(caps: IdentityCosmeticCaps): boolean {
  if (caps.plain || caps.reducedMotion) return false;
  if (caps.highContrast === true) return false;
  if (caps.colorDepth === 'none') return false;
  return true;
}

/**
 * `NameTagStyle` as a plain string union (mirrors the wire enum by value, minus the
 * `NAME_TAG_STYLE_` prefix) — same rationale as `CosmeticsProfileFrame`, kept enum-free so the
 * browser bundle doesn't pay for a proto runtime just to name a name-tag treatment.
 */
export type CosmeticsNameTag = 'none' | 'badge' | 'ribbon' | 'pilled';

/** A web CSS token for the name-tag treatment on a profile header, from the same closed
 * allow-list `apps/web/src/routes/ProfileRoute.module.css` declares selectors for. Degrades
 * to `'none'` under `plain`/no-colour. */
export function nameTagToken(
  style: CosmeticsNameTag,
  caps: IdentityCosmeticCaps,
): CosmeticsNameTag {
  if (caps.plain || caps.colorDepth === 'none') return 'none';
  if (style === 'none') return 'none';
  return style;
}

/**
 * The closed set of deterministic-identity-art motifs a seed can resolve to. Every entry is a
 * static, allow-listed pair of glyph + anchor direction rendered beside/below an avatar —
 * never derived from user text. One of these is always returned; there is no "empty" state.
 */
export type IdentityArtMotif = '⌁' | '◫' | '∿' | '✦' | '◍' | '⤫';

const MOTIFS: readonly IdentityArtMotif[] = ['⌁', '◫', '∿', '✦', '◍', '⤫'];

/**
 * Deterministic algorithmic identity art: a stable accent pair + a stable motif derived purely
 * from `seed` (an actor's normalized handle), so the same actor renders the same art on every
 * client and every visit. This is `packages/web` `Avatar`'s `hueFor` idea lifted to a *pack*.
 *
 *  - **Deterministic** — FNV-1a over the code points (no locale, no randomness); never reads
 *    system state.
 *  - **Closed-set** — `motif` is one of the allow-listed `IdentityArtMotif` values above, so
 *    it cannot encode hostile input.
 *  - **Hostile-input safe** — `seed` never round-trips into a returned string; it only selects
 *    an index into a fixed table.
 *
 * `accent` is a `#RRGGBB` (mildly lightened toward the hue's brightness so it reads against a
 * coloured avatar tile at the web's default palette). `motif` is drawn beside the tile.
 */
export function deterministicIdentityArt(seed: string): {
  readonly accent: string;
  readonly motif: IdentityArtMotif;
} {
  // Lowercased so the same *identity* always yields the same art regardless of the display
  // casing the caller passed (handle routing is case-insensitive; §22). `.toLowerCase()`
  // is the Unicode default case mapping, so it is locale-independent in JS.
  let hash = 0x811c9dc5;
  for (const char of seed.toLowerCase()) {
    const cp = char.codePointAt(0) ?? 0;
    hash ^= cp;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const hue = hash % 360;
  const motif = MOTIFS[hash % MOTIFS.length] ?? '⌁';
  // A fixed lightening (never user-influenced) so the accent pairs with the avatar tile.
  const saturated = 62;
  const lightness = 64;
  return { accent: hslToHex(hue, saturated, lightness), motif };
}

/** Small HSL → `#RRGGBB` converter; deterministic, locale-independent. */
function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number): number => (n + h / 30) % 12;
  const f = (n: number): number => {
    const a = sn * Math.min(ln, 1 - ln);
    return ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  };
  const toByte = (v: number): string =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toByte(f(0))}${toByte(f(8))}${toByte(f(4))}`;
}
