import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';

import { PlainModeProvider } from '../theme/plain-mode.js';
import { extractMentions, RichBody, tokenizeBody } from './rich-text.js';

describe('tokenizeBody', () => {
  it('picks out mentions and tags, leaving everything else alone', () => {
    expect(tokenizeBody('hi @alice check #terminal out')).toEqual([
      { kind: 'text', text: 'hi ' },
      { kind: 'mention', text: '@alice' },
      { kind: 'text', text: ' check ' },
      { kind: 'tag', text: '#terminal' },
      { kind: 'text', text: ' out' },
    ]);
  });

  it('ignores an all-digit hashtag (§181: #2026 is not a tag)', () => {
    expect(tokenizeBody('see you in #2026')).toEqual([{ kind: 'text', text: 'see you in #2026' }]);
  });

  it('ignores a handle shorter than the server would notify (spec §22: 3–30)', () => {
    expect(tokenizeBody('@ab is not a mention')).toEqual([
      { kind: 'text', text: '@ab is not a mention' },
    ]);
  });

  it('returns one plain run for text with nothing to highlight', () => {
    expect(tokenizeBody('nothing here')).toEqual([{ kind: 'text', text: 'nothing here' }]);
  });
});

describe('extractMentions', () => {
  it('lists distinct handles in first-appearance order, lowercased', () => {
    expect(extractMentions('@Bob and @alice and @bob again')).toEqual(['bob', 'alice']);
  });

  it('is empty for a body with no mentions', () => {
    expect(extractMentions('just words')).toEqual([]);
  });
});

describe('RichBody', () => {
  it('renders the same characters in plain mode, with no colour (spec §173)', () => {
    const decorated = render(
      <PlainModeProvider plain={false}>
        <RichBody text="hi @alice #tag" />
      </PlainModeProvider>,
    );
    const plain = render(
      <PlainModeProvider plain>
        <RichBody text="hi @alice #tag" />
      </PlainModeProvider>,
    );
    // Same text either way…
    expect(plain.lastFrame()).toContain('hi @alice #tag');
    expect(decorated.lastFrame()).toContain('@alice');
    // …but only the decorated one carries escape codes.
    expect(plain.lastFrame()).not.toContain('[');
    expect(decorated.lastFrame()).toContain('[');
    decorated.unmount();
    plain.unmount();
  });
});
