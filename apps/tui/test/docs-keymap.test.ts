import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { KEYMAP } from '../src/app/keymap.js';

/**
 * The user guide's key table and `app/keymap.ts` must describe the same app.
 *
 * A documented key that the app doesn't bind is worse than no documentation — the
 * reader presses it, nothing happens, and they stop trusting the rest of the page
 * (working agreement #7: never document something that doesn't work).
 */
const GUIDE = new URL('../../../docs/user-guide.md', import.meta.url);

/** `g s` / `/` and `j / ↓` both list alternatives for the same action. */
function alternatives(cell: string): string[] {
  return cell
    .split(/`\s*\/\s*`|\s+\/\s+/u)
    .map((part) => part.replaceAll('`', '').trim())
    .filter((part) => part !== '');
}

function keyTableRows(markdown: string): string[] {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.startsWith('| Key'));
  expect(start, 'user-guide.md has no key table').toBeGreaterThan(-1);
  const rows: string[] = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith('|')) break;
    const cell = line.split('|')[1]?.trim() ?? '';
    if (cell !== '') rows.push(cell);
  }
  return rows;
}

describe('docs/user-guide.md key table matches KEYMAP', () => {
  it('documents only keys the app actually binds', async () => {
    const markdown = await readFile(GUIDE, 'utf8');
    const bound = new Set(KEYMAP.flatMap((binding) => alternatives(binding.keys)));

    const rows = keyTableRows(markdown);
    expect(rows.length).toBeGreaterThan(20);
    for (const cell of rows) {
      for (const key of alternatives(cell)) {
        expect(
          bound.has(key),
          `user-guide documents "${key}", which no KEYMAP binding provides`,
        ).toBe(true);
      }
    }
  });

  it('documents every navigation key, so the guide can never fall behind a new screen', async () => {
    const markdown = await readFile(GUIDE, 'utf8');
    const documented = new Set(keyTableRows(markdown).flatMap(alternatives));

    const navigation = KEYMAP.filter((binding) => binding.group === 'Navigation');
    expect(navigation.length).toBeGreaterThan(0);
    for (const binding of navigation) {
      // Ctrl+C is a safety key, not something a reader looks up in a table.
      if (binding.keys === 'Ctrl+C') continue;
      const listed = alternatives(binding.keys).some((key) => documented.has(key));
      expect(listed, `KEYMAP binds "${binding.keys}" but the user guide never mentions it`).toBe(
        true,
      );
    }
  });
});
