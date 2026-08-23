import { describeError } from '@patches/client';
import { MediaStatus, type Post } from '@patches/proto/es';
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
import {
  addDraftMedia,
  buildComposeSubmission,
  createComposeDraftState,
  removeDraftMedia,
  setDraftBody,
  setDraftContentWarning,
  setDraftCwEnabled,
  syncComposeDraftState,
  type ComposeDraftState,
  type ComposeTarget,
} from '../compose/draft.js';
import {
  canSubmitCompose,
  MAX_COMPOSE_MEDIA,
  resolveMaxPostChars,
  type NodeInfoLike,
} from '../compose/requests.js';
import { newClientRequestId } from '../lib/id.js';
import { pickImage } from '../media/picker.js';
import { pollMediaUntilReady, uploadMediaBytes, type UploadProgress } from '../media/upload.js';

export type { ComposeTarget, ComposeDraftState };

export interface ComposeScreenProps {
  target: ComposeTarget;
  onPosted: (post: Post | undefined) => void;
  onCancel: () => void;
  /** Optional override / preloaded node limit or node info response. */
  maxPostChars?: NodeInfoLike;
}

type AttachState =
  | { status: 'idle' }
  | { status: 'uploading'; progress: UploadProgress }
  | { status: 'error'; message: string };

function titleFor(target: ComposeTarget): string {
  switch (target.kind) {
    case 'post':
      return 'New post';
    case 'reply':
      return 'Reply';
    case 'quote':
      return 'Quote';
    case 'edit':
      return 'Edit post';
  }
}

/**
 * Compose/reply/quote/edit with up to `MAX_COMPOSE_MEDIA` images (uploaded straight to
 * R2 via `media/upload.ts` — never proxied through Node, spec §153) and an optional
 * content warning. All request-shape and validation logic lives in `compose/requests.ts`
 * and `compose/draft.ts`, which are Vitest-covered; this component only renders that state
 * (`docs/research/expo-react-native.md` §4).
 */
