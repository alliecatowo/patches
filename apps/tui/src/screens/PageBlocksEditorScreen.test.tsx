import type { UpdatePageResponse } from '../api/wire/types.js';
import { render } from 'ink-testing-library';
import { Box } from 'ink';
import stringWidth from 'string-width';
import { describe, expect, it, vi } from 'vitest';

import type { PatchesApi } from '../api/client.js';
import { MemoryPageDraftStore } from '../pages/draft-store.js';
import {
  PageBlocksEditorScreen,
  type PageBlocksEditorScreenProps,
} from './PageBlocksEditorScreen.js';

const KEY = {
  enter: '\r',
  escape: '',
  backspace: '',
  ctrlS: '',
} as const;

async function settle(ms = 30): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function fakeApi(overrides: Partial<PatchesApi> = {}): PatchesApi {
  const base: Partial<PatchesApi> = {
    updatePage: () =>
      Promise.resolve<UpdatePageResponse>({
        document: Buffer.from(
          JSON.stringify({ version: 1, pages: [{ slug: 'index', title: '', blocks: [] }] }),
          'utf8',
        ),
        revisionId: 'rev-2',
        updatedAt: undefined,
      }),
  };
  return { ...base, ...overrides } as unknown as PatchesApi;
}

function props(overrides: Partial<PageBlocksEditorScreenProps> = {}): PageBlocksEditorScreenProps {
  const rawText = JSON.stringify({
    version: 1,
    pages: [{ slug: 'index', title: 'Home', blocks: [{ type: 'Text', body: 'hello' }] }],
  });
  return {
    api: fakeApi(),
    handle: 'alice',
    slug: 'index',
    rawText,
    isActive: true,
    ensureAccessToken: () => Promise.resolve('token'),
    draftStore: new MemoryPageDraftStore(),
    onCancel: vi.fn(),
    onSaved: vi.fn(),
    ...overrides,
  };
}

describe('PageBlocksEditorScreen (P12-110)', () => {
  it('lists the seeded block and edits its body via Ctrl+S in the field form', async () => {
    const onSaved = vi.fn();
    const { lastFrame, stdin } = render(<PageBlocksEditorScreen {...props({ onSaved })} />);
    await settle();
    expect(lastFrame() ?? '').toContain('Text — hello');

    stdin.write(KEY.enter); // open the field form for the selected (only) block
    await settle();
    expect(lastFrame() ?? '').toContain('Body');

    for (let index = 0; index < 'hello'.length; index += 1) stdin.write(KEY.backspace);
    stdin.write('new body');
    await settle();
    stdin.write(KEY.ctrlS); // commit the field form
    await settle();
    expect(lastFrame() ?? '').toContain('Text — new body');

    stdin.write(KEY.ctrlS); // save the whole document
    await settle();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('Esc backs out without saving, persisting the in-progress edit to the draft store', async () => {
    const onCancel = vi.fn();
    const draftStore = new MemoryPageDraftStore();
    const { stdin } = render(<PageBlocksEditorScreen {...props({ onCancel, draftStore })} />);
    await settle();

    stdin.write(KEY.escape);
    await settle();
    expect(onCancel).toHaveBeenCalledTimes(1);
    const saved = await draftStore.load();
    expect(saved?.handle).toBe('alice');
    expect(saved?.rawJson).toContain('hello');
  });

  it('shows the add-block picker and inserts the picked type after the selection', async () => {
    const { lastFrame, stdin } = render(<PageBlocksEditorScreen {...props()} />);
    await settle();

    stdin.write('a');
    await settle();
    expect(lastFrame() ?? '').toContain('Add a block:');

    stdin.write(KEY.enter); // "Text" is first in BLOCK_TYPE_SPECS
    await settle();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Text — hello');
    expect(frame).toContain('(empty)');
  });

  it.each([
    { label: '80x24', columns: 80 },
    { label: '100x30', columns: 100 },
    { label: '140x40', columns: 140 },
  ])('never renders a line wider than $label', async ({ columns }) => {
    const rawText = JSON.stringify({
      version: 1,
      pages: [
        {
          slug: 'index',
          title: 'Home',
          blocks: [
            { type: 'Text', body: 'a'.repeat(300) },
            { type: 'TopEight', actors: ['@a', '@b', '@c'] },
          ],
        },
      ],
    });
    const { lastFrame, stdin } = render(
      <Box width={columns} flexDirection="column">
        <PageBlocksEditorScreen {...props({ rawText })} />
      </Box>,
    );
    await settle();
    stdin.write(KEY.enter); // open the field form — the widest state (label + counter + text)
    await settle();

    for (const [index, line] of (lastFrame() ?? '').split('\n').entries()) {
      expect(
        stringWidth(line),
        `line ${String(index)} is ${String(stringWidth(line))} cells wide, budget is ${String(columns)}`,
      ).toBeLessThanOrEqual(columns);
    }
  });
});
