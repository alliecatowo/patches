import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';

import { ErrorBoundary } from './ErrorBoundary.js';
import { resolvePageTheme } from '../pages/render/theme.js';

function Boom(): never {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  it('renders children normally', () => {
    const { lastFrame } = render(
      <ErrorBoundary>
        <Text>fine</Text>
      </ErrorBoundary>,
    );
    expect(lastFrame()).toBe('fine');
  });

  it('shows a fallback instead of crashing when a child throws', () => {
    const { lastFrame } = render(
      <ErrorBoundary message="could not be displayed">
        <Boom />
      </ErrorBoundary>,
    );
    expect(lastFrame()).toContain('could not be displayed');
  });
});

describe('hostile page theme', () => {
  it('drops a non-colour accent and renders safely through Ink', () => {
    const resolved = resolvePageTheme({ accent: 'level' }, false);
    expect(resolved.accent).toBeUndefined();
    const { lastFrame } = render(
      <Text {...(resolved.accent === undefined ? {} : { color: resolved.accent })}>ok</Text>,
    );
    expect(lastFrame()).toBe('ok');
  });
});
