/**
 * Message-typed proto fields arrive over the wire as `null` when unset (the gRPC proto
 * loader's `defaults: true` decode), even though ts-proto's generated types say
 * `undefined`. Use this instead of
 * `=== undefined` for any optional message field (`counts`, `avatar`, `editedAt`, …).
 */
export function present<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
