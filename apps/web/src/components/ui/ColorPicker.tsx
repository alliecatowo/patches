import { useId, useState, type JSX } from 'react';

import { EyeDropperIcon } from '../icons/Icons.js';
import styles from './ColorPicker.module.css';

export interface ColorPickerProps {
  readonly label: string;
  /** A hex colour (`#abc` or `#aabbcc`), or `''` for unset. Controlled — this component never
   * owns the value, only proposes a next one through `onChange`. */
  readonly value: string;
  /** Only called with a hex string that already passes validation — a caller never has to
   * re-validate what it's handed. */
  readonly onChange: (hex: string) => void;
  /** Quick picks, usually the node's theme accents. Empty renders no swatch row. */
  readonly swatches?: readonly string[];
  readonly placeholder?: string;
  readonly id?: string;
}

const HEX_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** `<input type=color>` requires a 7-character `#rrggbb` value — this expands the shorthand
 * 3-digit form and falls back to black for anything not yet valid, so the native swatch never
 * throws on a draft keystroke. */
function toNativeColorValue(hex: string): string {
  if (!HEX_PATTERN.test(hex)) return '#000000';
  if (hex.length === 4) {
    const [, r, g, b] = hex;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return hex;
}

interface EyeDropperResult {
  readonly sRGBHex: string;
}

interface EyeDropperCtor {
  new (): { open: () => Promise<EyeDropperResult> };
}

function getEyeDropperCtor(): EyeDropperCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;
}

/**
 * Hex colour input with a live swatch, the browser's native colour wheel, theme swatches and
 * the EyeDropper API where the browser supports it (#325). Every path — typed hex, wheel,
 * swatch, eyedropper — converges on the same `onChange(hex)` call, so a caller only ever
 * handles one shape.
 */
export function ColorPicker({
  label,
  value,
  onChange,
  swatches = [],
  placeholder = '#6b46c1',
  id,
}: ColorPickerProps): JSX.Element {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [draft, setDraft] = useState(value);

  // The caller can reset the value out from under an in-progress edit (e.g. loading the
  // actor after this component already mounted) — re-sync from `value`, never the reverse.
  // Adjusted during render (React's documented pattern), not a `useEffect`: a synchronous
  // `setState` in an effect body is the cascading-render anti-pattern
  // `react-hooks/set-state-in-effect` flags.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setDraft(value);
  }

  const isValid = draft === '' || HEX_PATTERN.test(draft);
  const eyeDropperCtor = getEyeDropperCtor();

  function commit(next: string): void {
    setDraft(next);
    if (HEX_PATTERN.test(next)) onChange(next);
  }

  async function pickFromScreen(): Promise<void> {
    if (eyeDropperCtor === undefined) return;
    try {
      const result = await new eyeDropperCtor().open();
      commit(result.sRGBHex);
    } catch {
      // The user cancelled the picker (Escape, or clicking away) — no colour change, and
      // the spec's own promise rejection carries nothing worth surfacing.
    }
  }

  return (
    <div className={styles['picker']}>
      <label htmlFor={inputId} className={styles['label']}>
        {label}
      </label>
      <div className={styles['row']}>
        <span
          className={styles['preview']}
          style={{ background: isValid && draft !== '' ? draft : 'transparent' }}
          aria-hidden="true"
        />
        <input
          id={inputId}
          type="text"
          className={styles['hexInput']}
          value={draft}
          placeholder={placeholder}
          onChange={(event) => commit(event.target.value)}
          aria-invalid={!isValid}
          spellCheck={false}
          autoComplete="off"
        />
        <input
          type="color"
          className={styles['nativeInput']}
          value={toNativeColorValue(draft)}
          onChange={(event) => commit(event.target.value)}
          aria-label={`${label}: choose from colour wheel`}
        />
        {eyeDropperCtor === undefined ? null : (
          <button
            type="button"
            className={styles['eyedropper']}
            onClick={() => void pickFromScreen()}
            aria-label={`${label}: pick colour from screen`}
            title="Pick colour from screen"
          >
            <EyeDropperIcon size={16} />
          </button>
        )}
      </div>
      {isValid ? null : (
        <p className={styles['error']} role="alert">
          Enter a hex colour like #6b46c1.
        </p>
      )}
      {swatches.length === 0 ? null : (
        <div className={styles['swatches']} role="group" aria-label={`${label} swatches`}>
          {swatches.map((swatch) => (
            <button
              key={swatch}
              type="button"
              className={`${styles['swatch']} ${
                draft.toLowerCase() === swatch.toLowerCase() ? styles['swatchSelected'] : ''
              }`}
              style={{ background: swatch }}
              onClick={() => commit(swatch)}
              aria-label={`Use ${swatch}`}
              title={swatch}
            />
          ))}
        </div>
      )}
    </div>
  );
}
