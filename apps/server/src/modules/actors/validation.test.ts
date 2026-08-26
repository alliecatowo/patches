import { describe, expect, it } from 'vitest';

import { AppError } from '../../common/errors/app-error.js';
import { nameplateInputSchema, parseInput } from './validation.js';

/**
 * `nameplate.name_color` (spec §173) reaches the web client's `linear-gradient(...)`/`color`
 * CSS verbatim (`apps/web/src/components/Nameplate.tsx`) — B-136b closes the gap where only
 * length was checked, letting any string through to that render sink.
 */
describe('nameplateInputSchema name_color (§173, B-136b)', () => {
  it('accepts a single #RRGGBB stop', () => {
    const parsed = parseInput(nameplateInputSchema, { nameColor: '#7C3AED' });
    expect(parsed.nameColor).toBe('#7C3AED');
  });

  it('accepts a two-stop gradient pair', () => {
    const parsed = parseInput(nameplateInputSchema, { nameColor: '#7C3AED,#22D3EE' });
    expect(parsed.nameColor).toBe('#7C3AED,#22D3EE');
  });

  it('accepts an empty string (clears the field)', () => {
    const parsed = parseInput(nameplateInputSchema, { nameColor: '' });
    expect(parsed.nameColor).toBe('');
  });

  it.each([
    'red',
    'rgb(0,0,0)',
    'var(--evil)',
    'url(javascript:alert(1))',
    '#7C3AED; background: url(x)',
    '#7C3AED,#22D3EE,#000000',
    '#GGGGGG',
    '#7C3AE',
  ])('rejects a non-allowlisted value %j', (nameColor) => {
    expect(() => parseInput(nameplateInputSchema, { nameColor })).toThrow(AppError);
  });
});
