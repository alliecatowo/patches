import { useWindowSize } from 'ink';
import { render } from 'ink-testing-library';
import stringWidth from 'string-width';
import { describe, expect, it } from 'vitest';

import { createFakeApi, expectFrame, flush, KEY, renderApp } from './harness.js';

/**
 * The frame invariant.
 *
 * Ink diffs the terminal line by line and renders a *shrunk* flex child by dropping
 * rows out of the middle of it. So a frame that is taller than the window, or a line
 * that soft-wraps past `columns`, desynchronises the diff and every later redraw
 * smears — the corrupted Home timeline the owner reported on 2026-08-18 (counts lines
 * painted over the previous post's header, bodies cut mid-word, the status bar wrapped
 * onto a second line). Reproduced on the released v0.1.0-alpha.2, so it is the
 * rendering model, not a stale build.
 *
 * These tests assert the property directly: whatever the app is showing, the frame
 * fits the terminal exactly.
 */

/** The window size Ink itself reports under `ink-testing-library`, so the assertions
 * hold on any machine rather than assuming an 80×24. */
function inkWindowSize(): { columns: number; rows: number } {
  let size = { columns: 0, rows: 0 };
  function Probe(): null {
    size = useWindowSize();
    return null;
  }
  const probe = render(<Probe />);
  probe.unmount();
  return size;
}

function assertFits(frame: string, label: string): void {
  const { columns, rows } = inkWindowSize();
  const lines = frame.split('\n');
  expect(
    lines.length,
    `${label}: frame is ${String(lines.length)} lines, terminal has ${String(rows)}`,
  ).toBeLessThanOrEqual(rows);
  for (const [index, line] of lines.entries()) {
    // `string-width` ignores SGR escapes and counts wide glyphs as two cells —
    // measuring with `line.length` is how the off-by-one gets in.
    expect(
      stringWidth(line),
      `${label}: line ${String(index)} is ${String(stringWidth(line))} cells wide`,
    ).toBeLessThanOrEqual(columns);
  }
}

const LONG_BODY =
  'A deliberately very long post body that will certainly need to wrap several times ' +
  'over in any reasonable terminal width, with 👩‍💻 emoji and 日本語のテキスト mixed in so ' +
  'the width measurement has to be grapheme aware rather than counting code units, ' +
  'plus a supercalifragilisticexpialidociousunbreakablewordthatmustbebrokenmidword.';

describe('the rendered frame always fits the terminal', () => {
  it('holds for 200 posts with emoji, long bodies and an image attachment', async () => {
    const fake = createFakeApi({ pageSize: 200 });
    const alice = fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    for (let index = 0; index < 200; index += 1) {
      fake.addPost(alice.id, `${String(index)} ${LONG_BODY}`);
    }
    // One post carrying media, so the §75 fallback box is in the measured budget too.
    fake.addPost(alice.id, 'post with an image 🖼', new Date(), undefined, [
      { mediaId: 'm1', mimeType: 'image/png', width: 1200, height: 800, altText: '', position: 0 },
    ]);

    const { press, lastFrame, unmount } = renderApp({ fake });
    const first = await expectFrame(lastFrame, 'Local');
    assertFits(first, 'initial local timeline');

    // Scroll a long way down: the viewport has to keep re-fitting as row heights vary.
    for (let step = 0; step < 40; step += 1) {
      press('j');
    }
    await flush(80);
    assertFits(lastFrame() ?? '', 'after 40 j presses');

    press('G');
    await flush(80);
    assertFits(lastFrame() ?? '', 'after G (bottom)');

    press(KEY.pageUp);
    await flush(80);
    assertFits(lastFrame() ?? '', 'after PageUp');
    unmount();
  });

  it('holds on the help screen, which is longer than any terminal', async () => {
    const { press, lastFrame, unmount } = renderApp();
    await expectFrame(lastFrame, 'Local');
    await flush();

    press('?');
    const frame = await expectFrame(lastFrame, 'Space/PgDn page');
    assertFits(frame, 'help screen');

    for (let step = 0; step < 30; step += 1) press('j');
    await flush(60);
    assertFits(lastFrame() ?? '', 'help screen scrolled');
    unmount();
  });
});
