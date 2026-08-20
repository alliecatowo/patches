import type { Actor } from '../api/wire/types.js';
import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import { present } from '../api/present.js';
import type { PatchesApi } from '../api/client.js';
import { describeGrpcError, type FriendlyError } from '../api/errors.js';
import { Nameplate } from '../components/Nameplate.js';
import { ColorPicker } from '../components/pickers/ColorPicker.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { normalizeHexColor, resolveTerminalColor, type TerminalColorTier } from '../theme/color.js';
import { usePlainMode } from '../theme/plain-mode.js';
import { theme } from '../theme/index.js';

/** Best-effort truecolor → 256 → 16 → text detection from the environment
 * `ColorPicker` itself never probes (its own docstring: "the caller detects
 * capabilities"). A real per-terminal probe (P12-101/P12-127, owned elsewhere) will
 * eventually replace this; until then this mirrors the common Node convention
 * (`COLORTERM=truecolor`, `TERM=*-256color`) that most terminal emulators set. */
function detectColorTier(): TerminalColorTier {
  const colorterm = process.env.COLORTERM?.toLowerCase();
  if (colorterm === 'truecolor' || colorterm === '24bit') return 'truecolor';
  const term = process.env.TERM ?? '';
  if (/-256color$/.test(term)) return 'ansi256';
  if (term !== '' && term !== 'dumb') return 'ansi16';
  return 'text';
}

/** The nameplate colour is rendered as foreground text over whatever background the
 * viewer's terminal has — unknown to this process, so the contrast floor is checked
 * against a fixed dark reference rather than the (unavailable) real background. A
 * pick that's readable against black is readable against most terminal themes. */
const NAME_COLOR_CONTRAST_REFERENCE = '#000000';

/** Mirrors `apps/server/src/modules/actors/validation.ts` — a client-side limit only
 * needs to match, never enforce independently of, the server's actual validation, so
 * these are kept in sync by hand rather than imported (the TUI never depends on
 * `apps/server`). */
export const DISPLAY_NAME_MAX_LENGTH = 80;
export const BIO_MAX_LENGTH = 500;
export const LOCATION_TEXT_MAX_LENGTH = 100;
export const WEBSITE_URL_MAX_LENGTH = 2048;

/** Mirrors `nameplateInputSchema`'s per-field limits (spec §173, A-037). */
export const NAME_COLOR_MAX_LENGTH = 32;
export const GLYPH_MAX_LENGTH = 8;
export const STATUS_LINE_MAX_LENGTH = LOCATION_TEXT_MAX_LENGTH;
export const AVATAR_FRAME_MAX_LENGTH = 64;
export const PROFILE_BORDER_MAX_LENGTH = 64;

type ProfileFieldKey = 'displayName' | 'bio' | 'location' | 'website';
/** The nameplate is one submessage on the wire (a single `"nameplate"` mask path, spec
 * §173's `UpdateProfileRequest`) even though it's edited as five separate fields here —
 * kept as its own union so `submit()` can tell "which top-level mask path" from "which
 * nameplate sub-field" apart without a runtime lookup table. */
type NameplateFieldKey = 'nameColor' | 'glyph' | 'statusLine' | 'avatarFrame' | 'profileBorder';
type FieldKey = ProfileFieldKey | NameplateFieldKey;

const PROFILE_FIELD_ORDER: readonly ProfileFieldKey[] = [
  'displayName',
  'bio',
  'location',
  'website',
];
const NAMEPLATE_FIELD_ORDER: readonly NameplateFieldKey[] = [
  'nameColor',
  'glyph',
  'statusLine',
  'avatarFrame',
  'profileBorder',
];
const FIELD_ORDER: readonly FieldKey[] = [...PROFILE_FIELD_ORDER, ...NAMEPLATE_FIELD_ORDER];

const FIELD_LABELS: Record<FieldKey, string> = {
  displayName: 'Display name',
  bio: 'Bio',
  location: 'Location',
  website: 'Website',
  nameColor: 'Name colour',
  glyph: 'Glyph',
  statusLine: 'Status line',
  avatarFrame: 'Avatar frame',
  profileBorder: 'Profile border',
};

const FIELD_LIMITS: Record<FieldKey, number> = {
  displayName: DISPLAY_NAME_MAX_LENGTH,
  bio: BIO_MAX_LENGTH,
  location: LOCATION_TEXT_MAX_LENGTH,
  website: WEBSITE_URL_MAX_LENGTH,
  nameColor: NAME_COLOR_MAX_LENGTH,
  glyph: GLYPH_MAX_LENGTH,
  statusLine: STATUS_LINE_MAX_LENGTH,
  avatarFrame: AVATAR_FRAME_MAX_LENGTH,
  profileBorder: PROFILE_BORDER_MAX_LENGTH,
};

/** The `UpdateProfileRequest.updateMask` path for each top-level profile field (spec:
 * `actors.proto`) — the five nameplate fields have no path of their own; they all share
 * the single `"nameplate"` path added in `submit()` when any of them changed. */
const FIELD_MASK_PATHS: Record<ProfileFieldKey, string> = {
  displayName: 'display_name',
  bio: 'bio',
  location: 'location_text',
  website: 'website_url',
};

