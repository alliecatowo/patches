/**
 * The `{seconds, nanos}` shape proto-loader produces for a
 * `google.protobuf.Timestamp` under `longs: String`.
 *
 * proto-loader does *not* convert Timestamps to `Date` — which is why codegen
 * runs with `useDate=false,forceLong=string` rather than the `useDate=true` the
 * research note suggests. See `buf.gen.yaml`.
 */
export interface WireTimestamp {
  seconds: string;
  nanos: number;
}

/** Convert a JS `Date` into the wire shape proto-loader expects. */
export function dateToTimestamp(date: Date): WireTimestamp {
  const ms = date.getTime();
  const seconds = Math.floor(ms / 1000);
  return { seconds: String(seconds), nanos: (ms - seconds * 1000) * 1_000_000 };
}

/**
 * Convert a wire timestamp back into a `Date`.
 *
 * Returns `undefined` for an absent field — proto-loader yields `null` (not
 * `undefined`) for unset message fields when `defaults: true`, so both are
 * handled.
 */
export function timestampToDate(
  timestamp: { seconds: string | number; nanos: number } | null | undefined,
): Date | undefined {
  if (timestamp === null || timestamp === undefined) return undefined;
  const seconds =
    typeof timestamp.seconds === 'string' ? Number(timestamp.seconds) : timestamp.seconds;
  if (!Number.isFinite(seconds)) return undefined;
  return new Date(seconds * 1000 + Math.floor(timestamp.nanos / 1_000_000));
}
