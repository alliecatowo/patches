import type { Actor } from '@patches/proto';
import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../api/client.js';
import { describeGrpcError, type FriendlyError } from '../api/errors.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { theme } from '../theme/index.js';

/** Mirrors `apps/server/src/modules/actors/validation.ts` — a client-side limit only
 * needs to match, never enforce independently of, the server's actual validation, so
 * these are kept in sync by hand rather than imported (the TUI never depends on
 * `apps/server`). */
export const DISPLAY_NAME_MAX_LENGTH = 80;
export const BIO_MAX_LENGTH = 500;
export const LOCATION_TEXT_MAX_LENGTH = 100;
export const WEBSITE_URL_MAX_LENGTH = 2048;

type FieldKey = 'displayName' | 'bio' | 'location' | 'website';

const FIELD_ORDER: readonly FieldKey[] = ['displayName', 'bio', 'location', 'website'];

const FIELD_LABELS: Record<FieldKey, string> = {
  displayName: 'Display name',
  bio: 'Bio',
  location: 'Location',
  website: 'Website',
};

const FIELD_LIMITS: Record<FieldKey, number> = {
  displayName: DISPLAY_NAME_MAX_LENGTH,
  bio: BIO_MAX_LENGTH,
  location: LOCATION_TEXT_MAX_LENGTH,
  website: WEBSITE_URL_MAX_LENGTH,
};

/** The `UpdateProfileRequest.updateMask` path for each field (spec: `actors.proto`). */
const FIELD_MASK_PATHS: Record<FieldKey, string> = {
  displayName: 'display_name',
  bio: 'bio',
  location: 'location_text',
  website: 'website_url',
};

function fieldsFromActor(actor: Actor): Record<FieldKey, string> {
  return {
    displayName: actor.displayName,
    bio: actor.bio,
    location: actor.locationText,
    website: actor.websiteUrl,
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
 * `Enter` inserts a newline only in this field), location, and website, each edited
 * in place. `Tab`/`↓` moves to the next field, `Shift+Tab`/`↑` to the previous;
 * `Ctrl+S` sends only the fields that actually changed via `UpdateProfile`'s
 * `update_mask` (spec §50) — never the whole profile, so a field left untouched can
 * never regress from a stale value. `Esc` discards every edit and leaves.
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
    const updateMask = FIELD_ORDER.filter((key) => fields[key] !== initial[key]).map(
      (key) => FIELD_MASK_PATHS[key],
    );
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
          updateMask,
          nameplate: undefined,
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
        // Only the bio field is multi-line — elsewhere Enter is a no-op rather than
        // inserting a newline a single-line field would never display sensibly.
        if (focusedKey === 'bio') updateField('bio', (value) => `${value}\n`);
        return;
      }
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
    { isActive },
  );

  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>Edit profile</Text>
      <Box marginTop={1} flexDirection="column">
        {FIELD_ORDER.map((key) => (
          <Box key={key} flexDirection="column" marginBottom={1}>
            <Text color={focusedKey === key ? theme.accent : theme.muted} bold={focusedKey === key}>
              {FIELD_LABELS[key]} ({fields[key].length}/{FIELD_LIMITS[key]})
            </Text>
            <Text wrap="wrap">
              {sanitizeForTerminal(fields[key])}
              {focusedKey === key ? <Text color={theme.accent}>█</Text> : null}
            </Text>
          </Box>
        ))}
      </Box>
      {save.status === 'error' ? <Text color={theme.error}>{save.error.title}</Text> : null}
      <Text color={theme.muted}>
        {save.status === 'saving' ? 'Saving…' : 'Tab/↑↓ move · Ctrl+S save · Esc cancel'}
      </Text>
    </Box>
  );
}
