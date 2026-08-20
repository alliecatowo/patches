/**
 * Wire timestamp seam (ADR 0023 slice 5).
 *
 * The single place `apps/tui/src` converts between `Date` and the wire timestamp shape.
 * ts-proto (`forceLong=string`) yields `{ seconds: string, nanos }`; protobuf-es yields
 * `{ $typeName, seconds: bigint, nanos }`. `toDate` accepts all three seconds
 * representations so a slice 7 flip to `@patches/proto/es` changes only this module's
 * write side (`fromDate`), never a call site.
 *
 * Enum values and message/request/response types are not part of this file - see
 * `wire/enums.ts` and `wire/types.ts` (ADR 0023 slices 3 and 4).
 */

/** A wire timestamp's `seconds` field, in any of the three shapes the two proto families use. */
export type WireSeconds = string | number | bigint;

export interface WireTimestampLike {
  seconds: WireSeconds;
  nanos: number;
}

/**
 * Convert a wire timestamp into a `Date`.
 *
 * Returns `undefined` for an absent field - `@grpc/proto-loader` (`defaults: true`) yields
 * `null`, not `undefined`, for an unset message field - and for a timestamp whose seconds
 * fall outside the range `Date` can represent, so an overflowing or malformed value never
 * silently becomes a plausible-looking wrong date instead of "no date".
 */
export function toDate(timestamp: WireTimestampLike | null | undefined): Date | undefined {
  if (timestamp === null || timestamp === undefined) return undefined;
  const seconds = Number(timestamp.seconds);
  if (!Number.isFinite(seconds)) return undefined;
  const date = new Date(seconds * 1000 + Math.floor(timestamp.nanos / 1_000_000));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Convert a JS `Date` into the wire shape the current (ts-proto/proto-loader) family expects. */
export function fromDate(date: Date): { seconds: string; nanos: number } {
  const ms = date.getTime();
  const seconds = Math.floor(ms / 1000);
  return { seconds: String(seconds), nanos: (ms - seconds * 1000) * 1_000_000 };
}
