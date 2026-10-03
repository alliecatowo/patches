const NAMED = new Set([
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'gray',
  'grey',
  'blackBright',
  'redBright',
  'greenBright',
  'yellowBright',
  'blueBright',
  'magentaBright',
  'cyanBright',
  'whiteBright',
]);
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/u;
const ANSI256 = /^ansi256\(\s*(\d{1,3})\s*\)$/u;
const RGB = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/u;

/**
 * Server-supplied colours (Page `theme.accent`, nameplate `nameColor`) are untrusted: Ink looks any
 * string up as a chalk *property*, so a value like `level` or `toString` throws and kills the
 * app. Only a hex, `ansi256(n)`, `rgb(r,g,b)` or a basic named colour is passed through.
 */
export function safeInkColor(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (NAMED.has(trimmed) || HEX.test(trimmed)) return trimmed;
  const ansi = ANSI256.exec(trimmed);
  if (ansi !== null && Number(ansi[1]) <= 255) return trimmed;
  const rgb = RGB.exec(trimmed);
  if (rgb !== null && [rgb[1], rgb[2], rgb[3]].every((part) => Number(part) <= 255)) return trimmed;
  return undefined;
}
