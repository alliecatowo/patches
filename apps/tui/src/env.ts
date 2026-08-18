/**
 * Truthy semantics for boolean env vars (`PATCHES_INSECURE`, `PATCHES_PLAIN`, …) —
 * shared so `cli/args.ts`'s startup parse and `app/App.tsx`'s runtime reads (which
 * don't go through `parseArgs` at all — a `PATCHES_PLAIN` change picked up at render
 * time) agree on what counts as "on".
 */
export function isTruthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}
