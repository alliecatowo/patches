import { Box, Text, useInput, useStdin } from 'ink';
import { useRef, useState, type ReactElement, type ReactNode } from 'react';

import {
  nearestPickerColorIndex,
  normalizeHexColor,
  pickerColorAt,
  resolveTerminalColor,
  terminalContrastRatio,
  type TerminalColorTier,
} from '../../theme/color.js';

export const COLOR_PICKER_ROWS = 12;
export const MINIMUM_TEXT_CONTRAST = 4.5;

type ColorRole = 'foreground' | 'background';
type PickerField = 'palette' | 'hex';

export interface ColorPickerProps {
  /** Color in effect when the picker opens; Escape restores this preview value. */
  initialColor: string;
  /** The other half of the readable foreground/background pair. */
  comparisonColor: string;
  /** Whether this picker edits the preview's foreground or background. */
  role?: ColorRole;
  /** Selected by the caller from previously detected capabilities; this component never probes. */
  capabilityTier: TerminalColorTier;
  /** Receives valid live previews and the initial color again when Escape reverts them. */
  onChange: (color: string) => void;
  /** Receives the current valid color on Enter. */
  onCommit: (color: string) => void;
  /** Escape invokes this after reverting any live preview. */
  onCancel: () => void;
  /** Bypasses the text contrast floor only for colors that never carry readable text. */
  decorationOnly?: boolean;
  columns?: number;
  isActive?: boolean;
}

interface Validation {
  ratio: number;
  accepted: boolean;
}

/**
 * A fixed 12-row, keyboard-first color picker with a web-safe 216-swatch cube and exact hex entry.
 * The caller owns terminal capability detection and persistence; this component owns safe preview,
 * cancellation, and normal-text contrast enforcement.
 */