export function ComposeScreen({
  target,
  onPosted,
  onCancel,
  maxPostChars,
}: ComposeScreenProps): JSX.Element {
  const [draftState, setDraftState] = useState<ComposeDraftState>(() =>
    createComposeDraftState(target),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attach, setAttach] = useState<AttachState>({ status: 'idle' });
  const [limit, setLimit] = useState<number>(() => resolveMaxPostChars(maxPostChars));

  // Reset and re-key compose draft state whenever target changes so edit/reply/quote
  // content cannot accidentally be submitted as a root post or leak across targets.
  useEffect(() => {
    setDraftState((current) => syncComposeDraftState(current, target));
    setAttach({ status: 'idle' });
    setError(null);
  }, [target]);

  // Fetch node info for max_post_chars limit if not explicitly passed
  useEffect(() => {
    if (maxPostChars !== undefined) return;
    let cancelled = false;
    api.node
      .getNodeInfo({})
      .then((info) => {
        if (!cancelled) {
          setLimit(resolveMaxPostChars(info));
        }
      })
      .catch(() => {
        // Fallback to domain default
      });
    return () => {
      cancelled = true;
    };
  }, [maxPostChars]);

  const { draft, cwEnabled } = draftState;
  const uploading = attach.status === 'uploading';
  const canSubmit = canSubmitCompose(draft, limit, uploading) && !pending;

  const onAttach = async (): Promise<void> => {
    if (draft.mediaIds.length >= MAX_COMPOSE_MEDIA) return;
    setAttach({ status: 'uploading', progress: { sentBytes: 0, totalBytes: 0 } });
    try {
      const picked = await pickImage();
      if (picked === null) {
        setAttach({ status: 'idle' });
        return;
      }
      const mediaId = await uploadMediaBytes(api.media, picked, (progress) =>
        setAttach({ status: 'uploading', progress }),
      );
      const ready = await pollMediaUntilReady(api.media, mediaId);
      if (ready.status !== MediaStatus.READY) {
        throw new Error('That image failed to process.');
      }
      setDraftState((current) => addDraftMedia(current, mediaId));
      setAttach({ status: 'idle' });
    } catch (err) {
      setAttach({ status: 'error', message: describeError(err).message });
    }
  };

  const removeMedia = (mediaId: string): void => {
    setDraftState((current) => removeDraftMedia(current, mediaId));
  };

  const onSubmit = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      const submission = buildComposeSubmission(draftState, newClientRequestId());
      const response =
        submission.kind === 'edit'
          ? await api.posts.editPost(submission.input)
          : await api.posts.createPost(submission.input);
      onPosted(response.post);
    } catch (err) {
      setError(describeError(err).message);
    } finally {
      setPending(false);
    }
  };

  const quotedPreview = target.kind === 'quote' ? target.quote : undefined;

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{titleFor(target)}</Text>
        <TouchableOpacity onPress={onCancel}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TextInput
        style={styles.textarea}
        placeholder="What's happening?"
        placeholderTextColor="#666"
        multiline
        value={draft.body}
        onChangeText={(body) => setDraftState((current) => setDraftBody(current, body))}
      />
      <Text style={[styles.counter, draft.body.length > limit ? styles.counterOver : null]}>
        {draft.body.length}/{limit}
      </Text>

      {quotedPreview ? (
        <View style={styles.quotedPost}>
          <Text style={styles.quotedHandle}>@{quotedPreview.author?.handle}</Text>
          <Text style={styles.quotedBody} numberOfLines={4}>
            {quotedPreview.body}
          </Text>
        </View>
      ) : null}

      <View style={styles.cwRow}>
        <Text style={styles.cwLabel}>Content warning</Text>
        <Switch
          value={cwEnabled}
          onValueChange={(enabled) =>
            setDraftState((current) => setDraftCwEnabled(current, enabled))
          }
        />
      </View>
      {cwEnabled ? (
        <TextInput
          style={styles.cwInput}
          placeholder="Content warning text"
          placeholderTextColor="#666"
          value={draft.contentWarning}
          onChangeText={(contentWarning) =>
            setDraftState((current) => setDraftContentWarning(current, contentWarning))
          }
        />
      ) : null}

      <View style={styles.mediaRow}>
        {draft.mediaIds.map((mediaId) => (
          <View key={mediaId} style={styles.mediaChip}>
            <Text style={styles.mediaChipText} numberOfLines={1}>
              {mediaId}
            </Text>
            <TouchableOpacity onPress={() => removeMedia(mediaId)}>
              <Text style={styles.mediaRemove}>Remove</Text>
            </TouchableOpacity>
          </View>
        ))}
        {draft.mediaIds.length < MAX_COMPOSE_MEDIA ? (
          <TouchableOpacity
            style={styles.attachButton}
            onPress={() => void onAttach()}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.attachButtonText}>+ Add image</Text>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
      {attach.status === 'error' ? <Text style={styles.error}>{attach.message}</Text> : null}

      <TouchableOpacity
        style={[styles.button, canSubmit ? null : styles.buttonDisabled]}
        onPress={() => void onSubmit()}
        disabled={!canSubmit}
      >
        {pending ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.buttonText}>{target.kind === 'edit' ? 'Save' : 'Post'}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0b0b0c' },
  content: { padding: 16 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  cancel: { color: '#7c9cff' },
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
  quotedPost: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  quotedHandle: { color: '#fff', fontWeight: '700', marginBottom: 4 },
  quotedBody: { color: '#ccc' },
  cwRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cwLabel: { color: '#ccc' },
  cwInput: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 10,
    color: '#fff',
    marginBottom: 12,
  },
  mediaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  mediaChip: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 160,
  },
  mediaChipText: { color: '#ccc', flexShrink: 1 },
  mediaRemove: { color: '#ff6b6b' },
  attachButton: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  attachButtonText: { color: '#fff' },
  button: { backgroundColor: '#fff', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#000', fontWeight: '700' },
});
