/**
 * Wire-time helpers for the web E2EE modules — the two timestamp conversions the
 * node-transcript readers and the enrollment flow need, with the same defensive
 * semantics as the TUI's `api/wire/time.ts` seam (absent/out-of-range → `undefined`,
 * never a plausible wrong date).
 */
import { timestampFromDate, type Timestamp } from '@bufbuild/protobuf/wkt';

export function toDate(timestamp: Timestamp | null | undefined): Date | undefined {
  if (timestamp === null || timestamp === undefined) return undefined;
  const seconds = Number(timestamp.seconds);
  if (!Number.isFinite(seconds)) return undefined;
  const date = new Date(seconds * 1000 + Math.floor(timestamp.nanos / 1_000_000));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function fromDate(date: Date): Timestamp {
  return timestampFromDate(date);
}
