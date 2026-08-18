import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import type { PreparedImage, TerminalMediaRenderer } from '../renderer.js';
import { useOptionalMediaRenderer } from './context.js';

export interface InlineImageProps {
  /** Handle returned by `renderer.prepare()`. */
  image: PreparedImage;
  /** Renderer to draw with. Defaults to the nearest `<MediaRendererProvider>`. */
  renderer?: TerminalMediaRenderer;
}

/**
 * Draws a prepared image as a fixed-size block of text.
 *
 * Three rules are load-bearing (research doc §3), and breaking any of them corrupts the
 * placement rather than merely looking wrong:
 *
 * 1. `wrap="hard"` — never `truncate*`. `cli-truncate` appends U+2026, which replaces a
 *    placeholder cell and desynchronises every column after it.
 * 2. No `<Text color=…>`. Chalk emits its own `\x1b[39m` reset, which ends the colour
 *    run that encodes the image id. The row strings already carry raw SGR.
 * 3. An explicit `width` on the container, so Yoga can never reflow the grid.
 *
 * One `<Text>` per row (rather than one `<Text>` with newlines) keeps Ink's line differ
 * able to leave unchanged rows completely untouched.
 */
export function InlineImage({ image, renderer }: InlineImageProps): ReactNode {
  const contextRenderer = useOptionalMediaRenderer();
  const active = renderer ?? contextRenderer;
  if (active === undefined) {
    throw new Error(
      '<InlineImage> needs a renderer: pass one as a prop or wrap the tree in <MediaRendererProvider>',
    );
  }
  const rows = active.placeholderRows(image);

  return (
    <Box flexDirection="column" width={image.cols} height={rows.length} flexShrink={0}>
      {rows.map((row, index) => (
        // The array index is not an arbitrary key here: it IS the row coordinate, and
        // row N of an image is always row N.
        <Text key={`${image.id}:${index}`} wrap="hard">
          {row}
        </Text>
      ))}
    </Box>
  );
}
