export type TerminalColorTier = 'truecolor' | 'ansi256' | 'ansi16' | 'text';

export interface ResolvedTerminalColor {
  /** Ink accepts hex, `ansi256(n)`, and ANSI color names directly. */
  inkColor: string | null;
  /** Deterministic RGB reference used for contrast calculations. */
  mappedHex: string;
  /** Human-readable description for text-only and diagnostic UI. */
  label: string;
}

interface Rgb {
  red: number;
  green: number;
  blue: number;
}

interface AnsiColor {
  index: number;
  name: string;
  rgb: Rgb;
}

const PICKER_CHANNELS = [0, 51, 102, 153, 204, 255] as const;
const XTERM_CHANNELS = [0, 95, 135, 175, 215, 255] as const;

const ANSI_16: readonly AnsiColor[] = [
  { index: 0, name: 'black', rgb: { red: 0, green: 0, blue: 0 } },
  { index: 1, name: 'red', rgb: { red: 128, green: 0, blue: 0 } },
  { index: 2, name: 'green', rgb: { red: 0, green: 128, blue: 0 } },
  { index: 3, name: 'yellow', rgb: { red: 128, green: 128, blue: 0 } },
  { index: 4, name: 'blue', rgb: { red: 0, green: 0, blue: 128 } },
  { index: 5, name: 'magenta', rgb: { red: 128, green: 0, blue: 128 } },
  { index: 6, name: 'cyan', rgb: { red: 0, green: 128, blue: 128 } },
  { index: 7, name: 'white', rgb: { red: 192, green: 192, blue: 192 } },
  { index: 8, name: 'blackBright', rgb: { red: 128, green: 128, blue: 128 } },
  { index: 9, name: 'redBright', rgb: { red: 255, green: 0, blue: 0 } },
  { index: 10, name: 'greenBright', rgb: { red: 0, green: 255, blue: 0 } },
  { index: 11, name: 'yellowBright', rgb: { red: 255, green: 255, blue: 0 } },
  { index: 12, name: 'blueBright', rgb: { red: 0, green: 0, blue: 255 } },
  { index: 13, name: 'magentaBright', rgb: { red: 255, green: 0, blue: 255 } },
  { index: 14, name: 'cyanBright', rgb: { red: 0, green: 255, blue: 255 } },
  { index: 15, name: 'whiteBright', rgb: { red: 255, green: 255, blue: 255 } },
] as const;

const ANSI_256: readonly AnsiColor[] = buildAnsi256Palette();

/** Accept exactly CSS-style six-digit hex and return one canonical lowercase value. */
export function normalizeHexColor(value: string): string | null {
  return /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}

/** The web-safe 6×6×6 picker cube in red-major, green-middle, blue-minor order. */
export function pickerColorAt(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= 216) {
    throw new RangeError('picker color index must be an integer from 0 through 215');
  }
  const red = PICKER_CHANNELS[Math.floor(index / 36)] ?? 0;
  const green = PICKER_CHANNELS[Math.floor(index / 6) % 6] ?? 0;
  const blue = PICKER_CHANNELS[index % 6] ?? 0;
  return rgbToHex({ red, green, blue });
}

export function nearestPickerColorIndex(hex: string): number {
  const target = parseHex(hex);
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < 216; index += 1) {
    const distance = colorDistance(target, parseHex(pickerColorAt(index)));
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }
  return nearestIndex;
}

/** WCAG 2.x relative-luminance contrast ratio, from 1:1 through 21:1. */
export function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(parseHex(foreground));
  const second = relativeLuminance(parseHex(background));
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Map authored RGB to the exact representation Ink should emit for a caller-selected tier. */
export function resolveTerminalColor(hex: string, tier: TerminalColorTier): ResolvedTerminalColor {
  const normalized = normalizeHexColor(hex);
  if (normalized === null) throw new TypeError(`invalid six-digit hex color: ${hex}`);

  if (tier === 'truecolor') {
    return { inkColor: normalized, mappedHex: normalized, label: normalized };
  }
  if (tier === 'text') {
    return { inkColor: null, mappedHex: normalized, label: 'text only' };
  }

  const palette = tier === 'ansi256' ? ANSI_256 : ANSI_16;
  const nearest = nearestPaletteColor(parseHex(normalized), palette);
  const mappedHex = rgbToHex(nearest.rgb);
  if (tier === 'ansi256') {
    const label = `ansi256(${String(nearest.index)})`;
    return { inkColor: label, mappedHex, label };
  }
  return { inkColor: nearest.name, mappedHex, label: nearest.name };
}

/** Contrast of the colors that the selected tier will actually ask Ink to render. */
export function terminalContrastRatio(
  foreground: string,
  background: string,
  tier: TerminalColorTier,
): number {
  const resolvedForeground = resolveTerminalColor(foreground, tier);
  const resolvedBackground = resolveTerminalColor(background, tier);
  return contrastRatio(resolvedForeground.mappedHex, resolvedBackground.mappedHex);
}

function parseHex(hex: string): Rgb {
  const normalized = normalizeHexColor(hex);
  if (normalized === null) throw new TypeError(`invalid six-digit hex color: ${hex}`);
  return {
    red: Number.parseInt(normalized.slice(1, 3), 16),
    green: Number.parseInt(normalized.slice(3, 5), 16),
    blue: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex({ red, green, blue }: Rgb): string {
  return `#${channelHex(red)}${channelHex(green)}${channelHex(blue)}`;
}

function channelHex(value: number): string {
  return value.toString(16).padStart(2, '0');
}

function colorDistance(first: Rgb, second: Rgb): number {
  return (
    (first.red - second.red) ** 2 +
    (first.green - second.green) ** 2 +
    (first.blue - second.blue) ** 2
  );
}

function nearestPaletteColor(target: Rgb, palette: readonly AnsiColor[]): AnsiColor {
  const first = palette[0];
  if (first === undefined) throw new Error('terminal color palette must not be empty');
  let nearest = first;
  let nearestDistance = colorDistance(target, first.rgb);
  for (const candidate of palette.slice(1)) {
    const distance = colorDistance(target, candidate.rgb);
    // Stable lower-index tie-breaking makes fallback output reproducible.
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function relativeLuminance({ red, green, blue }: Rgb): number {
  const linear = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
}

function buildAnsi256Palette(): readonly AnsiColor[] {
  const colors: AnsiColor[] = ANSI_16.map((color) => ({ ...color }));
  for (let red = 0; red < 6; red += 1) {
    for (let green = 0; green < 6; green += 1) {
      for (let blue = 0; blue < 6; blue += 1) {
        const index = 16 + red * 36 + green * 6 + blue;
        colors.push({
          index,
          name: `ansi256(${String(index)})`,
          rgb: {
            red: XTERM_CHANNELS[red] ?? 0,
            green: XTERM_CHANNELS[green] ?? 0,
            blue: XTERM_CHANNELS[blue] ?? 0,
          },
        });
      }
    }
  }
  for (let offset = 0; offset < 24; offset += 1) {
    const index = 232 + offset;
    const channel = 8 + offset * 10;
    colors.push({
      index,
      name: `ansi256(${String(index)})`,
      rgb: { red: channel, green: channel, blue: channel },
    });
  }
  return colors;
}
