import { Box, Text } from 'ink';
import type { ReactElement } from 'react';

import type { ThemeColor, ThemeDefinition } from '../theme/themes/types.js';

export const THEME_PREVIEW_DIMENSIONS = Object.freeze({ width: 48, height: 8 });

export interface ThemePreviewProps {
  readonly theme: ThemeDefinition;
  readonly plain?: boolean;
}

function colorProps(color: ThemeColor, plain: boolean): { color?: string } {
  return plain || color === null ? {} : { color };
}

function backgroundProps(color: ThemeColor, plain: boolean): { backgroundColor?: string } {
  return plain || color === null ? {} : { backgroundColor: color };
}

/** A fixed-size, non-interactive sample used by theme and preference pickers. */
export function ThemePreview({ theme, plain = false }: ThemePreviewProps): ReactElement {
  const { colors } = theme;
  const outerBackground =
    theme.backgroundMode === 'terminal' ? {} : backgroundProps(colors.background, plain);
  const divider = plain || theme.preferredGlyphSet === 'ascii' ? '-' : '─';

  return (
    <Box
      width={THEME_PREVIEW_DIMENSIONS.width}
      height={THEME_PREVIEW_DIMENSIONS.height}
      flexDirection="column"
      overflow="hidden"
      {...outerBackground}
    >
      <Box width={THEME_PREVIEW_DIMENSIONS.width} height={1} flexShrink={0} overflow="hidden">
        <Text {...colorProps(colors.accent, plain)}> Theme preview</Text>
      </Box>
      <Box width={THEME_PREVIEW_DIMENSIONS.width} height={1} flexShrink={0} overflow="hidden">
        <Text {...colorProps(colors.border, plain)}>
          {divider.repeat(THEME_PREVIEW_DIMENSIONS.width)}
        </Text>
      </Box>
      <Box width={THEME_PREVIEW_DIMENSIONS.width} height={1} flexShrink={0} overflow="hidden">
        <Text {...colorProps(colors.mention, plain)}> @alice</Text>
        <Text {...colorProps(colors.muted, plain)}> · 2m</Text>
      </Box>
      <Box width={THEME_PREVIEW_DIMENSIONS.width} height={1} flexShrink={0} overflow="hidden">
        <Text {...colorProps(colors.foreground, plain)}> A chronological post. </Text>
        <Text {...colorProps(colors.tag, plain)}>#patches</Text>
      </Box>
      <Box
        width={THEME_PREVIEW_DIMENSIONS.width}
        height={1}
        flexShrink={0}
        overflow="hidden"
        {...backgroundProps(colors.selection, plain)}
      >
        <Text {...colorProps(colors.foreground, plain)}> Selected: Open thread</Text>
      </Box>
      <Box width={THEME_PREVIEW_DIMENSIONS.width} height={1} flexShrink={0} overflow="hidden">
        <Text {...colorProps(colors.ok, plain)}> Status: connected</Text>
      </Box>
      <Box width={THEME_PREVIEW_DIMENSIONS.width} height={1} flexShrink={0} overflow="hidden">
        <Text {...colorProps(colors.error, plain)}> Error: Could not refresh</Text>
      </Box>
      <Box width={THEME_PREVIEW_DIMENSIONS.width} height={1} flexShrink={0} overflow="hidden">
        <Text {...colorProps(colors.muted, plain)}> Esc cancels preview</Text>
      </Box>
    </Box>
  );
}
