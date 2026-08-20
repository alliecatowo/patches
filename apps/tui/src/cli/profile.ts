import { present } from '../api/present.js';
import { SessionManager } from '../auth/session.js';
import { createApi, openCredentialStore, reportAuthError } from './auth-shared.js';
import type { CliIo } from './io.js';

const USAGE = `Usage: patches profile edit [options]

Edits the signed-in account's profile (spec §50). Only the fields given are
changed — anything left out keeps its current value (sent via update_mask,
never a blind whole-profile overwrite). The five --name-color/--glyph/
--status-line/--avatar-frame/--profile-border flags edit the account's
nameplate (spec §173) — passing any one of them re-sends the whole nameplate
(unspecified nameplate fields keep their current value, read from the signed-
in session, same "merge before write" behavior as the in-app editor).

Options:
  --display-name <text>          display name shown on posts
  --bio <text>                   short bio
  --location <text>              free-form location text
  --website <url>                http(s) URL shown on the profile
  --name-color <hex[,hex]>       nameplate colour, e.g. "#7C3AED" or a "#a,#b" gradient
  --glyph <glyph>                a single narrow-width glyph beside the handle
  --status-line <text>           short status line shown on the profile
  --avatar-frame <name>          nameplate avatar frame
  --profile-border <name>        nameplate profile border style
  --node, --server <host:port>   node to act against
  -h, --help                     show this message
`;

export interface ProfileDeps {
  io: CliIo;
  env: NodeJS.ProcessEnv;
  target: string;
  insecure: boolean;
}

interface EditFlags {
  displayName?: string;
  bio?: string;
  location?: string;
  website?: string;
  nameColor?: string;
  glyph?: string;
  statusLine?: string;
  avatarFrame?: string;
  profileBorder?: string;
  help: boolean;
}

function parseEditFlags(rest: readonly string[]): EditFlags | { error: string } {
  const flags: EditFlags = { help: false };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    switch (argument) {
      case '-h':
      case '--help':
        flags.help = true;
        break;
      case '--display-name':
      case '--bio':
      case '--location':
      case '--website':
      case '--name-color':
      case '--glyph':
      case '--status-line':
      case '--avatar-frame':
      case '--profile-border': {
        const value = rest[index + 1];
        if (value === undefined) return { error: `${argument} needs a value.` };
        index += 1;
        if (argument === '--display-name') flags.displayName = value;
        else if (argument === '--bio') flags.bio = value;
        else if (argument === '--location') flags.location = value;
        else if (argument === '--website') flags.website = value;
        else if (argument === '--name-color') flags.nameColor = value;
        else if (argument === '--glyph') flags.glyph = value;
        else if (argument === '--status-line') flags.statusLine = value;
        else if (argument === '--avatar-frame') flags.avatarFrame = value;
        else flags.profileBorder = value;
        break;
      }
      default:
        return { error: `Unknown option for profile edit: ${argument}` };
    }
  }
  return flags;
}

/** `patches profile <edit>` (A-027). Only `edit` exists so far — a plain dispatcher,
 * same shape as `keys.ts`'s `add|list|remove`, so a later `profile show` has
 * somewhere obvious to go. */
export async function runProfile(rest: readonly string[], deps: ProfileDeps): Promise<number> {
  const [sub, ...rem] = rest;
  if (sub === '-h' || sub === '--help') {
    deps.io.stdout(USAGE);
    return 0;
  }
  if (sub === undefined) {
    deps.io.stderr(`A subcommand is required.\n\n${USAGE}`);
    return 1;
  }
  if (sub === 'edit') return runProfileEdit(rem, deps);
  deps.io.stderr(`Unknown profile subcommand: ${sub}\n\n${USAGE}`);
  return 1;
}

async function runProfileEdit(rest: readonly string[], deps: ProfileDeps): Promise<number> {
  const { io, env, target, insecure } = deps;
  const parsed = parseEditFlags(rest);
  if ('error' in parsed) {
    io.stderr(`${parsed.error}\n`);
    return 1;
  }
  if (parsed.help) {
    io.stdout(USAGE);
    return 0;
  }

  const updateMask: string[] = [];
  if (parsed.displayName !== undefined) updateMask.push('display_name');
  if (parsed.bio !== undefined) updateMask.push('bio');
  if (parsed.location !== undefined) updateMask.push('location_text');
  if (parsed.website !== undefined) updateMask.push('website_url');
  const nameplateProvided =
    parsed.nameColor !== undefined ||
    parsed.glyph !== undefined ||
    parsed.statusLine !== undefined ||
    parsed.avatarFrame !== undefined ||
    parsed.profileBorder !== undefined;
  if (nameplateProvided) updateMask.push('nameplate');
  if (updateMask.length === 0) {
    io.stderr(
      `Nothing to change — pass at least one of --display-name/--bio/--location/--website/` +
        `--name-color/--glyph/--status-line/--avatar-frame/--profile-border.\n\n${USAGE}`,
    );
    return 1;
  }

  const api = createApi(target, insecure);
  try {
    const store = await openCredentialStore(io, env, rest);
    const manager = new SessionManager({ api, store, nodeOrigin: target });
    const session = await manager.restore();
    if (session === undefined) {
      io.stderr(`Not signed in on ${target}. Run \`patches login\`.\n`);
      return 1;
    }
    // The nameplate is a single submessage on the wire (spec §173) — unspecified
    // nameplate fields must carry their *current* value, read from the signed-in
    // session's actor, or an update to just `--glyph` would silently wipe out an
    // already-set `--name-color` (same "merge, never blind-overwrite" rule
    // `EditProfileScreen` follows).
    const currentNameplate = present(session.actor) ? session.actor.nameplate : undefined;
    const accessToken = await manager.ensureAccessToken();
    const response = await api.updateProfile(
      {
        displayName: parsed.displayName ?? '',
        bio: parsed.bio ?? '',
        locationText: parsed.location ?? '',
        websiteUrl: parsed.website ?? '',
        // google.protobuf.FieldMask is a message ({ paths: string[] }), not a bare array
        // (ADR 0023 — proto-loader decoded it that way; protobuf-es does not).
        updateMask: { paths: updateMask },
        nameplate: nameplateProvided
          ? {
              nameColor: parsed.nameColor ?? currentNameplate?.nameColor ?? '',
              glyph: parsed.glyph ?? currentNameplate?.glyph ?? '',
              badges: [], // server-attested only — ignored on write regardless of what's sent
              avatarFrame: parsed.avatarFrame ?? currentNameplate?.avatarFrame ?? '',
              statusLine: parsed.statusLine ?? currentNameplate?.statusLine ?? '',
              profileBorder: parsed.profileBorder ?? currentNameplate?.profileBorder ?? '',
            }
          : undefined,
        // Flair isn't settable from this CLI yet (no `--flair` flag exists) — always unset.
        flair: undefined,
      },
      accessToken,
    );
    const handle = present(response.actor) ? response.actor.handle : session.actor?.handle;
    const displayName = present(response.actor) ? response.actor.displayName : '';
    io.stdout(`@${handle ?? '?'} · ${displayName}\n`);
    return 0;
  } catch (error) {
    reportAuthError(io, error, target);
    return 1;
  } finally {
    api.close();
  }
}
