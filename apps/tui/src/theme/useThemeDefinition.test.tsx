import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { setActiveTheme, useThemeDefinition } from './index.js';
import { BUILT_IN_THEMES } from './themes/registry.js';

function ActiveThemeName(): ReturnType<typeof Text> {
  const definition = useThemeDefinition();
  return <Text>{definition.name}</Text>;
}

describe('useThemeDefinition', () => {
  afterEach(() => {
    setActiveTheme(BUILT_IN_THEMES.patches);
  });

  it('re-renders a subscribed component when setActiveTheme runs', async () => {
    const { lastFrame, unmount } = render(<ActiveThemeName />);
    expect(lastFrame()).toBe('patches');

    setActiveTheme(BUILT_IN_THEMES.hacker);
    await vi.waitFor(() => expect(lastFrame()).toBe('hacker'));

    unmount();
  });
});
