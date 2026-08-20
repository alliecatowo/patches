import { describeError } from '@patches/client';
import { useState, type JSX } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { api } from '../api/client.js';
import { establishSession } from '../api/session.js';

/** Password sign-in only — `AuthService` also has SSH/passkey/GitHub/OIDC login (see
 * `apps/web`), out of scope for this slice per the task brief. */
export function LoginScreen(): JSX.Element {
  const [emailOrHandle, setEmailOrHandle] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <View style={styles.wrap}>
      <Text style={styles.title}>Sign in to Patches</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#0b0b0c' },
  title: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 16 },
  error: { color: '#ff6b6b', marginBottom: 12 },
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
});
