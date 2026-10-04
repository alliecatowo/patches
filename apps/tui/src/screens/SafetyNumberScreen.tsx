import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';

import { safetyNumber as computeSafetyNumber } from '@patches/crypto';

import type { PatchesApi } from '../api/client.js';
import { describeGrpcError, type FriendlyError } from '../api/errors.js';
import type { ActiveSession } from '../auth/session.js';
import { identityRootFromWire, strictVerifier, verifyActorChain } from '../e2ee/chain.js';
import { verifyIdentityRoot } from '@patches/domain';
import { theme } from '../theme/index.js';
import { Loading } from '../components/Loading.js';

export interface SafetyNumberScreenProps {
  api: PatchesApi;
  session: ActiveSession;
  isActive: boolean;
  targetActorId: string;
  ensureAccessToken: () => Promise<string>;
  /** True when this peer's safety number was already compared and confirmed. */
  verified?: boolean | undefined;
  /** `v` — record that the viewer compared the number out-of-band. Session-scoped. */
  onMarkVerified?: (() => void) | undefined;
  /** Whether the served root is an uncountersigned reset of the pinned identity (audit P2-H2). */
  onCheckResetPending?: ((root: ResetRoot) => Promise<boolean>) | undefined;
  /** Re-pins that exact root. Only runs after the viewer confirms (`a`, then `y`). */
  onAcceptReset?: ((root: ResetRoot) => Promise<void>) | undefined;
  onBack: () => void;
}

interface ResetRoot {
  readonly rootBytes: Uint8Array;
  readonly selfSignature: Uint8Array;
}

type SafetyState =
  | { status: 'loading' }
  | {
      status: 'ready';
      number: string;
      targetHandle: string;
      chainVerified: boolean;
      /** The exact root the displayed number was computed from, when it is a pending reset. */
      pendingReset?: ResetRoot;
    }
  | { status: 'error'; error: FriendlyError };

/**
 * Safety number screen for an E2EE conversation (P13-010, B-101).
 *
 * The displayed number is derived only from keys that survived client-side
 * verification: the peer's identity root must carry a valid self-signature and its
 * published device roster must verify root → roster → certificates. A chain that fails
 * verification is never silently rendered as a comparable number — that would invite
 * comparing against exactly the substitution the out-of-band check exists to catch.
 */
