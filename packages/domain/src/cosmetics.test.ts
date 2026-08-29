import { describe, expect, it } from 'vitest';

import {
  DEFAULT_COSMETIC_CAPS,
  avatarFrameToken,
  deterministicIdentityArt,
  nameTagToken,
  popEmphasis,
  type CosmeticsNameTag,
  type CosmeticsProfileFrame,
  type IdentityArtMotif,
} from './cosmetics.js';

const ALL_FRAMES: readonly CosmeticsProfileFrame[] = ['none', 'border', 'glow', 'gradient'];
const ALL_NAME_TAGS: readonly CosmeticsNameTag[] = ['none', 'badge', 'ribbon', 'pilled'];
const ALL_MOTIFS: readonly IdentityArtMotif[] = ['⌁', '◫', '∿', '✦', '◍', '⤫'];

/** A deterministic spread of handles + hostile strings the deterministic-art tests loop over
 * in place of a property runner (kept dependency-light; fast-check is not a domain dep). */
const SAMPLE_SEEDS: readonly string[] = [
  'alice',
  'bob',
  'carol',
  'Émile',
  'dev-계정',
  'x',
  '1234567890',
  'aaaaaaaaaaaaaaaaaaaaaa',
  '\x1b[31mred\x1b[0m',
  '\u202eback\u202d',
];

describe('avatarFrameToken', () => {
  it('keeps a frame verbatim with full capabilities', () => {
    for (const frame of ALL_FRAMES) {
      expect(avatarFrameToken(frame, DEFAULT_COSMETIC_CAPS)).toBe(frame);
    }
  });

  it('strips everything under plain capabilities', () => {
    const plain = { ...DEFAULT_COSMETIC_CAPS, plain: true };
    for (const frame of ALL_FRAMES) {
      expect(avatarFrameToken(frame, plain)).toBe('none');
    }
  });

  it('treats a terminal with no colour like plain', () => {
    const none = { ...DEFAULT_COSMETIC_CAPS, colorDepth: 'none' as const };
    for (const frame of ALL_FRAMES) {
      expect(avatarFrameToken(frame, none)).toBe('none');
    }
  });

  it('forces the unambiguous border under high contrast', () => {
    const hi = { ...DEFAULT_COSMETIC_CAPS, highContrast: true };
    for (const frame of ['border', 'glow', 'gradient'] as const) {
      expect(avatarFrameToken(frame, hi)).toBe('border');
    }
    // 'none' stays 'none' even when contrast is demanding.
    expect(avatarFrameToken('none', hi)).toBe('none');
  });

  it('keeps glow at reduced colour depth (no exact hex needed)', () => {
    const lowDepth = { ...DEFAULT_COSMETIC_CAPS, colorDepth: '16' as const };
    expect(avatarFrameToken('glow', lowDepth)).toBe('glow');
    expect(avatarFrameToken('gradient', lowDepth)).toBe('gradient');
  });

  it('never returns a token outside the allow-list', () => {
    for (const frame of ALL_FRAMES) {
      for (const plain of [false, true]) {
        const result = avatarFrameToken(frame, {
          plain,
          highContrast: false,
          reducedMotion: false,
          colorDepth: 'truecolor',
        });
        expect(ALL_FRAMES).toContain(result);
      }
    }
  });
});

describe('nameTagToken', () => {
  it('keeps a style verbatim with full capabilities', () => {
    for (const style of ALL_NAME_TAGS) {
      expect(nameTagToken(style, DEFAULT_COSMETIC_CAPS)).toBe(style);
    }
  });

  it('strips everything under plain capabilities', () => {
    const plain = { ...DEFAULT_COSMETIC_CAPS, plain: true };
    for (const style of ALL_NAME_TAGS) {
      expect(nameTagToken(style, plain)).toBe('none');
    }
  });

  it('is untouched by reduced motion (a name tag is static)', () => {
    const rm = { ...DEFAULT_COSMETIC_CAPS, reducedMotion: true };
    for (const style of ALL_NAME_TAGS) {
      expect(nameTagToken(style, rm)).toBe(style);
    }
  });
});

describe('popEmphasis', () => {
  it('is on with full capabilities', () => {
    expect(popEmphasis(DEFAULT_COSMETIC_CAPS)).toBe(true);
  });

  it('turns off under reduced motion (honor the preference)', () => {
    expect(popEmphasis({ ...DEFAULT_COSMETIC_CAPS, reducedMotion: true })).toBe(false);
  });

  it('turns off under plain', () => {
    expect(popEmphasis({ ...DEFAULT_COSMETIC_CAPS, plain: true })).toBe(false);
  });

  it('turns off under high contrast (a pulse is ambiguous emphasis)', () => {
    expect(popEmphasis({ ...DEFAULT_COSMETIC_CAPS, highContrast: true })).toBe(false);
  });

  it('turns off with no terminal colour', () => {
    expect(popEmphasis({ ...DEFAULT_COSMETIC_CAPS, colorDepth: 'none' })).toBe(false);
  });

  it('stays on at 16-colour depth (pop needs no exact colour)', () => {
    expect(popEmphasis({ ...DEFAULT_COSMETIC_CAPS, colorDepth: '16' })).toBe(true);
  });
});

describe('deterministicIdentityArt', () => {
  it('is deterministic across calls and independent of call order', () => {
    const a = deterministicIdentityArt('alice');
    const b = deterministicIdentityArt('alice');
    expect(a).toEqual(b);
  });

  it('differs for different seeds', () => {
    const a = deterministicIdentityArt('alice');
    const b = deterministicIdentityArt('bob');
    // Two distinct seeds must not always collide (hash space is wide).
    expect(`${a.accent}-${a.motif}`).not.toBe(`${b.accent}-${b.motif}`);
  });

  it('is case-consistent (handle routing is case-insensitive)', () => {
    expect(deterministicIdentityArt('Alice')).toEqual(deterministicIdentityArt('alice'));
  });

  it('always returns a member of the closed motif allow-list', () => {
    for (const seed of SAMPLE_SEEDS) {
      const { motif } = deterministicIdentityArt(seed);
      expect(ALL_MOTIFS).toContain(motif);
    }
  });

  it('always returns a #RRGGBB accent that round-trips through the hex-bytes pattern', () => {
    for (const seed of SAMPLE_SEEDS) {
      const { accent } = deterministicIdentityArt(seed);
      expect(accent).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('no hostile seed can make the motif something else (closed allow-list)', () => {
    const hostile = '\x1b[31mred\x1b[0m\u202e';
    const { motif } = deterministicIdentityArt(hostile);
    expect(ALL_MOTIFS).toContain(motif);
  });
});
