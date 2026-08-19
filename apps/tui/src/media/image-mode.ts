import type { ImageRenderMode } from '@patches/terminal-media';

import type { ImagePolicy } from '../preferences/store.js';

/** The env var that overrides the image render mode, same vocabulary as
 * `createRenderer`'s `mode` option: `auto`/`kitty`/`pixel`/`ascii`/`box`/`off`. Read
 * once, before Ink's `render()`, the same way `--plain`/`PATCHES_PLAIN` and
 * `--theme`/`PATCHES_THEME` are (see `cli/args.ts`) — this one isn't parsed there
 * because it's a terminal-media concern, not a shell/session one, but it follows the
 * identical "explicit env var, default 'auto'" shape. */
export const IMAGE_MODE_ENV_VAR = 'PATCHES_IMAGES';

const IMAGE_RENDER_MODES: readonly ImageRenderMode[] = [
  'auto',
  'kitty',
  'pixel',
  'ascii',
  'box',
  'off',
];

function isImageRenderMode(value: string): value is ImageRenderMode {
  return (IMAGE_RENDER_MODES as readonly string[]).includes(value);
}

/**
 * `PATCHES_IMAGES` -> `createRenderer`'s `mode` option. Invalid/unset values fall back
 * to `'auto'` rather than throwing — a typo'd env var should degrade to the normal
 * capability-detected behaviour, never crash startup before Ink can even render an
 * error.
 */
export function resolveImageRenderMode(env: NodeJS.ProcessEnv = process.env): ImageRenderMode {
  const raw = env[IMAGE_MODE_ENV_VAR]?.trim();
  return raw !== undefined && isImageRenderMode(raw) ? raw : 'auto';
}

/**
 * The persisted `ImagePolicy` preference and `createRenderer`'s `ImageRenderMode` are
 * intentionally the same five values (`ImagePolicy` just omits `'kitty'` — see its own
 * doc comment) so this is an identity mapping, not a real translation. It exists so
 * whoever wires the preferences store up to `createRenderer` has one obviously-correct
 * call rather than repeating the cast at every call site.
 */
export function imagePolicyToRenderMode(policy: ImagePolicy): ImageRenderMode {
  return policy;
}
