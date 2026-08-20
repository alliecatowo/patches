import { describeError } from '@patches/client';
import { MAX_POST_CHARS } from '@patches/domain';
import { PostVisibility, QuotePolicy } from '@patches/proto/es';
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
import { newClientRequestId } from '../lib/id.js';

export interface ComposeScreenProps {
  onPosted: () => void;
}

/** Plain text posts only for this slice — no media/reply/quote/edit/content-warning
 * composition (`apps/web`'s `ComposeRoute` covers those; out of scope here per the task
 * brief). */
export function ComposeScreen({ onPosted }: ComposeScreenProps): JSX.Element {
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = body.trim() !== '' && body.length <= MAX_POST_CHARS && !pending;

  const onSubmit = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      await api.posts.createPost({
        clientRequestId: newClientRequestId(),
        body,
        linkUrl: '',
        visibility: PostVisibility.PUBLIC,
        inReplyToId: '',
        mediaIds: [],
        contentWarning: '',
        quotedPostId: '',
        communityId: '',
        quotePolicy: QuotePolicy.ANYONE,
      });
      setBody('');
      onPosted();
    } catch (err) {
      setError(describeError(err).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>New post</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TextInput
        style={styles.textarea}
        placeholder="What's happening?"
        placeholderTextColor="#666"
        multiline
        value={body}
        onChangeText={setBody}
      />
      <Text style={[styles.counter, body.length > MAX_POST_CHARS ? styles.counterOver : null]}>
        {body.length}/{MAX_POST_CHARS}
      </Text>
      <TouchableOpacity
        style={[styles.button, canSubmit ? null : styles.buttonDisabled]}
        onPress={() => void onSubmit()}
        disabled={!canSubmit}
      >
        {pending ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>Post</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16, backgroundColor: '#0b0b0c' },
  title: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  error: { color: '#ff6b6b', marginBottom: 12 },
  textarea: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    minHeight: 140,
    textAlignVertical: 'top',
  },
  counter: { color: '#888', textAlign: 'right', marginTop: 4, marginBottom: 12 },
  counterOver: { color: '#ff6b6b' },
  button: { backgroundColor: '#fff', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#000', fontWeight: '700' },
});
