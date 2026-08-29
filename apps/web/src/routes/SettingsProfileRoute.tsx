import { describeError } from '@patches/client';
import { NameTagStyle, ProfileFrame } from '@patches/proto/es';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ChangeEvent, type JSX } from 'react';

import { api } from '../api/client.js';
import { setActorSession } from '../api/session.js';
import { ImageUploadField } from '../components/ImageUploadField.js';
import { useSession } from '../hooks/useSession.js';
import styles from './AuthForm.module.css';

interface FormState {
  displayName: string;
  bio: string;
  locationText: string;
  websiteUrl: string;
  nameColor: string;
  glyph: string;
  avatarMediaId: string;
  bannerMediaId: string;
  profileFrame: ProfileFrame;
  nameTagStyle: NameTagStyle;
  accentColor: string;
}

/** `/settings/profile` — display name, bio, and nameplate cosmetics (never gate function,
 * Amendment B §184.3 — this form only ever changes how the actor looks). */
export function SettingsProfileRoute(): JSX.Element {
  const session = useSession();
  const queryClient = useQueryClient();

  const actorQuery = useQuery({
    queryKey: ['actor', session?.actor.id],
    queryFn: () => api.actors.getActor({ id: session?.actor.id ?? '' }),
    enabled: session !== null,
  });

  // Form fields aren't derivable from `actorQuery.data` alone once the user starts
  // typing (a background refetch shouldn't clobber an in-progress edit), so this is
  // genuinely local state — seeded during render the first time the actor is
  // available (React's documented "adjust state during render" pattern, guarded so
  // it only fires once), never re-synced on later query data via a `useEffect`
  // (that would be the cascading-render anti-pattern `react-hooks/set-state-in-effect`
  // flags).
  const [form, setForm] = useState<FormState | null>(null);
  const actor = actorQuery.data?.actor;
  if (form === null && actor) {
    setForm({
      displayName: actor.displayName,
      bio: actor.bio,
      locationText: actor.locationText,
      websiteUrl: actor.websiteUrl,
      nameColor: actor.nameplate?.nameColor ?? '',
      glyph: actor.nameplate?.glyph ?? '',
      avatarMediaId: actor.avatar?.mediaId ?? '',
      bannerMediaId: actor.banner?.mediaId ?? '',
      profileFrame:
        actor.profileFrame === ProfileFrame.UNSPECIFIED ? ProfileFrame.NONE : actor.profileFrame,
      nameTagStyle:
        actor.nameTagStyle === NameTagStyle.UNSPECIFIED ? NameTagStyle.NONE : actor.nameTagStyle,
      accentColor: actor.accentColor,
    });
  }

  const mutation = useMutation({
    mutationFn: () => {
      if (form === null) throw new Error('Profile not loaded yet.');
      return api.actors.updateProfile({
        displayName: form.displayName,
        bio: form.bio,
        locationText: form.locationText,
        websiteUrl: form.websiteUrl,
        updateMask: {
          paths: [
            'display_name',
            'bio',
            'location_text',
            'website_url',
            'nameplate',
            'avatar_media_id',
            'banner_media_id',
            'profile_frame',
            'name_tag_style',
            'accent_color',
          ],
        },
        nameplate: {
          nameColor: form.nameColor,
          glyph: form.glyph,
          badges: [],
          avatarFrame: '',
          statusLine: '',
          profileBorder: '',
        },
        avatarMediaId: form.avatarMediaId,
        bannerMediaId: form.bannerMediaId,
        profileFrame: form.profileFrame,
        nameTagStyle: form.nameTagStyle,
        accentColor: form.accentColor,
      });
    },
    onSuccess: (response) => {
      if (response.actor) setActorSession(response.actor);
      void queryClient.invalidateQueries({ queryKey: ['actor'] });
    },
  });

  if (session === null) return <p style={{ padding: '1rem' }}>Sign in to edit your profile.</p>;
  if (form === null) return <p style={{ padding: '1rem' }}>Loading…</p>;

  const set =
    (key: keyof FormState) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((current) => (current ? { ...current, [key]: event.target.value } : current));

  const setFrame = (frame: ProfileFrame): void =>
    setForm((current) => (current ? { ...current, profileFrame: frame } : current));

  const setNameTag = (style: NameTagStyle): void =>
    setForm((current) => (current ? { ...current, nameTagStyle: style } : current));

  return (
    <div className={styles['wrap']}>
      <h1>Edit profile</h1>
      {mutation.isError ? (
        <p className={styles['error']}>{describeError(mutation.error).message}</p>
      ) : null}
      {mutation.isSuccess ? <p>Saved.</p> : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <div className={styles['field']}>
          <label htmlFor="settings-display-name">Display name</label>
          <input
            id="settings-display-name"
            value={form.displayName}
            onChange={set('displayName')}
          />
        </div>
        <div className={styles['field']}>
          <label htmlFor="settings-bio">Bio</label>
          <textarea id="settings-bio" value={form.bio} onChange={set('bio')} rows={4} />
        </div>
        <div className={styles['field']}>
          <label htmlFor="settings-location">Location</label>
          <input id="settings-location" value={form.locationText} onChange={set('locationText')} />
        </div>
        <div className={styles['field']}>
          <label htmlFor="settings-website">Website</label>
          <input id="settings-website" value={form.websiteUrl} onChange={set('websiteUrl')} />
        </div>
        <div className={styles['field']}>
          <label htmlFor="settings-color">
            Nameplate colour (hex, or two hex codes separated by a comma for a gradient)
          </label>
          <input
            id="settings-color"
            value={form.nameColor}
            onChange={set('nameColor')}
            placeholder="#6b46c1"
          />
        </div>
        <div className={styles['field']}>
          <label htmlFor="settings-glyph">Nameplate glyph (one character)</label>
          <input id="settings-glyph" value={form.glyph} onChange={set('glyph')} />
        </div>
        <div className={styles['field']}>
          <ImageUploadField
            aspect={1}
            shape="avatar"
            label="Avatar"
            currentMediaId={form.avatarMediaId}
            onChange={(mediaId) =>
              setForm((current) => (current ? { ...current, avatarMediaId: mediaId } : current))
            }
          />
        </div>
        <div className={styles['field']}>
          <ImageUploadField
            aspect={3}
            shape="banner"
            label="Banner"
            currentMediaId={form.bannerMediaId}
            onChange={(mediaId) =>
              setForm((current) => (current ? { ...current, bannerMediaId: mediaId } : current))
            }
          />
        </div>
        <div className={styles['field']}>
          <label htmlFor="settings-frame">Profile frame</label>
          <select
            id="settings-frame"
            value={form.profileFrame}
            onChange={(event) => setFrame(Number(event.target.value))}
          >
            <option value={ProfileFrame.NONE}>None</option>
            <option value={ProfileFrame.BORDER}>Border</option>
            <option value={ProfileFrame.GLOW}>Glow</option>
            <option value={ProfileFrame.GRADIENT}>Gradient</option>
          </select>
        </div>
        <div className={styles['field']}>
          <label htmlFor="settings-name-tag">Name tag style</label>
          <select
            id="settings-name-tag"
            value={form.nameTagStyle}
            onChange={(event) => setNameTag(Number(event.target.value))}
          >
            <option value={NameTagStyle.NONE}>None</option>
            <option value={NameTagStyle.BADGE}>Badge</option>
            <option value={NameTagStyle.RIBBON}>Ribbon</option>
            <option value={NameTagStyle.PILLED}>Pilled</option>
          </select>
        </div>
        <div className={styles['field']}>
          <label htmlFor="settings-accent">Accent colour (hex)</label>
          <input
            id="settings-accent"
            value={form.accentColor}
            onChange={set('accentColor')}
            placeholder="#10B981"
          />
        </div>
        <button type="submit" className={styles['submit']} disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  );
}
