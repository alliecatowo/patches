import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';
import stringWidth from 'string-width';

import { PlainModeProvider } from '../theme/plain-mode.js';
import { scrollThumbRows, VirtualList } from './VirtualList.js';

/** Raw CSI bytes for keys real terminals send (see `test/harness.tsx`'s `KEY`). */
const HOME = '[H';
const END = '[F';

/** Ink's own re-render lands on a later tick than `stdin.write`'s synchronous
 * `emit('data', …)` — every other component test in this package settles the
 * same way before reading `lastFrame()`. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('VirtualList (P12-004)', () => {
  it('renders the n/total position line and moves selection with j/k', async () => {
    const { lastFrame, stdin } = render(
      <VirtualList<string>
        items={['a', 'b', 'c']}
        keyOf={(item) => item}
        measure={() => 1}
        width={20}
        budget={5}
        isActive
        renderItem={(item, state) => <Text>{state.selected ? `> ${item}` : `  ${item}`}</Text>}
      />,
    );
    expect(lastFrame()).toContain('1/3');
    expect(lastFrame()).toContain('> a');

    stdin.write('j');
    await settle();
    expect(lastFrame()).toContain('2/3');
    expect(lastFrame()).toContain('> b');

    stdin.write('k');
    await settle();
    expect(lastFrame()).toContain('1/3');
    expect(lastFrame()).toContain('> a');
  });

  it('never renders more rows than the budget, however many items there are', () => {
    const items = Array.from({ length: 200 }, (_, index) => `item-${String(index)}`);
    const { lastFrame } = render(
      <VirtualList<string>
        items={items}
        keyOf={(item) => item}
        measure={() => 1}
        width={20}
        budget={5}
        isActive
        renderItem={(item) => <Text>{item}</Text>}
      />,
    );
    // One position line plus at most `budget` item rows — a taller frame is exactly
    // the smear bug this component exists to prevent (see `list-viewport.ts`).
    const rows = (lastFrame() ?? '').split('\n');
    expect(rows.length).toBeLessThanOrEqual(6);
  });

  it('keeps a taller selected row fully visible instead of clipping it out of the budget', async () => {
    const items = ['short', 'a\nb\nc\nd', 'tail'];
    const { lastFrame, stdin } = render(
      <VirtualList<string>
        items={items}
        keyOf={(item) => item}
        measure={(item) => item.split('\n').length}
        width={20}
        budget={4}
        isActive
        renderItem={(item, state) => <Text>{state.selected ? `> ${item}` : item}</Text>}
      />,
    );
    stdin.write('j');
    await settle();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('a');
    expect(frame).toContain('d');
    // Position line + the 4-row budget, never more.
    expect(frame.split('\n').length).toBeLessThanOrEqual(5);
  });

  it('dispatches keys it does not own via onKey with the resolved item and index', async () => {
    const onKey = vi.fn().mockReturnValue(true);
    const { stdin } = render(
      <VirtualList<string>
        items={['a', 'b']}
        keyOf={(item) => item}
        measure={() => 1}
        width={20}
        budget={5}
        isActive
        renderItem={(item) => <Text>{item}</Text>}
        onKey={onKey}
      />,
    );
    stdin.write('x');
    await settle();
    expect(onKey).toHaveBeenCalledWith('x', expect.anything(), 'a', 0);
  });

  it('renders the empty placeholder instead of the list when items is empty', () => {
    const { lastFrame } = render(
      <VirtualList<string>
        items={[]}
        keyOf={(item) => item}
        measure={() => 1}
        width={20}
        budget={5}
        isActive
        empty={<Text>Nothing here.</Text>}
        renderItem={(item) => <Text>{item}</Text>}
      />,
    );
    expect(lastFrame()).toContain('Nothing here.');
  });

  it('jumps to the first/last item on Home/End', async () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const { lastFrame, stdin } = render(
      <VirtualList<string>
        items={items}
        keyOf={(item) => item}
        measure={() => 1}
        width={20}
        budget={5}
        isActive
        renderItem={(item, state) => <Text>{state.selected ? `> ${item}` : item}</Text>}
      />,
    );
    stdin.write(END);
    await settle();
    expect(lastFrame()).toContain('5/5');
    expect(lastFrame()).toContain('> e');

    stdin.write(HOME);
    await settle();
    expect(lastFrame()).toContain('1/5');
    expect(lastFrame()).toContain('> a');
  });

  it('applies a `g g` / `G` jump from the shell exactly once per nonce', async () => {
    const items = ['a', 'b', 'c'];
    const { lastFrame, rerender } = render(
      <VirtualList<string>
        items={items}
        keyOf={(item) => item}
        measure={() => 1}
        width={20}
        budget={5}
        isActive
        jump={{ edge: 'bottom', nonce: 1 }}
        renderItem={(item, state) => <Text>{state.selected ? `> ${item}` : item}</Text>}
      />,
    );
    await settle();
    expect(lastFrame()).toContain('3/3');
    expect(lastFrame()).toContain('> c');

    // A stale nonce (the shell's jump prop not having changed) must not re-apply —
    // otherwise a manual `k` right after `G` would be clobbered back to the bottom
    // on the next render.
    rerender(
      <VirtualList<string>
        items={items}
        keyOf={(item) => item}
        measure={() => 1}
        width={20}
        budget={5}
        isActive
        jump={{ edge: 'bottom', nonce: 1 }}
        renderItem={(item, state) => <Text>{state.selected ? `> ${item}` : item}</Text>}
      />,
    );
    await settle();
    expect(lastFrame()).toContain('3/3');
  });

  it('reports the on-screen window through onViewportChange', () => {
    const onViewportChange = vi.fn();
    render(
      <VirtualList<string>
        items={['a', 'b', 'c', 'd', 'e']}
        keyOf={(item) => item}
        measure={() => 1}
        width={20}
        budget={2}
        isActive
        onViewportChange={onViewportChange}
        renderItem={(item) => <Text>{item}</Text>}
      />,
    );
    expect(onViewportChange).toHaveBeenCalledWith(0, 2);
  });

  it('reserves a thumb column without exceeding the given width (P12-117)', () => {
    const items = Array.from({ length: 50 }, (_, index) => `item-${String(index)}`);
    const { lastFrame } = render(
      <VirtualList<string>
        items={items}
        keyOf={(item) => item}
        measure={() => 1}
        width={20}
        budget={5}
        isActive
        showScrollThumb
        renderItem={(item, state) => <Text>{item.padEnd(state.width)}</Text>}
      />,
    );
    const lines = (lastFrame() ?? '').split('\n');
    for (const line of lines) expect(stringWidth(line)).toBeLessThanOrEqual(20);
    // The track/thumb glyphs land in the reserved rightmost column.
    expect(lines.some((line) => line.includes('│') || line.includes('█'))).toBe(true);
  });

  it('omits the scroll thumb gutter in plain mode', () => {
    const items = Array.from({ length: 50 }, (_, index) => `item-${String(index)}`);
    const { lastFrame } = render(
      <PlainModeProvider plain>
        <VirtualList<string>
          items={items}
          keyOf={(item) => item}
          measure={() => 1}
          width={20}
          budget={5}
          isActive
          showScrollThumb
          renderItem={(item, state) => <Text>{item.padEnd(state.width)}</Text>}
        />
      </PlainModeProvider>,
    );
    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('█');
  });

  it('prefixes rows with a 1-based index when `indexed` is set (P12-118)', () => {
    const { lastFrame } = render(
      <VirtualList<string>
        items={['a', 'b', 'c']}
        keyOf={(item) => item}
        measure={() => 1}
        width={20}
        budget={5}
        isActive
        indexed
        renderItem={(item) => <Text>{item}</Text>}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[1]');
    expect(frame).toContain('[2]');
    expect(frame).toContain('[3]');
  });
});

describe('scrollThumbRows', () => {
  it('covers the whole track when every item is already visible', () => {
    expect(scrollThumbRows(4, 3, 0, 3)).toEqual([true, true, true, true]);
  });

  it('is a proportionally smaller, positioned segment when the list overflows', () => {
    const rows = scrollThumbRows(10, 100, 0, 10);
    expect(rows.filter(Boolean).length).toBeGreaterThanOrEqual(1);
    expect(rows.filter(Boolean).length).toBeLessThan(10);
    expect(rows[0]).toBe(true);
  });

  it('moves toward the end of the track as the window scrolls down', () => {
    const atTop = scrollThumbRows(10, 100, 0, 10);
    const atBottom = scrollThumbRows(10, 100, 90, 100);
    const firstFilledIndex = (thumb: boolean[]): number => thumb.findIndex(Boolean);
    expect(firstFilledIndex(atBottom)).toBeGreaterThan(firstFilledIndex(atTop));
  });
});
