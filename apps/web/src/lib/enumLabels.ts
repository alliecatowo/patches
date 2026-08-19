/**
 * protobuf-es (`@patches/proto/es`) generates plain numeric TypeScript enums with the
 * shared type prefix stripped from each member name (`FilterAction.HIDE`, not
 * `FilterAction.FILTER_ACTION_HIDE`) — unlike the ts-proto/proto-loader family used
 * elsewhere in the repo, which decodes enums to their fully-prefixed string name at
 * runtime (see `docs/agents/LEARNINGS.md`'s "proto stringEnums" entry — that note is
 * about the *other* codegen family, not this one). A numeric TS enum still gets a
 * reverse mapping from the compiler, so `EnumObject[value]` recovers the bare member
 * name (`'HIDE'`) at runtime; this just title-cases that for display.
 */
export function humanizeEnumValue(
  value: number,
  enumObject: Record<string | number, string | number>,
): string {
  const name = enumObject[value];
  if (typeof name !== 'string') return 'Unknown';
  return name
    .split('_')
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}
