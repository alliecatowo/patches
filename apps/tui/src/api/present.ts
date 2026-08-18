/**
 * Message-typed proto fields arrive over `@grpc/proto-loader` (`defaults: true`) as `null`
 * when unset, even though ts-proto's generated types say `undefined`. Use this instead of
 * `=== undefined` for any optional message field (`counts`, `avatar`, `editedAt`, …).
 */
export function present<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