function fieldsFromActor(actor: Actor): Record<FieldKey, string> {
  const nameplate = present(actor.nameplate) ? actor.nameplate : undefined;
  return {
    displayName: actor.displayName,
    bio: actor.bio,
    location: actor.locationText,
    website: actor.websiteUrl,
    nameColor: nameplate?.nameColor ?? '',
    glyph: nameplate?.glyph ?? '',
    statusLine: nameplate?.statusLine ?? '',
    avatarFrame: nameplate?.avatarFrame ?? '',
    profileBorder: nameplate?.profileBorder ?? '',
  };
}

export interface EditProfileScreenProps {
  api: PatchesApi;
  /** The viewer's own, already-loaded actor — this screen never fetches on its own. */
  actor: Actor;
  ensureAccessToken: () => Promise<string>;
  isActive: boolean;
  /** `Esc` — discards every edit, back to the profile. */
  onCancel: () => void;
  /** `Ctrl+S` succeeded (or there was nothing to save) — the caller refreshes the
   * profile/session actor with the authoritative value the server returned. */
  onSaved: (actor: Actor) => void;
}

type SaveState =
  { status: 'idle' } | { status: 'saving' } | { status: 'error'; error: FriendlyError };

/**
 * `e` on the viewer's own `ProfileScreen` (A-027): display name, bio (multi-line —
 * `Enter` inserts a newline only in this field), location, and website, plus a
 * "Nameplate" section (A-037, spec §173) — name colour, glyph, status line, avatar
 * frame, and profile border, each edited in place with a live `Nameplate` preview.
 * `Tab`/`↓` moves to the next field, `Shift+Tab`/`↑` to the previous; `Ctrl+S` sends
 * only what actually changed via `UpdateProfile`'s `update_mask` (spec §50) — never
 * the whole profile, so a field left untouched can never regress from a stale value.
 * The five nameplate fields share one `"nameplate"` mask path (it's a single
 * submessage on the wire), so editing any one of them sends the *current* value of
 * all five, not just the one that changed. `Esc` discards every edit and leaves.
 */
