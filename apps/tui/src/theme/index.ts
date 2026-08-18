/**
 * The one place colours are named.
 *
 * Only the 16 ANSI names are used, so Patches inherits whatever palette the
 * user has configured for their terminal instead of fighting it. `@inkjs/ui` is
 * used selectively, never as the source of visual identity (spec §67).
 */
export const theme = {
  accent: 'magenta',
  muted: 'gray',
  ok: 'green',
  warn: 'yellow',
  error: 'red',
  text: 'white',
} as const;

/** Minimum usable terminal, below which the layout is not drawn at all (spec §72). */
export const MIN_TERMINAL_SIZE = { columns: 60, rows: 20 } as const;
