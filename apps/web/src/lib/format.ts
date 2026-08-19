import { timestampDate } from '@bufbuild/protobuf/wkt';
import type { Timestamp } from '@bufbuild/protobuf/wkt';

/** `Post.created_at` etc. are `google.protobuf.Timestamp | undefined` on the wire. */
export function toDate(timestamp: Timestamp | undefined): Date | null {
  return timestamp ? timestampDate(timestamp) : null;
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
];

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** Short relative time ("3h", "2d") — falls back to a locale date past a week. */
export function formatRelativeTime(timestamp: Timestamp | undefined): string {
  const date = toDate(timestamp);
  if (date === null) return '';
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return 'now';
  for (const [unit, secondsInUnit] of UNITS) {
    if (abs >= secondsInUnit) {
      const value = Math.round(seconds / secondsInUnit);
      return rtf.format(value, unit).replace(/^in /, '').replace(/ ago$/, '');
    }
  }
  return rtf.format(Math.round(seconds / 60), 'minute');
}

export function formatAbsoluteTime(timestamp: Timestamp | undefined): string {
  const date = toDate(timestamp);
  if (date === null) return '';
  return date.toLocaleString();
}

/** Compact counter formatting ("1.2K", "3M") for reply/like/repost counts. */
export function formatCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(count % 1000 === 0 ? 0 : 1)}K`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}
