import type { Key } from 'ink';
import { render } from 'ink-testing-library';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { paletteBindings, filterPaletteBindings, type Command } from '../app/commands.js';
import { createKeyLayerStack, KeyLayerProvider } from '../app/input.js';
import { ContentSizeProvider } from '../app/layout.js';
import { CommandPalette, type CommandPaletteProps } from './CommandPalette.js';

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

function baseProps(overrides: Partial<CommandPaletteProps> = {}): CommandPaletteProps {
  return {
    screen: 'home',
    authenticated: true,
    history: { add: vi.fn(), entries: () => [] } as unknown as CommandPaletteProps['history'],
    onInvoke: vi.fn(),
    onError: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

function renderPalette(props: CommandPaletteProps) {
  const stack = createKeyLayerStack();
  const view = render(
    <KeyLayerProvider stack={stack}>
      <ContentSizeProvider size={{ rows: 24, columns: 90 }}>
        <CommandPalette {...props} />
      </ContentSizeProvider>
    </KeyLayerProvider>,
  );
  return { stack, ...view };
}

describe('CommandPalette contextual commands (P12-116)', () => {
  it('lists contextual commands ahead of KEYMAP bindings', () => {
    const commands: Command[] = [
      { id: 'reply', label: 'Reply to this post', hint: 'r', run: vi.fn() },
    ];
    const { lastFrame } = renderPalette(baseProps({ contextualCommands: commands }));
    const frame = lastFrame() ?? '';
    const replyLine = frame.split('\n').findIndex((line) => line.includes('Reply to this post'));
    expect(replyLine).toBeGreaterThan(-1);
    // Every KEYMAP binding line comes after every contextual command line.
    const firstBindingLine = frame
      .split('\n')
      .findIndex((line) => /\(\S/.test(line) && !line.includes('Reply to this post'));
    if (firstBindingLine >= 0) expect(replyLine).toBeLessThan(firstBindingLine);
  });

  it('fuzzy-filters contextual commands the same way KEYMAP bindings are filtered', async () => {
    const run = vi.fn();
    const commands: Command[] = [{ id: 'open-bob', label: 'Open @bob', hint: '', run }];
    const { stack, lastFrame } = renderPalette(baseProps({ contextualCommands: commands }));
    for (const character of 'bob') {
      await dispatch(stack, character);
    }
    expect(lastFrame() ?? '').toContain('Open @bob');
    // A query this specific leaves the contextual command as the only, top match —
    // pressing Enter runs it directly, proving the filter (not just the render) saw it.
    await dispatch(stack, '', key({ return: true }));
    expect(run).toHaveBeenCalledOnce();
  });

  it('Enter on a selected contextual command runs it and closes without onInvoke', async () => {
    const run = vi.fn();
    const onInvoke = vi.fn();
    const onClose = vi.fn();
    const commands: Command[] = [{ id: 'reply', label: 'Reply', hint: 'r', run }];
    const { stack } = renderPalette(baseProps({ contextualCommands: commands, onInvoke, onClose }));
    await dispatch(stack, '', key({ return: true }));
    expect(run).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onInvoke).not.toHaveBeenCalled();
  });

  it('j/k selection spans the merged contextual + KEYMAP list', async () => {
    const run = vi.fn();
    const onInvoke = vi.fn();
    const commands: Command[] = [{ id: 'reply', label: 'Reply', hint: 'r', run }];
    const { stack } = renderPalette(baseProps({ contextualCommands: commands, onInvoke }));
    // Move off the (only) contextual command onto the first KEYMAP binding.
    await dispatch(stack, 'j');
    await dispatch(stack, '', key({ return: true }));
    expect(run).not.toHaveBeenCalled();
    expect(onInvoke).toHaveBeenCalledOnce();
  });

  it('still invokes a plain KEYMAP binding when no contextual commands were supplied', async () => {
    const onInvoke = vi.fn();
    const { stack } = renderPalette(baseProps({ onInvoke }));
    await dispatch(stack, '', key({ return: true }));
    expect(onInvoke).toHaveBeenCalledOnce();
    const [invocation] = onInvoke.mock.calls[0] as [{ source: string }];
    expect(invocation.source).toBe('palette');
  });
});

describe('CommandPalette scrolling (B-043: selection stays visible)', () => {
  it('scrolls the viewport as j moves the selection past the first page', async () => {
    // The same order/filter the component itself computes for `baseProps()` (screen
    // 'home', authenticated) with an empty query — this is what the old
    // `items.slice(0, visibleRows)` implementation never scrolled away from.
    const items = filterPaletteBindings('', paletteBindings('home', true));
    expect(items.length).toBeGreaterThan(9);
    const first = items[0];
    const tenth = items[9];
    if (first === undefined || tenth === undefined) throw new Error('fixture too small');
    const firstLabel = first.description ?? first.hint;
    const tenthLabel = tenth.description ?? tenth.hint;

    const { stack, lastFrame } = renderPalette(baseProps());
    for (let index = 0; index < 9; index += 1) {
      await dispatch(stack, 'j');
    }
    const frame = lastFrame() ?? '';
    const selectedLine = frame.split('\n').find((line) => line.includes(tenthLabel));
    expect(selectedLine).toBeDefined();
    expect(selectedLine).toContain('›');
    // Proves it actually scrolled, not just grew the window: the first page's top row
    // must have left the frame once the selection moved nine rows past it.
    expect(frame).not.toContain(firstLabel);
  });
});
