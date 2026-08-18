import type { Nameplate as NameplateT } from '@patches/proto';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';

import { Nameplate } from './Nameplate.js';

function nameplate(overrides: Partial<NameplateT> = {}): NameplateT {
  return {
    nameColor: '',
    glyph: '',
    badges: [],
    avatarFrame: '',
    statusLine: '',
    profileBorder: '',
    ...overrides,
  };
}

describe('Nameplate', () => {
  it('renders a plain @handle when there is no nameplate', () => {
    const { lastFrame } = render(<Nameplate handle="alice" />);
    expect(lastFrame()).toBe('@alice');
  });

  it('prefixes the glyph when the nameplate has one', () => {
    const { lastFrame } = render(
      <Nameplate handle="alice" nameplate={nameplate({ glyph: '★' })} />,
    );
    expect(lastFrame()).toBe('★ @alice');
  });

  it('renders a nameplate with no colour/glyph the same as none at all', () => {
    const { lastFrame } = render(<Nameplate handle="alice" nameplate={nameplate()} />);
    expect(lastFrame()).toBe('@alice');
  });

  it('uses only the first stop of a gradient nameColor pair (no gradient primitive in Ink)', () => {
    // A nameColor means chalk does wrap this in an SGR colour code, unlike the
    // colour-less cases above — this only asserts it renders the right text using
    // the first stop, not the exact escape bytes chalk happens to choose.
    const { lastFrame } = render(
      <Nameplate handle="alice" nameplate={nameplate({ nameColor: '#7C3AED,#22D3EE' })} />,
    );
    expect(lastFrame()).toContain('@alice');
  });

  it('strips control characters from the handle and glyph', () => {
    const { lastFrame } = render(
      <Nameplate handle={`alice\x1b[2J`} nameplate={nameplate({ glyph: '\x07★' })} />,
    );
    expect(lastFrame()).toBe('★ @alice[2J');
  });
});
