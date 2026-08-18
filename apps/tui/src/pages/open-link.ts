import { isTruthyEnv, openerCommand, realSpawn, type SpawnFn } from '../media/open-external.js';

export interface OpenLinkOptions {
  env?: NodeJS.ProcessEnv;
  spawnFn?: SpawnFn;
  platform?: NodeJS.Platform;
}

/**
 * `Enter` on a selected `Links` block entry (P45-004, spec §76's "argument arrays / no
 * shell" convention reused for Page links) — the `href` was already scheme-checked to
 * `http(s)` at write time (`packages/domain`'s `linkHrefSchema`), so this never needs to
 * re-validate, only open it with the OS default handler.
 */
export function openLinkExternally(url: string, options: OpenLinkOptions = {}): void {
  const env = options.env ?? process.env;
  if (isTruthyEnv(env.PATCHES_NO_OPEN)) return;
  const spawnFn = options.spawnFn ?? realSpawn;
  const [command, args] = openerCommand(options.platform ?? process.platform, url);
  spawnFn(command, args);
}
