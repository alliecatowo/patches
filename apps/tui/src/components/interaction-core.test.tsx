import type { Key } from 'ink';
import { render } from 'ink-testing-library';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { stripSgr } from '../../test/ansi.js';
import { CommandHistory } from '../app/commands.js';
import { createKeyLayerStack, KeyLayerProvider } from '../app/input.js';
import { ContentSizeProvider } from '../app/layout.js';
import { CommandPalette, type PaletteInvocation } from './CommandPalette.js';
import { ConfirmDialog } from './ConfirmDialog.js';

function key(overrides: Partial<Key> = {}): Key {
  return {
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    pageDown: false,
    pageUp: false,
    home: false,
    end: false,
    return: false,
    escape: false,
    ctrl: false,
    shift: false,
    tab: false,
    backspace: false,
    delete: false,
    meta: false,
    super: false,
    hyper: false,
    capsLock: false,
    numLock: false,
    ...overrides,
  };
}

async function dispatch(
  stack: ReturnType<typeof createKeyLayerStack>,
  input: string,
  pressed = key(),
): Promise<void> {
  await act(async () => {
    stack.dispatch(input, pressed);
    await Promise.resolve();
  });
}

describe('ConfirmDialog', () => {
  it('is exactly three rows and Esc closes only the modal action', async () => {
    const stack = createKeyLayerStack();
    const cancel = vi.fn();
    const confirm = vi.fn();
    const view = render(
      <KeyLayerProvider stack={stack}>
        <ConfirmDialog
          id="delete"
          title="Delete post?"
          body="This cannot be undone."
          onConfirm={confirm}
          onCancel={cancel}
        />
      </KeyLayerProvider>,
    );
    await act(() => Promise.resolve());
    expect(stripSgr(view.lastFrame() ?? '').split('\n')).toEqual([
      'Delete post?',
      'This cannot be undone.',
      '[y/n]',
    ]);
    await dispatch(stack, '', key({ escape: true }));
    expect(cancel).toHaveBeenCalledOnce();
    expect(confirm).not.toHaveBeenCalled();
    view.unmount();
  });
});

describe('CommandPalette', () => {
  it('runs exact aliases and fuzzy KEYMAP entries through one callback', async () => {
    const stack = createKeyLayerStack();
    const invocations: PaletteInvocation[] = [];
    const history = new CommandHistory();
    const view = render(
      <ContentSizeProvider size={{ rows: 14, columns: 80 }}>
        <KeyLayerProvider stack={stack}>
          <CommandPalette
            screen="home"
            authenticated
            history={history}
            onInvoke={(invocation) => invocations.push(invocation)}
            onError={vi.fn()}
            onClose={vi.fn()}
          />
        </KeyLayerProvider>
      </ContentSizeProvider>,
    );
    await act(() => Promise.resolve());
    for (const character of 'home') await dispatch(stack, character);
    await dispatch(stack, '', key({ return: true }));
    expect(invocations[0]).toMatchObject({ source: 'command', alias: { name: 'home' } });
    expect(history.entries()).toEqual(['home']);
    view.unmount();

    const fuzzyStack = createKeyLayerStack();
    const fuzzy = render(
      <ContentSizeProvider size={{ rows: 14, columns: 80 }}>
        <KeyLayerProvider stack={fuzzyStack}>
          <CommandPalette
            screen="home"
            authenticated
            history={new CommandHistory()}
            onInvoke={(invocation) => invocations.push(invocation)}
            onError={vi.fn()}
            onClose={vi.fn()}
          />
        </KeyLayerProvider>
      </ContentSizeProvider>,
    );
    await act(() => Promise.resolve());
    for (const character of 'rep') await dispatch(fuzzyStack, character);
    await dispatch(fuzzyStack, '', key({ return: true }));
    expect(invocations[1]).toMatchObject({ source: 'palette', binding: { keys: 'R' } });
    fuzzy.unmount();
  });

  it('Tab completes aliases and Up recalls command history', async () => {
    const stack = createKeyLayerStack();
    const history = new CommandHistory();
    history.add('search cats');
    const view = render(
      <ContentSizeProvider size={{ rows: 14, columns: 80 }}>
        <KeyLayerProvider stack={stack}>
          <CommandPalette
            screen="home"
            authenticated
            history={history}
            onInvoke={vi.fn()}
            onError={vi.fn()}
            onClose={vi.fn()}
          />
        </KeyLayerProvider>
      </ContentSizeProvider>,
    );
    await act(() => Promise.resolve());
    await dispatch(stack, 's');
    await dispatch(stack, 'e');
    await dispatch(stack, '', key({ tab: true }));
    expect(view.lastFrame()).toContain(':search █');
    await dispatch(stack, '', key({ upArrow: true }));
    expect(view.lastFrame()).toContain(':search cats█');
    view.unmount();
  });
});
