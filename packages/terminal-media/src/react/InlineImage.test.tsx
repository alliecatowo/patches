import { Box, Text } from 'ink';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';

import { buildPlaceholderGrid, PLACEHOLDER } from '../protocol/kitty.js';
import type { PreparedImage, TerminalMediaRenderer } from '../renderer.js';
import { InlineImage } from './InlineImage.js';
import { MediaRendererProvider, useMediaRenderer } from './context.js';

const ESC = '\x1b';

const IMAGE: PreparedImage = { id: 0x0a0b0c, cols: 6, rows: 3, widthPx: 60, heightPx: 60 };

/** A renderer stub: no I/O, just the real placeholder grid builder. */
const stubRenderer: TerminalMediaRenderer = {
  kind: 'kitty',
  prepare: () => Promise.resolve(IMAGE),
  placeholderRows: (img) => buildPlaceholderGrid(img.id, img.cols, img.rows),
  release: () => undefined,
  releaseAll: () => undefined,
};

function frameOf(node: Parameters<typeof render>[0]): string {
  const { lastFrame, unmount } = render(node);
  const frame = lastFrame() ?? '';
  unmount();
  return frame;
}

describe('InlineImage', () => {
  it('renders one line per image row, each of exactly cols placeholder cells', () => {
    const frame = frameOf(
      <MediaRendererProvider renderer={stubRenderer}>
        <InlineImage image={IMAGE} />
      </MediaRendererProvider>,
    );
    const lines = frame.split('\n');
    expect(lines).toHaveLength(IMAGE.rows);
    for (const line of lines) {
      const cells = [...line].filter((char) => char === PLACEHOLDER);
      expect(cells).toHaveLength(IMAGE.cols);
    }
  });

  it('passes the raw 24-bit foreground SGR through Ink untouched', () => {
    const frame = frameOf(
      <MediaRendererProvider renderer={stubRenderer}>
        <InlineImage image={IMAGE} />
      </MediaRendererProvider>,
    );
    // id 0x0A0B0C -> R=10, G=11, B=12.
    expect(frame).toContain(`${ESC}[38;2;10;11;12m`);
    expect(frame).toContain(`${ESC}[39m`);
  });

  it('keeps both diacritics on every cell after Ink lays the row out', () => {
    const frame = frameOf(
      <MediaRendererProvider renderer={stubRenderer}>
        <InlineImage image={IMAGE} />
      </MediaRendererProvider>,
    );
    const expected = buildPlaceholderGrid(IMAGE.id, IMAGE.cols, IMAGE.rows);
    for (const row of expected) expect(frame).toContain(row);
  });

  it('never ellipsises the grid, even squeezed next to other content', () => {
    const frame = frameOf(
      <MediaRendererProvider renderer={stubRenderer}>
        <Box width={10}>
          <InlineImage image={IMAGE} />
          <Text>xxxxxxxxxxxxxxxx</Text>
        </Box>
      </MediaRendererProvider>,
    );
    expect(frame).not.toContain('…');
    expect([...frame].filter((char) => char === PLACEHOLDER)).toHaveLength(IMAGE.cols * IMAGE.rows);
  });

  it('accepts an explicit renderer prop that overrides the context', () => {
    const other: TerminalMediaRenderer = {
      ...stubRenderer,
      kind: 'box',
      placeholderRows: () => ['[BOX]'],
    };
    const frame = frameOf(
      <MediaRendererProvider renderer={stubRenderer}>
        <InlineImage image={IMAGE} renderer={other} />
      </MediaRendererProvider>,
    );
    expect(frame).toContain('[BOX]');
    expect(frame).not.toContain(PLACEHOLDER);
  });
});

describe('useMediaRenderer', () => {
  it('exposes the provided renderer', () => {
    function Probe(): React.ReactNode {
      return <Text>{useMediaRenderer().kind}</Text>;
    }
    const frame = frameOf(
      <MediaRendererProvider renderer={stubRenderer}>
        <Probe />
      </MediaRendererProvider>,
    );
    expect(frame.trim()).toBe('kitty');
  });
});
