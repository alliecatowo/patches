import { create } from '@bufbuild/protobuf';
import { NodePolicySchema } from '@patches/proto/es';

import { ACCOUNT_EXPORT_STATUS, FEDERATION_STANCE } from '../api/wire/enums.js';
import { toDate } from '../api/wire/time.js';
import type {
  AccountDeletionStatus,
  AccountExport,
  NodePolicy,
  PrivacyPrefs,
} from '../api/wire/types.js';
import { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../api/client.js';
import { present } from '../api/present.js';
import { describeGrpcError, type FriendlyError } from '../api/errors.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { theme } from '../theme/index.js';

export interface PrivacyScreenProps {
  api: PatchesApi;
  isActive: boolean;
  ensureAccessToken: () => Promise<string>;
  /** Opens the shell's shared measured `ConfirmDialog` before a destructive action
   * (account deletion) — mirrors `ProfileScreen`'s block/mute confirm. */
  onConfirm: (request: { id: string; title: string; body: string; onConfirm: () => void }) => void;
  /** `Esc` — back to whichever screen `:privacy` was opened from. */
  onBack: () => void;
}

type Loadable<T> =
  { status: 'loading' } | { status: 'ready'; value: T } | { status: 'error'; error: FriendlyError };

type PrefRow = 'discoverable' | 'indexable' | 'showInLocalFeed' | 'locked';
const PREF_ROWS: readonly PrefRow[] = ['discoverable', 'indexable', 'showInLocalFeed', 'locked'];
const PREF_FIELD_MASK: Readonly<Record<PrefRow, string>> = {
  discoverable: 'discoverable',
  indexable: 'indexable',
  showInLocalFeed: 'show_in_local_feed',
  locked: 'locked',
};
const PREF_LABELS: Readonly<Record<PrefRow, string>> = {
  discoverable: 'Discoverable in search & directory',
  indexable: 'Indexable in post search',
  showInLocalFeed: 'Show my public posts on the local timeline',
  locked: 'Locked — follows need my approval',
};

function exportStatusLabel(exportInfo: AccountExport | undefined): string {
  if (exportInfo === undefined || exportInfo.status === ACCOUNT_EXPORT_STATUS.UNSPECIFIED) {
    return 'No export requested yet.';
  }
  if (exportInfo.status === ACCOUNT_EXPORT_STATUS.PENDING) return 'Export in progress…';
  if (exportInfo.status === ACCOUNT_EXPORT_STATUS.FAILED)
    return 'Export failed — press x to retry.';
  if (exportInfo.status === ACCOUNT_EXPORT_STATUS.EXPIRED) {
    return 'Export expired — press x to request a new one.';
  }
  const expiresAt = toDate(exportInfo.expiresAt);
  const expires = present(expiresAt) ? ` (link expires ${expiresAt.toISOString()})` : '';
  return `Export ready: ${sanitizeForTerminal(exportInfo.downloadUrl)}${expires}`;
}

function deletionStatusLabel(deletion: AccountDeletionStatus | undefined): string {
  if (deletion === undefined || !deletion.pending) return 'Not scheduled for deletion.';
  const purgeAfter = toDate(deletion.purgeAfter);
  const when = present(purgeAfter) ? purgeAfter.toISOString() : 'the grace period ends';
  return `Pending deletion — purges after ${when}. Press u to cancel.`;
}

/**
 * `:privacy` — the privacy notice, discoverability preferences, account export, and
 * account deletion (spec §197). Acknowledging the notice is a record that it was
 * shown, never a waiver — it gates nothing else on this screen (spec §197.1).
 */
export function PrivacyScreen({
  api,
  isActive,
  ensureAccessToken,
  onConfirm,
  onBack,
}: PrivacyScreenProps): ReactElement {
  const [policy, setPolicy] = useState<Loadable<NodePolicy>>({ status: 'loading' });
  const [prefs, setPrefs] = useState<Loadable<PrivacyPrefs>>({ status: 'loading' });
  const [exportInfo, setExportInfo] = useState<AccountExport | undefined>(undefined);
  const [deletion, setDeletion] = useState<AccountDeletionStatus | undefined>(undefined);
  const [row, setRow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    void api.getNodePolicy().then(
      (response) =>
        setPolicy({
          status: 'ready',
          value:
            response.policy ??
            create(NodePolicySchema, {
              privacyNoticeSummary: '',
              privacyNoticeVersion: 0,
              privacyNoticeUrl: '',
              termsUrl: '',
              moderatorContact: '',
              appealInstructions: '',
              federationStance: FEDERATION_STANCE.UNSPECIFIED,
              domainPolicies: [],
              dataLocation: '',
              retention: undefined,
              operatorIdentity: '',
              labelVocabulary: [],
              accountDeletionGracePeriodDays: 0,
              appealWindowDays: 0,
            }),
        }),
      (error: unknown) =>
        setPolicy({ status: 'error', error: describeGrpcError(error, api.target) }),
    );
    void ensureAccessToken()
      .then((accessToken) => api.getPrivacyPrefs({}, accessToken))
      .then(
        (response) => {
          if (present(response.prefs)) setPrefs({ status: 'ready', value: response.prefs });
        },
        (error: unknown) =>
          setPrefs({ status: 'error', error: describeGrpcError(error, api.target) }),
      );
    void ensureAccessToken()
      .then((accessToken) => api.getExportStatus({}, accessToken))
      .then((response) => setExportInfo(present(response.export) ? response.export : undefined))
      .catch(() => undefined);
    void ensureAccessToken()
      .then((accessToken) => api.getDeletionStatus({}, accessToken))
      .then((response) => setDeletion(present(response.deletion) ? response.deletion : undefined))
      .catch(() => undefined);
  }, [api, ensureAccessToken]);

  useEffect(load, [load]);

  async function acknowledge(): Promise<void> {
    if (policy.status !== 'ready' || busy) return;
    setBusy(true);
    setActionError('');
    try {
      const accessToken = await ensureAccessToken();
      const response = await api.acknowledgePrivacyNotice(
        { noticeVersion: policy.value.privacyNoticeVersion },
        accessToken,
      );
      if (present(response.prefs)) setPrefs({ status: 'ready', value: response.prefs });
      setNotice('Privacy notice acknowledged.');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function togglePref(): Promise<void> {
    if (prefs.status !== 'ready' || busy) return;
    const key = PREF_ROWS[row];
    if (key === undefined) return;
    const current = prefs.value;
    const next = { ...current, [key]: !current[key] };
    setBusy(true);
    setActionError('');
    try {
      const accessToken = await ensureAccessToken();
      const response = await api.updatePrivacyPrefs(
        {
          discoverable: next.discoverable,
          indexable: next.indexable,
          showInLocalFeed: next.showInLocalFeed,
          locked: next.locked,
          // google.protobuf.FieldMask is a message ({ paths: string[] }), not a bare array
          // (ADR 0023 — proto-loader decoded it that way; protobuf-es does not).
          updateMask: { paths: [PREF_FIELD_MASK[key]] },
        },
        accessToken,
      );
      if (present(response.prefs)) setPrefs({ status: 'ready', value: response.prefs });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function startExport(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setActionError('');
    try {
      const accessToken = await ensureAccessToken();
      const response = await api.exportAccount({}, accessToken);
      setExportInfo(present(response.export) ? response.export : undefined);
      setNotice('Export requested — check back here for the download link.');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function performDeletion(): Promise<void> {
    setBusy(true);
    setActionError('');
    try {
      const accessToken = await ensureAccessToken();
      const response = await api.requestAccountDeletion({}, accessToken);
      setDeletion(present(response.deletion) ? response.deletion : undefined);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function cancelDeletion(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setActionError('');
    try {
      const accessToken = await ensureAccessToken();
      const response = await api.cancelAccountDeletion({}, accessToken);
      setDeletion(present(response.deletion) ? response.deletion : undefined);
      setNotice('Account deletion cancelled.');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function requestDeletion(): void {
    const days =
      policy.status === 'ready' && policy.value.accountDeletionGracePeriodDays > 0
        ? policy.value.accountDeletionGracePeriodDays
        : 30;
    onConfirm({
      id: 'privacy:delete-account',
      title: 'Delete your account?',
      body: `Your account disappears from feeds, search and the local timeline immediately. It is permanently purged after a ${String(days)}-day grace period, during which you can cancel.`,
      onConfirm: () => void performDeletion(),
    });
  }

  useInput(
    (input, key) => {
      if (key.escape) {
        onBack();
        return;
      }
      if (busy) return;
      if (input === 'j' || key.downArrow) {
        setRow((value) => Math.min(PREF_ROWS.length - 1, value + 1));
        return;
      }
      if (input === 'k' || key.upArrow) {
        setRow((value) => Math.max(0, value - 1));
        return;
      }
      if (input === 'l' || input === ' ' || key.rightArrow) {
        void togglePref();
        return;
      }
      if (input === 'a') {
        void acknowledge();
        return;
      }
      if (input === 'x') {
        void startExport();
        return;
      }
      if (input === 'd') {
        requestDeletion();
        return;
      }
      if (input === 'u') {
        void cancelDeletion();
      }
    },
    { isActive },
  );

  const notAcknowledged =
    policy.status === 'ready' &&
    prefs.status === 'ready' &&
    (!present(prefs.value.privacyNoticeAcknowledgedAt) ||
      prefs.value.privacyNoticeVersion < policy.value.privacyNoticeVersion);

  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>Privacy</Text>
      {policy.status === 'loading' ? (
        <Text color={theme.muted}>Loading privacy notice…</Text>
      ) : null}
      {policy.status === 'error' ? <Text color={theme.error}>{policy.error.title}</Text> : null}
      {policy.status === 'ready' ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Privacy notice (v{String(policy.value.privacyNoticeVersion)})</Text>
          <Text wrap="wrap">
            {sanitizeForTerminal(policy.value.privacyNoticeSummary) ||
              'This server has not published a privacy notice.'}
          </Text>
          <Text color={notAcknowledged ? theme.warn : theme.ok}>
            {notAcknowledged ? 'Not yet acknowledged — press a.' : 'Acknowledged.'}
          </Text>
        </Box>
      ) : null}

      <Box flexDirection="column" marginTop={1}>
        <Text bold>Discoverability</Text>
        {prefs.status === 'loading' ? <Text color={theme.muted}>Loading…</Text> : null}
        {prefs.status === 'error' ? <Text color={theme.error}>{prefs.error.title}</Text> : null}
        {prefs.status === 'ready'
          ? PREF_ROWS.map((key, index) => (
              <Text key={key} wrap="truncate-end" inverse={isActive && index === row}>
                {index === row ? '>' : ' '} {PREF_LABELS[key]}: {prefs.value[key] ? 'on' : 'off'}
              </Text>
            ))
          : null}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text bold>Account export</Text>
        <Text color={theme.muted} wrap="wrap">
          {exportStatusLabel(exportInfo)}
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text bold>Account deletion</Text>
        <Text color={deletion?.pending === true ? theme.warn : theme.muted} wrap="wrap">
          {deletionStatusLabel(deletion)}
        </Text>
      </Box>

      {notice === '' ? null : <Text color={theme.ok}>{notice}</Text>}
      {actionError === '' ? null : (
        <Text color={theme.error}>{sanitizeForTerminal(actionError)}</Text>
      )}
      <Text color={theme.muted}>
        j/k move · l/space toggle · a acknowledge · x export · d delete account · u undo deletion ·
        Esc back
      </Text>
    </Box>
  );
}