export function ColorPicker({
  initialColor,
  comparisonColor,
  role = 'foreground',
  capabilityTier,
  onChange,
  onCommit,
  onCancel,
  decorationOnly = false,
  columns = 72,
  isActive = true,
}: ColorPickerProps): ReactElement {
  const normalizedInitial = normalizeHexColor(initialColor) ?? '#000000';
  const normalizedComparison = normalizeHexColor(comparisonColor) ?? '#ffffff';
  const initialSelected = nearestPickerColorIndex(normalizedInitial);
  const initialRef = useRef(normalizedInitial);
  const candidateRef = useRef(normalizedInitial);
  const previewedRef = useRef(normalizedInitial);
  const selectedRef = useRef(initialSelected);
  const hexBufferRef = useRef(normalizedInitial);
  const hexDirtyRef = useRef(false);
  const fieldRef = useRef<PickerField>('palette');
  const [candidate, setCandidate] = useState(normalizedInitial);
  const [selected, setSelected] = useState(initialSelected);
  const [hexBuffer, setHexBuffer] = useState(normalizedInitial);
  const [field, setField] = useState<PickerField>('palette');
  const { isRawModeSupported } = useStdin();

  const validate = (color: string): Validation => {
    const foreground = role === 'foreground' ? color : normalizedComparison;
    const background = role === 'background' ? color : normalizedComparison;
    const ratio = terminalContrastRatio(foreground, background, capabilityTier);
    return { ratio, accepted: decorationOnly || ratio >= MINIMUM_TEXT_CONTRAST };
  };

  const applyCandidate = (nextColor: string): void => {
    candidateRef.current = nextColor;
    setCandidate(nextColor);
    hexBufferRef.current = nextColor;
    setHexBuffer(nextColor);
    const nextSelected = nearestPickerColorIndex(nextColor);
    selectedRef.current = nextSelected;
    setSelected(nextSelected);
    const validation = validate(nextColor);
    if (validation.accepted) {
      previewedRef.current = nextColor;
      onChange(nextColor);
    }
  };

  const movePalette = (rowDelta: number, columnDelta: number): void => {
    const row = Math.floor(selectedRef.current / 36);
    const column = selectedRef.current % 36;
    const nextRow = (row + rowDelta + 6) % 6;
    const nextColumn = (column + columnDelta + 36) % 36;
    applyCandidate(pickerColorAt(nextRow * 36 + nextColumn));
  };

  const updateHexBuffer = (nextBuffer: string): void => {
    hexBufferRef.current = nextBuffer;
    setHexBuffer(nextBuffer);
    const normalized = normalizeHexColor(nextBuffer);
    if (normalized !== null) applyCandidate(normalized);
  };

  useInput(
    (input, key) => {
      if (key.eventType === 'release') return;
      if (key.escape) {
        if (previewedRef.current !== initialRef.current) onChange(initialRef.current);
        onCancel();
        return;
      }
      if (key.tab) {
        const nextField = fieldRef.current === 'palette' ? 'hex' : 'palette';
        fieldRef.current = nextField;
        setField(nextField);
        hexDirtyRef.current = false;
        return;
      }
      if (key.return) {
        const normalized = normalizeHexColor(hexBufferRef.current);
        if (normalized === null) return;
        const validation = validate(candidateRef.current);
        if (!validation.accepted) return;
        previewedRef.current = candidateRef.current;
        onChange(candidateRef.current);
        onCommit(candidateRef.current);
        return;
      }

      if (fieldRef.current === 'palette') {
        if (key.leftArrow || input === 'h') movePalette(0, -1);
        else if (key.rightArrow || input === 'l') movePalette(0, 1);
        else if (key.upArrow || input === 'k') movePalette(-1, 0);
        else if (key.downArrow || input === 'j') movePalette(1, 0);
        return;
      }

      if (key.backspace || key.delete) {
        hexDirtyRef.current = true;
        updateHexBuffer(hexBufferRef.current.slice(0, -1));
        return;
      }
      let nextBuffer = hexBufferRef.current;
      let changed = false;
      for (const character of input) {
        if (character === '#') {
          nextBuffer = '#';
          hexDirtyRef.current = true;
          changed = true;
          continue;
        }
        if (!/[\da-f]/i.test(character)) continue;
        if (!hexDirtyRef.current) {
          nextBuffer = '#';
          hexDirtyRef.current = true;
        }
        if (nextBuffer.length < 7) {
          nextBuffer += character.toLowerCase();
          changed = true;
        }
      }
      if (changed) updateHexBuffer(nextBuffer);
    },
    { isActive: isActive && isRawModeSupported },
  );

  const width = Math.max(1, Math.trunc(columns));
  const validation = validate(candidate);
  const exactHex = normalizeHexColor(hexBuffer);
  const resolved = resolveTerminalColor(candidate, capabilityTier);
  const foregroundHex = role === 'foreground' ? candidate : normalizedComparison;
  const backgroundHex = role === 'background' ? candidate : normalizedComparison;
  const foreground = resolveTerminalColor(foregroundHex, capabilityTier);
  const background = resolveTerminalColor(backgroundHex, capabilityTier);
  const tierLabel = terminalTierLabel(capabilityTier);
  const error =
    exactHex === null
      ? 'Rejected: enter exactly #rrggbb (six hex digits).'
      : validation.accepted
        ? decorationOnly
          ? 'Decoration only: readable-text contrast check bypassed.'
          : 'Valid for normal text.'
        : `Rejected: ${validation.ratio.toFixed(2)}:1 is below 4.50:1 for normal text.`;

  return (
    <Box
      aria-label="Color picker"
      flexDirection="column"
      flexShrink={0}
      height={COLOR_PICKER_ROWS}
      width={width}
      overflow="hidden"
    >
      <SingleRow width={width}>
        <Text bold={capabilityTier !== 'text'}>Color picker</Text>
        <Text> · {tierLabel}</Text>
      </SingleRow>
      <SingleRow width={width}>
        <Text>
          {field === 'palette' ? '>' : ' '} palette · {field === 'hex' ? '>' : ' '} hex {hexBuffer}
          {' · '}current {candidate} · output {resolved.label}
        </Text>
      </SingleRow>
      {Array.from({ length: 6 }, (_, row) => (
        <SingleRow width={width} key={row}>
          {Array.from({ length: 36 }, (_, column) => {
            const index = row * 36 + column;
            const color = pickerColorAt(index);
            return (
              <Swatch
                capabilityTier={capabilityTier}
                color={color}
                key={color}
                selected={index === selected}
              />
            );
          })}
        </SingleRow>
      ))}
      <SingleRow width={width}>
        <Text>Preview: </Text>
        <Text
          {...colorProperty(foreground.inkColor, 'color')}
          {...colorProperty(background.inkColor, 'backgroundColor')}
        >
          Aa readable text
        </Text>
        <Text>
          {' '}
          fg {foregroundHex} / bg {backgroundHex}
        </Text>
      </SingleRow>
      <SingleRow width={width}>
        <Text>
          Contrast: {validation.ratio.toFixed(2)}:1 · minimum {MINIMUM_TEXT_CONTRAST.toFixed(2)}:1
        </Text>
      </SingleRow>
      <SingleRow width={width}>
        <Text {...colorProperty(capabilityTier === 'text' ? null : 'red', 'color')}>{error}</Text>
      </SingleRow>
      <SingleRow width={width}>
        <Text>Arrows/hjkl move · Tab field · Enter save · Esc cancel</Text>
      </SingleRow>
    </Box>
  );
}

function SingleRow({ width, children }: { width: number; children: ReactNode }): ReactElement {
  return (
    <Box flexDirection="row" flexShrink={0} height={1} width={width} overflow="hidden">
      {children}
    </Box>
  );
}

function Swatch({
  color,
  selected,
  capabilityTier,
}: {
  color: string;
  selected: boolean;
  capabilityTier: TerminalColorTier;
}): ReactElement {
  if (capabilityTier === 'text') return <Text>{selected ? '◆' : '·'}</Text>;
  const background = resolveTerminalColor(color, capabilityTier);
  const markerColor =
    terminalContrastRatio('#000000', color, capabilityTier) >=
    terminalContrastRatio('#ffffff', color, capabilityTier)
      ? '#000000'
      : '#ffffff';
  const foreground = resolveTerminalColor(markerColor, capabilityTier);
  return (
    <Text
      {...colorProperty(foreground.inkColor, 'color')}
      {...colorProperty(background.inkColor, 'backgroundColor')}
    >
      {selected ? '◆' : ' '}
    </Text>
  );
}

function colorProperty(
  color: string | null,
  property: 'color' | 'backgroundColor',
): { color?: string; backgroundColor?: string } {
  if (color === null) return {};
  return property === 'color' ? { color } : { backgroundColor: color };
}

function terminalTierLabel(tier: TerminalColorTier): string {
  if (tier === 'ansi256') return '256-color';
  if (tier === 'ansi16') return '16-color';
  if (tier === 'text') return 'text only';
  return 'truecolor';
}
