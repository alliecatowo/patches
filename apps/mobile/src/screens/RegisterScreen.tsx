import { describeError } from '@patches/client';
import { PasswordAuthMode } from '@patches/proto/es';
import { useEffect, useState, type JSX } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { api } from '../api/client.js';
import { randomUUID } from '../polyfills.js';
import { establishSession } from '../api/session.js';

interface RegisterScreenProps {
  onSwitchToLogin: () => void;
}

/** Mirrors `apps/web/src/routes/RegisterRoute.tsx`'s flow: invite code required (this node is
 * invite-only, spec §33), a privacy-notice acknowledgement gate before submit (never after,
 * spec §197.1), and the password field hidden — not merely disabled — when this node has
 * PASSWORD_AUTH off (spec P15-002). Unlike the web client, this screen also offers an optional
 * SSH public key field: `RegisterRequest.ssh_public_key` needs no possession proof at
 * registration time (`auth.proto`'s `BeginSshEnrollmentRequest` comment — that proof is only
 * required later, via `AddCredential`), so a user can paste a key copied from `~/.ssh/*.pub`
 * on another device without this app ever touching a private key or an SSH agent. */
export function RegisterScreen({ onSwitchToLogin }: RegisterScreenProps): JSX.Element {
  const [inviteCode, setInviteCode] = useState('');
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sshPublicKey, setSshPublicKey] = useState('');
  const [noticeAcknowledged, setNoticeAcknowledged] = useState(false);
  const [passwordAuthOff, setPasswordAuthOff] = useState(false);
  const [privacyNoticeSummary, setPrivacyNoticeSummary] = useState('');
  const [privacyNoticeVersion, setPrivacyNoticeVersion] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Best-effort policy reads: an unreachable node leaves the form at its permissive
    // defaults (password shown, no privacy notice text) rather than blocking the screen,
    // matching `apps/web`'s tolerance for the same reads.
    api.auth
      .getAuthPolicy({})
      .then((policy) => setPasswordAuthOff(policy.passwordAuth === PasswordAuthMode.OFF))
      .catch(() => undefined);
    api.node
      .getNodePolicy({})
      .then((response) => {
        if (!response.policy) return;
        setPrivacyNoticeSummary(response.policy.privacyNoticeSummary);
        setPrivacyNoticeVersion(response.policy.privacyNoticeVersion);
      })
      .catch(() => undefined);
  }, []);

  const canSubmit =
    inviteCode.trim() !== '' &&
    handle.trim() !== '' &&
    email.trim() !== '' &&
    (passwordAuthOff || password !== '') &&
    noticeAcknowledged &&
    !pending;

  const onSubmit = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      const response = await api.auth.register({
        email,
        handle,
        displayName,
        password: passwordAuthOff ? '' : password,
        inviteCode,
        clientRequestId: randomUUID(),
        sshPublicKey,
        privacyNoticeVersionAcknowledged: privacyNoticeVersion,
      });
      if (response.session) await establishSession(response.session);
      if (privacyNoticeVersion > 0) {
        try {
          await api.privacy.acknowledgePrivacyNotice({ noticeVersion: privacyNoticeVersion });
        } catch {
          // Non-fatal — the account exists either way; the privacy screen offers
          // acknowledgement again next visit (mirrors apps/web/src/routes/RegisterRoute.tsx).
        }
      }
    } catch (err) {
      setError(describeError(err).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Create an account</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TextInput
        style={styles.input}
        placeholder="Invite code"
        placeholderTextColor="#666"
        autoCapitalize="none"
        autoCorrect={false}
        value={inviteCode}
        onChangeText={setInviteCode}
      />
      <TextInput
        style={styles.input}
        placeholder="Handle"
        placeholderTextColor="#666"
        autoCapitalize="none"
        autoCorrect={false}
        value={handle}
        onChangeText={setHandle}
      />
      <TextInput
        style={styles.input}
        placeholder="Display name"
        placeholderTextColor="#666"
        value={displayName}
        onChangeText={setDisplayName}
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#666"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      {passwordAuthOff ? (
        <Text style={styles.note}>
          This node does not accept password sign-up — leave the password field blank and enroll an
          SSH key below instead.
        </Text>
      ) : (
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#666"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
      )}
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="SSH public key (optional, e.g. ssh-ed25519 AAAA... you@host)"
        placeholderTextColor="#666"
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        value={sshPublicKey}
        onChangeText={setSshPublicKey}
      />
      <Text style={styles.note}>
        {privacyNoticeSummary || 'This node has not published a privacy notice.'}
      </Text>
      <Text style={styles.note}>
        Direct messages are end-to-end encrypted when available; this client currently does not
        offer direct messages and never falls back to plaintext.
      </Text>
      <View style={styles.row}>
        <Switch value={noticeAcknowledged} onValueChange={setNoticeAcknowledged} />
        <Text style={styles.rowLabel}>I have read the privacy notice</Text>
      </View>
      <TouchableOpacity
        style={[styles.button, canSubmit ? null : styles.buttonDisabled]}
        onPress={() => void onSubmit()}
        disabled={!canSubmit}
      >
        {pending ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.buttonText}>Create account</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity onPress={onSwitchToLogin}>
        <Text style={styles.switchLink}>Already have an account? Sign in</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0b0b0c' },
  content: { padding: 24 },
  title: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 16 },
  error: { color: '#ff6b6b', marginBottom: 12 },
  note: { color: '#999', fontSize: 12, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    marginBottom: 12,
  },
  multiline: { minHeight: 60, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  rowLabel: { color: '#ccc', marginLeft: 8, flexShrink: 1 },
  button: { backgroundColor: '#fff', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#000', fontWeight: '700' },
  switchLink: { color: '#7c9cff', textAlign: 'center', marginTop: 16 },
});
