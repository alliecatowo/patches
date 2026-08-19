import {
  hasUnsafeLeadingDash,
  isTruthyEnv,
  openerCommand,
  realSpawn,
  type SpawnFn,
} from '../media/open-external.js';

export interface OpenLinkOptions {
  env?: NodeJS.ProcessEnv;
  spawnFn?: SpawnFn;
  platform?: NodeJS.Platform;
}

/** Longest `href` `openLinkExternally` will hand to an OS opener — a limit for its own
 * sake, not because anything longer is dangerous (A-045). */
const MAX_URL_LENGTH = 2048;

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * `Enter` on a selected `Links` block entry (P45-004, spec §76's "argument arrays / no
 * shell" convention reused for Page links) — the `href` is written by whatever node the
 * TUI is currently connected to, not necessarily the same one that validated it against
 * `packages/domain`'s `linkHrefSchema` at write time. A hostile or compromised node, a row
 * written before that schema existed, or a future federated page could return `file:///…`,
 * a registered custom scheme, or a string starting with `-` that an opener parses as a
 * flag (A-045) — so this re-validates independently before ever spawning anything.
 *
 * Returns `false` (without spawning) when `url` is rejected, `true` when it was handed to
 * the opener (including when `PATCHES_NO_OPEN` skips the actual spawn) — callers may
 * surface a "link blocked" notice on `false`, or ignore it.
 */
export function openLinkExternally(url: string, options: OpenLinkOptions = {}): boolean {
  if (!isSafeExternalUrl(url)) return false;

  const env = options.env ?? process.env;
  if (isTruthyEnv(env.PATCHES_NO_OPEN)) return true;
  const spawnFn = options.spawnFn ?? realSpawn;
  const [command, args] = openerCommand(options.platform ?? process.platform, url);
  spawnFn(command, args);
  return true;
}

function isSafeExternalUrl(url: string): boolean {
  if (url.length > MAX_URL_LENGTH) return false;
  if (hasUnsafeLeadingDash(url)) return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Not a well-formed absolute URL at all (e.g. `-flag`, a bare relative path) — nothing
    // safe to open.
    return false;
  }
  return ALLOWED_PROTOCOLS.has(parsed.protocol);
}
