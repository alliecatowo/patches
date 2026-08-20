import { describeError } from '@patches/client';
import { PasswordAuthMode, type OidcProviderInfo } from '@patches/proto/es';
import { useEffect, useState, type JSX } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { api } from '../api/client.js';
import { classifyDeviceLink, classifyGitHubLogin, classifyOidcLogin } from '../api/devicePoll.js';
import { establishSession } from '../api/session.js';
import { DeviceFlowButton } from './DeviceFlowButton.js';

interface LoginScreenProps {
  onSwitchToRegister: () => void;
}

/**
 * Sign-in. Password login is unconditional UI (hidden only when `GetAuthPolicy` reports
 * `PASSWORD_AUTH_MODE_OFF`, spec P15-002 — the same rule `apps/web/src/routes/LoginRoute.tsx`
 * follows). GitHub and generic-OIDC are device flows (`DeviceFlowButton`): show a user code and
 * verification URL, poll until a terminal status.
 *
 * SSH login here is the device-link flow (`BeginDeviceLink`/`ApproveDeviceLink`), not a raw
 * challenge/signature exchange — a phone has no SSH agent to sign a challenge with, but the
 * terminal a user is already signed in from does (`patches approve <code>`, see `auth.proto`'s
 * `BeginDeviceLink` comment and `apps/web/src/components/DeviceLinkButton.tsx`).
 *
 * No passkey button: `docs/research/expo-react-native.md` §6 found no v0-viable native WebAuthn
 * path on Expo — every wrapper needs a custom dev-client/EAS build (no Expo Go) and hosted
 * AASA/`assetlinks.json`, and none has a documented, verified guarantee of producing JSON
 * compatible with this server's `@simplewebauthn/server`-shaped RPCs. Deferred, not shipped
 * broken — see that note for what a follow-up spike would need.
 */
export function LoginScreen({ onSwitchToRegister }: LoginScreenProps): JSX.Element {
  const [emailOrHandle, setEmailOrHandle] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordAuthOff, setPasswordAuthOff] = useState(false);
  const [githubAuth, setGithubAuth] = useState(false);
  const [oidcProviders, setOidcProviders] = useState<OidcProviderInfo[]>([]);

  useEffect(() => {
    // Best-effort: an unreachable node leaves the form at its permissive default (password
    // shown, no GitHub/OIDC buttons) rather than blocking sign-in entirely.
    api.auth
      .getAuthPolicy({})
      .then((policy) => {
        setPasswordAuthOff(policy.passwordAuth === PasswordAuthMode.OFF);
        setGithubAuth(policy.githubAuth);
        setOidcProviders(policy.oidcProviders);
      })
      .catch(() => undefined);
  }, []);

  const canSubmit = emailOrHandle.trim() !== '' && password !== '' && !pending;

  const onSubmit = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      const response = await api.auth.login({ emailOrHandle, password });
      if (response.session) await establishSession(response.session);
    } catch (err) {
      setError(describeError(err, { context: 'credentials' }).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Sign in to Patches</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!passwordAuthOff ? (
        <View>
          <TextInput
            style={styles.input}
            placeholder="Email or handle"
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
            value={emailOrHandle}
            onChangeText={setEmailOrHandle}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#666"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <TouchableOpacity
            style={[styles.button, canSubmit ? null : styles.buttonDisabled]}
            onPress={() => void onSubmit()}
            disabled={!canSubmit}
          >
            {pending ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.buttonText}>Sign in</Text>
            )}
          </TouchableOpacity>
          <Text style={styles.divider}>or</Text>
        </View>
      ) : null}

      {githubAuth ? (
        <DeviceFlowButton
          label="Sign in with GitHub"
          pendingLabel="Starting…"
          begin={async () => {
            const r = await api.auth.beginGitHubLogin({});
            return {
              deviceCode: r.deviceCode,
              userCode: r.userCode,
              verificationUri: r.verificationUri,
              intervalSeconds: r.interval,
            };
          }}
          poll={(deviceCode) => api.auth.pollGitHubLogin({ deviceCode })}
          classify={classifyGitHubLogin}
          instructions={(userCode, uri) => `Go to ${uri ?? ''} and enter this code:`}
          deniedMessage="Sign-in was denied on GitHub. Try again."
        />
      ) : null}

      {oidcProviders.map((provider) => (
        <DeviceFlowButton
          key={provider.id}
          label={`Sign in with ${provider.displayName}`}
          pendingLabel="Starting…"
          begin={async () => {
            const r = await api.auth.beginOidcLogin({ provider: provider.id });
            return {
              deviceCode: r.deviceCode,
              userCode: r.userCode,
              verificationUri: r.verificationUri,
              intervalSeconds: r.interval,
            };
          }}
          poll={(deviceCode) => api.auth.pollOidcLogin({ provider: provider.id, deviceCode })}
          classify={classifyOidcLogin}
          instructions={(userCode, uri) => `Go to ${uri ?? ''} and enter this code:`}
          deniedMessage={`Sign-in was denied on ${provider.displayName}. Try again.`}
        />
      ))}

      <DeviceFlowButton
        label="Approve from a signed-in terminal"
        pendingLabel="Starting…"
        begin={async () => {
          const r = await api.auth.beginDeviceLink({});
          return { deviceCode: r.deviceCode, userCode: r.userCode, intervalSeconds: r.interval };
        }}
        poll={(deviceCode) => api.auth.pollDeviceLink({ deviceCode })}
        classify={classifyDeviceLink}
        instructions={(userCode) =>
          `In a terminal where you're already signed in, run:\npatches approve ${userCode}`
        }
      />

      <TouchableOpacity onPress={onSwitchToRegister}>
        <Text style={styles.switchLink}>No account? Register with an invite code</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0b0b0c' },
  content: { padding: 24, justifyContent: 'center', flexGrow: 1 },
  title: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 16 },
  error: { color: '#ff6b6b', marginBottom: 12 },
  divider: { color: '#666', textAlign: 'center', marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    marginBottom: 12,
  },
  button: { backgroundColor: '#fff', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#000', fontWeight: '700' },
  switchLink: { color: '#7c9cff', textAlign: 'center', marginTop: 16 },
});
