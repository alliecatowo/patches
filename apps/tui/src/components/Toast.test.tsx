import { Text } from 'ink';
import { render } from 'ink-testing-library';
import type { ReactElement } from 'react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { autoClearMs, ToastLine, ToastProvider, useToast, type ToastKind } from './Toast.js';

type Command = { message: string; kind: ToastKind } | undefined;

function Harness({ command }: { command: Command }): ReactElement {
  const { toast, show, clear } = useToast();
  useEffect(() => {
    if (command === undefined) clear();
    else show(command.message, command.kind);
    // Fire exactly once per `command` identity change — the effect is the test's remote
    // control for the queue, not a per-render re-show.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- test remote control, not app code
  }, [command]);
  return (
    <>
      <ToastLine toast={toast} />
      <Text>{`state:${toast === undefined ? 'none' : toast.message}`}</Text>
    </>
  );
}

describe('ToastLine', () => {
  it('renders nothing for an empty toast', () => {
    const { lastFrame } = render(<ToastLine toast={undefined} />);
    expect(lastFrame()).toBe('');
  });

  it('renders the message with a role glyph', () => {
    const { lastFrame } = render(<ToastLine toast={{ message: 'liked', kind: 'success' }} />);
    expect(lastFrame()).toContain('liked');
  });
});

describe('autoClearMs', () => {
  it('gives error toasts twice as long as info/success (§6: 2.5s / 5s)', () => {
    expect(autoClearMs('error')).toBe(5000);
    expect(autoClearMs('info')).toBe(2500);
    expect(autoClearMs('success')).toBe(2500);
  });
});

describe('ToastProvider / useToast', () => {
  it('starts empty, shows, and replaces rather than stacking', async () => {
    const { lastFrame, rerender } = render(
      <ToastProvider>
        <Harness command={undefined} />
      </ToastProvider>,
    );
    await vi.waitFor(() => expect(lastFrame()).toContain('state:none'));

    rerender(
      <ToastProvider>
        <Harness command={{ message: 'first', kind: 'info' }} />
      </ToastProvider>,
    );
    await vi.waitFor(() => expect(lastFrame()).toContain('state:first'));

    // A second toast replaces the first — a queue of one, never a stack (§6).
    rerender(
      <ToastProvider>
        <Harness command={{ message: 'second', kind: 'error' }} />
      </ToastProvider>,
    );
    await vi.waitFor(() => expect(lastFrame()).toContain('state:second'));
    expect(lastFrame()).not.toContain('first');
  });

  it('clear() empties the queue immediately', async () => {
    const { lastFrame, rerender } = render(
      <ToastProvider>
        <Harness command={{ message: 'liked', kind: 'success' }} />
      </ToastProvider>,
    );
    await vi.waitFor(() => expect(lastFrame()).toContain('state:liked'));

    rerender(
      <ToastProvider>
        <Harness command={undefined} />
      </ToastProvider>,
    );
    await vi.waitFor(() => expect(lastFrame()).toContain('state:none'));
  });
});