export function SafetyNumberScreen({
  api,
  session,
  isActive,
  targetActorId,
  ensureAccessToken,
  verified,
  onMarkVerified,
  onCheckResetPending,
  onAcceptReset,
  onBack,
}: SafetyNumberScreenProps): ReactElement {
  const [state, setState] = useState<SafetyState>(() =>
    session.actor?.id === undefined
      ? {
          status: 'error',
          error: { title: 'No account on this session.', hint: '', retryable: false, code: 0 },
        }
      : { status: 'loading' },
  );

  const [reloadCount, setReloadCount] = useState(0);
  // The check callback is recreated by the shell every render; holding it in a ref keeps the
  // load effect from re-running (and flashing `loading`) on each one.
  const checkResetRef = useRef(onCheckResetPending);
  useEffect(() => {
    checkResetRef.current = onCheckResetPending;
  }, [onCheckResetPending]);

  useEffect(() => {
    let cancelled = false;
    const myActorId = session.actor?.id;
    if (myActorId === undefined) return;
    void (async () => {
      try {
        const [myResponse, theirResponse, actorResponse, rosterResponse] = await Promise.all([
          ensureAccessToken().then((token) => api.getIdentityRoot({ actorId: myActorId }, token)),
          ensureAccessToken().then((token) =>
            api.getIdentityRoot({ actorId: targetActorId }, token),
          ),
          api.getActor({ id: targetActorId }),
          api.getDeviceRoster({ actorId: targetActorId }),
        ]);
        if (cancelled) return;
        const myRoot = myResponse.identityRoot;
        const theirRoot = theirResponse.identityRoot;
        const theirRoster = rosterResponse.roster;
        if (
          myRoot?.publicKey === undefined ||
          theirRoot?.publicKey === undefined ||
          myRoot.actorId === '' ||
          theirRoot.actorId === ''
        ) {
          setState({
            status: 'error',
            error: {
              title: 'Could not retrieve identity keys.',
              hint: '',
              retryable: false,
              code: 0,
            },
          });
          return;
        }
        let chainVerified = false;
        try {
          if (theirRoster === undefined) throw new Error('No device roster published.');
          // Verify the peer's published chain (root proof-of-possession → signed roster →
          // each active device certificate) before its keys may be consumed.
          verifyActorChain({
            rootWire: theirRoot,
            rosterWire: theirRoster,
            certificatesWire: rosterResponse.certificates ?? [],
            now: new Date(),
          });
          chainVerified = true;
        } catch {
          chainVerified = false;
        }
        // The viewer's own root needs proof of possession (self-signature) before it
        // feeds the canonical fingerprint; a failed self-check also gates `v`.
        let selfVerified = false;
        try {
          verifyIdentityRoot(identityRootFromWire(myRoot), { verifier: strictVerifier });
          selfVerified = true;
        } catch {
          selfVerified = false;
        }
        const servedRoot: ResetRoot = {
          rootBytes: theirRoot.rootBytes,
          selfSignature: theirRoot.selfSignature,
        };
        const pendingReset =
          chainVerified && checkResetRef.current !== undefined
            ? await checkResetRef.current(servedRoot).catch(() => false)
            : false;
        if (cancelled) return;
        setState({
          status: 'ready',
          ...(pendingReset ? { pendingReset: servedRoot } : {}),
          number: computeSafetyNumber(
            myRoot.actorId,
            myRoot.publicKey,
            theirRoot.actorId,
            theirRoot.publicKey,
          ),
          targetHandle: actorResponse.actor?.handle ?? targetActorId,
          chainVerified: chainVerified && selfVerified,
        });
      } catch (error) {
        if (!cancelled) {
          setState({ status: 'error', error: describeGrpcError(error, api.target) });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, ensureAccessToken, session.actor?.id, targetActorId, reloadCount]);

  const [confirmingAccept, setConfirmingAccept] = useState(false);
  const [acceptNote, setAcceptNote] = useState<string | undefined>(undefined);

  useInput(
    (input, key) => {
      if (confirmingAccept) {
        // A second, explicit keypress: anything but `y` cancels.
        setConfirmingAccept(false);
        if (
          input === 'y' &&
          state.status === 'ready' &&
          state.pendingReset !== undefined &&
          onAcceptReset !== undefined
        ) {
          const root = state.pendingReset;
          void onAcceptReset(root).then(
            () => {
              setAcceptNote('New identity accepted.');
              setReloadCount((count) => count + 1);
            },
            () => setAcceptNote('That identity could not be accepted.'),
          );
        }
        return;
      }
      if (
        input === 'a' &&
        state.status === 'ready' &&
        state.pendingReset !== undefined &&
        onAcceptReset !== undefined
      ) {
        setConfirmingAccept(true);
        return;
      }
      if (key.escape || input === 'q') onBack();
      if (input === 'v' && state.status === 'ready' && state.chainVerified) onMarkVerified?.();
    },
    { isActive },
  );

  if (state.status === 'loading') return <Loading label="Calculating safety number..." />;
  if (state.status === 'error') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color={theme.error}>Failed to calculate safety number</Text>
        <Text>{state.error.title}</Text>
        <Text color={theme.muted}>Esc back</Text>
      </Box>
    );
  }

  // Split 60-digit number into two rows of 30 (6 groups each)
  const parts = state.number.split(/(.{30})/u).filter((part) => part !== '');
  const groups = parts.flatMap((part) => part.match(/.{5}/gu) ?? []);
  const rowsOf6 = [groups.slice(0, 6).join(' '), groups.slice(6, 12).join(' ')];

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Safety Number · @{state.targetHandle}</Text>
      {state.pendingReset === undefined ? null : (
        <Text color={theme.error} wrap="wrap">
          @{state.targetHandle} reset their messaging identity without a signature from their
          previous key. Messages with them are paused. Compare the number below with them over a
          trusted channel, then accept the new identity: a, then y to confirm.
          {confirmingAccept ? ' Press y now to trust these keys, any other key cancels.' : ''}
        </Text>
      )}
      {acceptNote === undefined ? null : <Text color={theme.muted}>{acceptNote}</Text>}
      {state.chainVerified ? (
        <>
          <Text color={verified ? theme.ok : theme.warn}>
            {verified ? 'Verified — you compared this number.' : 'Not verified yet.'}
          </Text>
          <Box flexDirection="column" paddingX={1}>
            {rowsOf6.map((row, index) => (
              <Text key={index} color={theme.accent} bold>
                {row}
              </Text>
            ))}
          </Box>
          <Text color={theme.muted} wrap="wrap">
            Compare this number with @{state.targetHandle} over a trusted out-of-band channel to
            confirm your conversation is not being intercepted.
          </Text>
        </>
      ) : (
        <Text color={theme.error} wrap="wrap">
          This account's published identity keys failed signature verification, so no safety number
          is shown: the digits below could have been substituted along with the keys. Re-open this
          screen once the failure is understood.
        </Text>
      )}
      {onMarkVerified === undefined ? null : (
        <Text color={theme.muted}>
          {state.chainVerified
            ? 'v mark as compared (this session)'
            : 'v unavailable — keys failed verification'}
        </Text>
      )}
      <Text color={theme.muted}>Esc or q — back</Text>
    </Box>
  );
}
