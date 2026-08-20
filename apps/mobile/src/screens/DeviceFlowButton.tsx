import { describeError } from '@patches/client';
import type { Session } from '@patches/proto/es';
import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { type DeviceLink, type DevicePollOutcome, startDevicePoll } from '../api/devicePoll.js';
import { establishSession } from '../api/session.js';

interface BeginResult {
  deviceCode: string;
  userCode: string;
  verificationUri?: string;
  intervalSeconds: number;
}

interface DeviceFlowButtonProps<TPollResponse> {
  /** e.g. "Sign in with GitHub", "Approve from a signed-in terminal". */
  label: string;
  pendingLabel: string;
  begin: () => Promise<BeginResult>;
  poll: (deviceCode: string) => Promise<TPollResponse>;
  classify: (response: TPollResponse, currentIntervalSeconds: number) => DevicePollOutcome<Session>;
  /** Renders the code + instructions once a link is active. `verificationUri`, if present, is
   * openable via `Linking.openURL` — GitHub/OIDC have one, the SSH device-link flow doesn't
   * (the account holder runs `patches approve <code>` from a terminal instead). */
  instructions: (userCode: string, verificationUri: string | undefined) => string;
  deniedMessage?: string;
}

/**
 * Generic device-flow UI: begin -> show user code (+ optional verification URL) -> poll on a
 * `setTimeout` loop via `startDevicePoll` until a terminal/complete outcome. Shared by GitHub,
 * OIDC, and SSH-via-approve login on mobile (`docs/research/expo-react-native.md` — the phone
 * has no SSH agent, so SSH login here is `BeginDeviceLink`/`ApproveDeviceLink`, not a raw
 * challenge/signature exchange). Deliberately thin/untested per this app's convention — the
 * state machine it delegates to (`devicePoll.ts`) carries the Vitest coverage.
 */
export function DeviceFlowButton<TPollResponse>(
  props: DeviceFlowButtonProps<TPollResponse>,
): JSX.Element {
  const [link, setLink] = useState<DeviceLink | null>(null);
  const [terminal, setTerminal] = useState<'expired' | 'denied' | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleRef = useRef<{ cancel: () => void } | null>(null);

  useEffect(() => () => handleRef.current?.cancel(), []);

  const onBegin = useCallback(async () => {
    setPending(true);
    setError(null);
    setTerminal(null);
    try {
      const begun = await props.begin();
      const nextLink: DeviceLink = {
        deviceCode: begun.deviceCode,
        userCode: begun.userCode,
        intervalSeconds: begun.intervalSeconds,
        ...(begun.verificationUri !== undefined ? { verificationUri: begun.verificationUri } : {}),
      };
      setLink(nextLink);
      handleRef.current = startDevicePoll({
        link: nextLink,
        poll: props.poll,
        classify: (response) => props.classify(response, nextLink.intervalSeconds),
        onIntervalChange: setLink,
        onTerminal: (reason) => {
          setTerminal(reason);
          setLink(null);
        },
        onComplete: (session) => {
          void establishSession(session);
        },
      });
    } catch (err) {
      setError(describeError(err, { context: 'credentials' }).message);
    } finally {
      setPending(false);
    }
  }, [props]);

  const onCancel = (): void => {
    handleRef.current?.cancel();
    handleRef.current = null;
    setLink(null);
    setTerminal(null);
  };

  if (link) {
    return (
      <View style={styles.card}>
        <Text style={styles.instructions}>
          {props.instructions(link.userCode, link.verificationUri)}
        </Text>
        <Text style={styles.code}>{link.userCode}</Text>
        {link.verificationUri ? (
          <TouchableOpacity onPress={() => void Linking.openURL(link.verificationUri as string)}>
            <Text style={styles.link}>{link.verificationUri}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={onCancel}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      {terminal === 'expired' ? (
        <Text style={styles.error}>That code expired before it was used. Try again.</Text>
      ) : null}
      {terminal === 'denied' ? (
        <Text style={styles.error}>{props.deniedMessage ?? 'Sign-in was denied. Try again.'}</Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity style={styles.button} onPress={() => void onBegin()} disabled={pending}>
        {pending ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.buttonText}>{props.label}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: '#333', borderRadius: 8, padding: 12, marginBottom: 12 },
  instructions: { color: '#ccc', marginBottom: 8 },
  code: { color: '#fff', fontSize: 20, fontWeight: '700', letterSpacing: 2, marginBottom: 8 },
  link: { color: '#7c9cff', marginBottom: 8 },
  cancel: { color: '#ff6b6b' },
  button: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#ff6b6b', marginBottom: 8 },
});
