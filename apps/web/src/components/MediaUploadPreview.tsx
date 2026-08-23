import { useEffect, useState, type JSX } from 'react';

/**
 * Preview `<img>` for a locally-picked upload. The object URL is created once
 * per file and revoked on unmount — an inline `URL.createObjectURL(file)` in a
 * route's render leaked one blob URL per render per tile until page reload.
 * Zero-byte files (edit-mode placeholder handles seeded from the post's media
 * list, which carry no local bytes) render nothing instead of a broken image.
 */
export function MediaUploadPreview({
  file,
  alt,
  className,
}: {
  file: File;
  alt: string;
  className?: string | undefined;
}): JSX.Element | null {
  const [url] = useState(() => (file.size > 0 ? URL.createObjectURL(file) : null));
  useEffect(() => {
    return () => {
      if (url !== null) URL.revokeObjectURL(url);
    };
  }, [url]);
  if (url === null) return null;
  return <img src={url} alt={alt} className={className} />;
}