export function EditProfileScreen({
  api,
  actor,
  ensureAccessToken,
  isActive,
  onCancel,
  onSaved,
}: EditProfileScreenProps): ReactElement {
  const [initial] = useState(() => fieldsFromActor(actor));
  const [fields, setFields] = useState(initial);
  const [focus, setFocus] = useState(0);
  const [save, setSave] = useState<SaveState>({ status: 'idle' });
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const plain = usePlainMode();
  const colorTier: TerminalColorTier = plain ? 'text' : detectColorTier();

  const focusedKey = FIELD_ORDER[focus] ?? 'displayName';

  function moveFocus(delta: number): void {
    setFocus((current) => (current + delta + FIELD_ORDER.length) % FIELD_ORDER.length);
  }

  /** Always derives the next value from the setter's own `current` (never the
   * outer closure's `fields`) — several keystrokes fired in the same tick (e.g. a
   * fast backspace-then-type sequence) must each build on the previous one's
   * result, not all read the same stale render's value. */
  function updateField(key: FieldKey, next: (current: string) => string): void {
    setFields((current) => ({ ...current, [key]: next(current[key]) }));
  }

  async function submit(): Promise<void> {
    const updateMask = PROFILE_FIELD_ORDER.filter((key) => fields[key] !== initial[key]).map(
      (key) => FIELD_MASK_PATHS[key],
    );
    const nameplateChanged = NAMEPLATE_FIELD_ORDER.some((key) => fields[key] !== initial[key]);
    if (nameplateChanged) updateMask.push('nameplate');
    if (updateMask.length === 0) {
      // Nothing actually changed — no point in a round trip.
      onSaved(actor);
      return;
    }
    setSave({ status: 'saving' });
    try {
      const accessToken = await ensureAccessToken();
      const response = await api.updateProfile(
        {
          displayName: fields.displayName,
          bio: fields.bio,
          locationText: fields.location,
          websiteUrl: fields.website,
          // google.protobuf.FieldMask is a message ({ paths: string[] }), not a bare array
          // (ADR 0023 — proto-loader decoded it that way; protobuf-es does not).
          updateMask: { paths: updateMask },
          nameplate: nameplateChanged
            ? {
                nameColor: fields.nameColor,
                glyph: fields.glyph,
                badges: [], // server-attested only — ignored on write regardless of what's sent
                avatarFrame: fields.avatarFrame,
                statusLine: fields.statusLine,
                profileBorder: fields.profileBorder,
              }
            : undefined,
          // No flair editor yet (Amendment B, P11-00x follow-up) — always unset.
          flair: undefined,
        },
        accessToken,
      );
      setSave({ status: 'idle' });
      onSaved(response.actor ?? actor);
    } catch (error) {
      setSave({ status: 'error', error: describeGrpcError(error, api.target) });
    }
  }

  useInput(
    (input, key) => {
      if (save.status === 'saving') return;
      if (key.escape) {
        onCancel();
        return;
      }
      if (key.ctrl && input === 's') {
        void submit();
        return;
      }
      if (key.tab && key.shift) {
        moveFocus(-1);
        return;
      }
      if (key.tab || key.downArrow) {
        moveFocus(1);
        return;
      }
      if (key.upArrow) {
        moveFocus(-1);
        return;
      }
      if (key.return) {
        // The name colour field is picker-only (below) — Enter opens the picker
        // rather than inserting anything. Only the bio field is multi-line — every
        // other field is a no-op rather than inserting a newline it would never
        // display sensibly.
        if (focusedKey === 'nameColor') setColorPickerOpen(true);
        else if (focusedKey === 'bio') updateField('bio', (value) => `${value}\n`);
        return;
      }
      if (focusedKey === 'nameColor') return; // edited only through the picker
      if (key.backspace || key.delete) {
        updateField(focusedKey, (value) => value.slice(0, -1));
        return;
      }
      if (key.ctrl || key.meta) return;
      if (input.length > 0) {
        const limit = FIELD_LIMITS[focusedKey];
        updateField(focusedKey, (value) => (value.length < limit ? value + input : value));
      }
    },
    // The picker owns every key while it is open — the field-editing handler above
    // must not also react to the same keystroke (e.g. its own Escape would cancel
    // the whole screen instead of just closing the picker).
    { isActive: isActive && !colorPickerOpen },
  );

  function nameColorRow(): ReactElement {
    const focused = focusedKey === 'nameColor';
    const resolved = resolveTerminalColor(
      normalizeHexColor(fields.nameColor) ?? NAME_COLOR_CONTRAST_REFERENCE,
      colorTier,
    );
    return (
      <Box key="nameColor" flexDirection="column" marginBottom={1}>
        <Text color={focused ? theme.accent : theme.muted} bold={focused}>
          {FIELD_LABELS.nameColor}
        </Text>
        <Text>
          {plain ? null : (
            <Text {...(resolved.inkColor === null ? {} : { color: resolved.inkColor })}>██ </Text>
          )}
          {fields.nameColor === '' ? '(none)' : sanitizeForTerminal(fields.nameColor)}
          {focused ? <Text color={theme.muted}> — Enter to change</Text> : null}
        </Text>
      </Box>
    );
  }

  function fieldRow(key: ProfileFieldKey | Exclude<NameplateFieldKey, 'nameColor'>): ReactElement {
    return (
      <Box key={key} flexDirection="column" marginBottom={1}>
        <Text color={focusedKey === key ? theme.accent : theme.muted} bold={focusedKey === key}>
          {FIELD_LABELS[key]} ({fields[key].length}/{FIELD_LIMITS[key]})
        </Text>
        <Text wrap="wrap">
          {sanitizeForTerminal(fields[key])}
          {focusedKey === key ? <Text color={theme.accent}>█</Text> : null}
        </Text>
      </Box>
    );
  }

  if (colorPickerOpen) {
    // The picker (12 fixed rows, `COLOR_PICKER_ROWS`) replaces the whole field list
    // rather than appending below it — this screen has no internal scrolling of its
    // own (that's P12-004's `VirtualList`, not this task), so stacking a 12-row
    // picker under nine already-rendered fields can push it past the shell's
    // fixed-height clipped content frame on an ordinary terminal (§2.2).
    return (
      <Box flexDirection="column">
        <Text color={theme.accent}>Edit profile — name colour</Text>
        <Box marginTop={1} flexDirection="column" flexShrink={0}>
          <ColorPicker
            initialColor={normalizeHexColor(fields.nameColor) ?? NAME_COLOR_CONTRAST_REFERENCE}
            comparisonColor={NAME_COLOR_CONTRAST_REFERENCE}
            role="foreground"
            capabilityTier={colorTier}
            isActive={isActive}
            onChange={(color) => updateField('nameColor', () => color)}
            onCommit={(color) => {
              updateField('nameColor', () => color);
              setColorPickerOpen(false);
            }}
            onCancel={() => setColorPickerOpen(false)}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>Edit profile</Text>
      <Box marginTop={1} flexDirection="column">
        {PROFILE_FIELD_ORDER.map((key) => fieldRow(key))}
      </Box>

      <Text color={theme.accent}>Nameplate</Text>
      <Box marginBottom={1}>
        <Text color={theme.muted}>Preview: </Text>
        <Nameplate
          handle={actor.handle}
          nameplate={{
            nameColor: fields.nameColor,
            glyph: fields.glyph,
            badges: [],
            avatarFrame: fields.avatarFrame,
            statusLine: fields.statusLine,
            profileBorder: fields.profileBorder,
          }}
        />
      </Box>
      <Box flexDirection="column">
        {NAMEPLATE_FIELD_ORDER.map((key) => (key === 'nameColor' ? nameColorRow() : fieldRow(key)))}
      </Box>

      {save.status === 'error' ? <Text color={theme.error}>{save.error.title}</Text> : null}
      <Text color={theme.muted}>
        {save.status === 'saving' ? 'Saving…' : 'Tab/↑↓ move · Ctrl+S save · Esc cancel'}
      </Text>
    </Box>
  );
}
