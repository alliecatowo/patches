import { describeError } from '@patches/client';
import { useRef, useState, type DragEvent, type JSX } from 'react';

import { cropImageToAspect } from '../lib/imageCrop.js';
import { uploadMedia } from '../lib/mediaUpload.js';
import { MediaImage } from './MediaImage.js';
import { MediaUploadPreview } from './MediaUploadPreview.js';
import styles from './ImageUploadField.module.css';

// Mirrors `packages/media/src/limits.ts` (§28) — not imported: that package pulls in the
// `@aws-sdk/client-s3` presigning client, which has no business in a browser bundle (same
// "duplicated here rather than imported" reasoning `packages/terminal-media`'s renderer.ts
// documents for the same numbers).
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface ImageUploadFieldProps {
  /** `1` for an avatar (square), `3` for a banner (wide). */
  aspect: number;
  shape: 'avatar' | 'banner';
  label: string;
  /** The currently-persisted media id, if any — renders as the initial preview. */
  currentMediaId: string;
  /** Called with a fresh `media_id` once the crop is uploaded and `FinalizeMediaUpload`
   * has been called; called with `''` when the user removes the image. */
  onChange: (mediaId: string) => void;
}

/**
 * Direct-to-R2 avatar/banner picker (#324): file-pick or drag-drop, a centered
 * aspect-enforced crop (`cropImageToAspect`), then the existing presigned-PUT upload
 * (`uploadMedia`) — image bytes never transit this app's Node server (§30, §153).
 */
export function ImageUploadField({
  aspect,
  shape,
  label,
  currentMediaId,
  onChange,
}: ImageUploadFieldProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [error, setError] = useState('');

  const fieldId = `image-upload-${shape}`;

  const handleFile = (file: File | undefined): void => {
    if (!file) return;
    if (!ACCEPTED_TYPES.has(file.type)) {
      setStatus('error');
      setError('Only JPEG, PNG, or WebP images are supported.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setStatus('error');
      setError('Image is too large — max 10 MB.');
      return;
    }
    setStatus('uploading');
    setError('');
    setProgress(0);

    void (async () => {
      try {
        const cropped = await cropImageToAspect(file, aspect);
        setPendingFile(cropped);
        const mediaId = await uploadMedia(cropped, setProgress);
        setStatus('idle');
        onChange(mediaId);
      } catch (uploadError) {
        setStatus('error');
        setError(describeError(uploadError).message);
      }
    })();
  };

  const shapeClass = shape === 'avatar' ? styles['avatarShape'] : styles['bannerShape'];

  return (
    <div className={styles['wrap']}>
      <label htmlFor={fieldId}>{label}</label>
      <div
        className={`${styles['dropzone']} ${shapeClass ?? ''} ${dragActive ? (styles['dropzoneActive'] ?? '') : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`Upload ${label.toLowerCase()}`}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
        }}
        onDragOver={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          setDragActive(false);
          handleFile(event.dataTransfer.files[0]);
        }}
      >
        {pendingFile ? (
          <MediaUploadPreview file={pendingFile} alt={label} className={styles['preview']} />
        ) : currentMediaId !== '' ? (
          <MediaImage mediaId={currentMediaId} altText={label} className={styles['preview']} />
        ) : (
          <span>Choose or drop an image ({shape === 'avatar' ? '1:1' : '3:1'})</span>
        )}
      </div>
      <input
        ref={inputRef}
        id={fieldId}
        className={styles['hiddenInput']}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        // The PWA camera capture attribute: only meaningful on avatar/banner-style
        // single-image pickers on mobile, harmless (ignored) on desktop.
        capture="environment"
        onChange={(event) => {
          handleFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {status === 'uploading' ? (
        <div className={styles['progressRow']}>
          <div className={styles['progressTrack']}>
            <div
              className={styles['progressFill']}
              style={{ width: `${String(Math.round(progress * 100))}%` }}
            />
          </div>
          <span>{Math.round(progress * 100)}%</span>
        </div>
      ) : null}
      {status === 'error' ? <p className={styles['error']}>{error}</p> : null}
      {currentMediaId !== '' && status !== 'uploading' ? (
        <button
          type="button"
          className={styles['removeBtn']}
          onClick={() => {
            setPendingFile(null);
            onChange('');
          }}
        >
          Remove {shape}
        </button>
      ) : null}
    </div>
  );
}
