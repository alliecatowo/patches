import { Box, Text } from 'ink';
import type { ReactElement, ReactNode } from 'react';

import { planResponsiveLayout } from '../app/responsive-layout.js';
import { sanitizeForTerminal } from '../format/sanitize.js';

export type FocusedPane = 'primary' | 'secondary';

export interface SplitPaneProps {
  width: number;
  height: number;
  primary: ReactNode;
  secondary: ReactNode;
  focusedPane: FocusedPane;
  primaryTitle?: string;
  secondaryTitle?: string;
  requestedSplit: boolean;
}

/** A fixed-budget presentation primitive; it owns no navigation or input state. */
export function SplitPane({
  width,
  height,
  primary,
  secondary,
  focusedPane,
  primaryTitle,
  secondaryTitle,
  requestedSplit,
}: SplitPaneProps): ReactElement {
  const plan = planResponsiveLayout(width, height, requestedSplit);

  return (
    <Box
      width={plan.contentColumns}
      height={plan.contentRows}
      flexDirection="row"
      flexShrink={0}
      overflow="hidden"
    >
      <Pane
        width={plan.leftWidth}
        height={plan.contentRows}
        title={primaryTitle ?? 'Primary'}
        focused={plan.mode === 'single' || focusedPane === 'primary'}
      >
        {primary}
      </Pane>
      {plan.mode === 'split' ? (
        <>
          <Separator height={plan.contentRows} />
          <Pane
            width={plan.rightWidth}
            height={plan.contentRows}
            title={secondaryTitle ?? 'Secondary'}
            focused={focusedPane === 'secondary'}
          >
            {secondary}
          </Pane>
        </>
      ) : null}
    </Box>
  );
}

function Pane({
  width,
  height,
  title,
  focused,
  children,
}: {
  width: number;
  height: number;
  title: string;
  focused: boolean;
  children: ReactNode;
}): ReactElement {
  const safeTitle = sanitizeForTerminal(title).replaceAll('\n', ' ');
  const bodyRows = Math.max(0, height - 1);

  return (
    <Box width={width} height={height} flexDirection="column" flexShrink={0} overflow="hidden">
      {height > 0 ? (
        <Box width={width} height={1} flexShrink={0} overflow="hidden">
          <Text wrap="truncate-end">
            {focused ? '>' : ' '} {safeTitle}
          </Text>
        </Box>
      ) : null}
      {bodyRows > 0 ? (
        <Box
          width={width}
          height={bodyRows}
          flexDirection="column"
          flexShrink={0}
          overflow="hidden"
        >
          {children}
        </Box>
      ) : null}
    </Box>
  );
}

function Separator({ height }: { height: number }): ReactElement {
  const rule = Array.from({ length: height }, () => '│').join('\n');

  return (
    <Box width={1} height={height} flexShrink={0} overflow="hidden">
      <Text>{rule}</Text>
    </Box>
  );
}
