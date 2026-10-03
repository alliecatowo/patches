import { useEffect, useState, type JSX } from 'react';

/**
 * Preview `<img>` for a locally-picked upload. The object URL is created once
 * per file and revoked on unmount — an inline `URL.createObjectURL(file)` in a
 * route's render leaked one blob URL per render per tile until page reload.
 * Zero-byte files (edit-mode placeholder handles seeded from the post's media
 * list, which carry no local bytes) render nothing instead of a broken image.
 */
interface MediaUploadPreviewProps {
  file: File;
  alt: string;
  className?: string | undefined;
}

const fileIds = new WeakMap<File, number>();
let nextFileId = 0;

/**
 * Keyed by the picked `File` itself: the object URL lives in state created once per mount,
 * so a list that re-uses a component for a different file (index keys after removing an
 * earlier tile) would keep showing the OLD file's blob URL. Remounting per file makes the
 * preview always match the file that will actually be posted.
 */
export function MediaUploadPreview(props: MediaUploadPreviewProps): JSX.Element | null {
  return <MediaUploadPreviewInner key={fileKey(props.file)} {...props} />;
}

/** Stable per-`File` identity (a WeakMap, so it never keeps a picked file alive). */
function fileKey(file: File): number {
  let id = fileIds.get(file);
  if (id === undefined) {
    nextFileId += 1;
    id = nextFileId;
    fileIds.set(file, id);
  }
  return id;
}

function MediaUploadPreviewInner({
  file,
  alt,
  className,
}: MediaUploadPreviewProps): JSX.Element | null {
  const [url] = useState(() => (file.size > 0 ? URL.createObjectURL(file) : null));
  useEffect(() => {
    return () => {
      if (url !== null) URL.revokeObjectURL(url);
    };
  }, [url]);
  if (url === null) return null;
  return <img src={url} alt={alt} className={className} />;
}
