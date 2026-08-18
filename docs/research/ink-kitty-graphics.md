# Inline images in Ink 7 via the kitty graphics protocol (Unicode placeholders)

Verified 2026-08-17 against: [kitty graphics protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/) ·
[graphics-protocol.rst](https://raw.githubusercontent.com/kovidgoyal/kitty/master/docs/graphics-protocol.rst) ·
[rowcolumn-diacritics.txt](https://raw.githubusercontent.com/kovidgoyal/kitty/master/gen/rowcolumn-diacritics.txt) ·
[ghostty v1.3.1 source](https://github.com/ghostty-org/ghostty/blob/v1.3.1/src/terminal/kitty/graphics_unicode.zig) ·
`npm view ink@7.1.1` + unpacked `build/*.js` · [ink](https://github.com/vadimdemedes/ink) ·
[ink-testing-library](https://github.com/vadimdemedes/ink-testing-library) · [@inkjs/ui](https://github.com/vadimdemedes/ink-ui)

**Bottom line:** use Unicode placeholders. Ghostty 1.3.1 implements them. Ink 7 measures `U+10EEEE` as width 1
and passes raw SGR through untouched — but it **strips APC escape sequences inside `<Text>`**, so image
transmission must go out-of-band via `stdout.write`.

---

## 1. Protocol essentials

Format (APC): `<ESC>_G<control key=value pairs, comma separated>;<base64 payload><ESC>\`

```
\x1b_Ga=T,f=100,q=2,i=42,c=20,r=10;<base64 PNG>\x1b\\
```

### Control keys used here

| Key                                                            | Meaning                                                                           |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `a=t` / `a=p` / `a=T` / `a=d` / `a=q`                          | transmit / place / transmit+place / delete / query                                |
| `f=100` PNG, `f=24` RGB, `f=32` RGBA (default)                 | payload format                                                                    |
| `s=`,`v=`                                                      | source pixel width/height (required for `f=24/32`, not for PNG)                   |
| `t=d` direct, `t=f` file, `t=t` temp file, `t=s` shared memory | transmission medium                                                               |
| `i=`                                                           | image id, 1..4294967295 (**global namespace — collisions are real**)              |
| `I=`                                                           | image _number_ (non-unique; terminal assigns the id)                              |
| `p=`                                                           | placement id, 1..4294967295                                                       |
| `c=`,`r=`                                                      | display size in **cells** (cols/rows); image is fit to the rect, aspect preserved |
| `C=1`                                                          | do not move the cursor after placement                                            |
| `q=1` suppress OK, `q=2` suppress failure responses            | quiet mode                                                                        |
| `m=1` / `m=0`                                                  | chunk continues / final chunk                                                     |
| `U=1`                                                          | this placement is a _virtual_ placement (Unicode-placeholder prototype)           |
| `d=`                                                           | delete selector (see below)                                                       |

### Chunking (verbatim rule)

> "The pixel data must first be base64 encoded then chunked up into chunks no larger than `4096` bytes.
> All chunks, except the last, must have a size that is a multiple of 4. … `m` … must have the value `1`
> for all but the last chunk, where it must be `0`. … only the first escape code needs to have the full set
> of control codes … Subsequent chunks **must** have only the `m` and optionally `q` keys. … The client
> **must** finish sending all chunks for a single image before sending any other graphics related escape codes."

### Which medium is safest

`t=d` (direct, base64 in the escape code). It is the only medium that works identically in kitty, Ghostty,
and **over ssh / inside containers**, because `t=f`/`t=t`/`t=s` all require the terminal process to share a
filesystem or POSIX shm namespace with the client. Ghostty v1.3.1 does implement all four
(`Medium = {direct, file, temporary_file, shared_memory}` in `src/terminal/kitty/graphics_command.zig`,
loaded in `graphics_image.zig`), but portability says `t=d`. Use `t=t` only as a local fast path for
multi-MB images — kitty requires `tty-graphics-protocol` to appear in the temp file path.

### Delete selectors (`a=d,d=…`)

Lowercase = delete placements only; **uppercase = also free the image data**.
`i`/`I` by image id (`i=`), `a`/`A` all visible placements, `c`/`C` at cursor, `p`/`P` at cell (`x`,`y`),
`x`/`X` column, `y`/`Y` row, `z`/`Z` z-index, `r`/`R` id range, `n`/`N` newest by number.

> Virtual placements "can be deleted by a deletion command only when the `d` key is equal to
> `i`, `I`, `r`, `R`, `n` or `N`." — so **`\x1b_Ga=d,d=I,i=<id>,q=2\x1b\\` is the correct teardown.**

### Capability detection

```
\x1b_Gi=31,s=1,v=1,a=q,t=d,f=24;AAAA\x1b\\\x1b[c
```

> "If you get back a response to the graphics query, the terminal emulator supports the protocol,
> if you get back a response to the device attributes query without a response to the graphics query, it does not."

Success reply: `\x1b_Gi=31;OK\x1b\\`. Failure reply: `\x1b_Gi=31;<error message>\x1b\\`.

```ts
// probe.ts — MUST run BEFORE ink's render() takes over stdin.
export async function detectKittyGraphics(timeoutMs = 300): Promise<boolean> {
  const { stdin, stdout } = process;
  if (!stdout.isTTY || !stdin.isTTY) return false;
  const wasRaw = stdin.isRaw;
  stdin.setRawMode(true);
  stdin.resume();
  return await new Promise<boolean>((resolve) => {
    let buf = '';
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stdin.off('data', onData);
      stdin.setRawMode(wasRaw ?? false);
      stdin.pause();
      resolve(ok);
    };
    const onData = (chunk: Buffer) => {
      buf += chunk.toString('latin1');
      if (buf.includes('\x1b_Gi=31;OK')) return finish(true);
      if (/\x1b_Gi=31;/.test(buf)) return finish(false); // graphics error reply
      if (/\x1b\[\?[\d;]*c/.test(buf)) return finish(false); // DA1 came back first
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    stdin.on('data', onData);
    stdout.write('\x1b_Gi=31,s=1,v=1,a=q,t=d,f=24;AAAA\x1b\\\x1b[c');
  });
}

// Env heuristics — use as a fast-path hint only, never as the sole signal.
export function looksGraphicsCapable(env = process.env): boolean {
  const term = env.TERM ?? '';
  return (
    /kitty|ghostty/i.test(term) ||
    env.TERM_PROGRAM === 'ghostty' || // ghostty sets TERM_PROGRAM=ghostty (src/termio/Exec.zig)
    env.KITTY_WINDOW_ID !== undefined ||
    env.GHOSTTY_RESOURCES_DIR !== undefined || // ghostty sets this (src/termio/Exec.zig)
    env.TERM_PROGRAM === 'WezTerm'
  );
}
```

Ghostty sets `TERM=xterm-ghostty`, `TERM_PROGRAM=ghostty`, `TERM_PROGRAM_VERSION=<version>`,
`GHOSTTY_RESOURCES_DIR`, `GHOSTTY_BIN_DIR` (verified in `src/termio/Exec.zig`).

**tmux:** APC codes are not forwarded unless `set -g allow-passthrough on`, and then each sequence must be
wrapped as `\x1bPtmux;<seq with every \x1b doubled>\x1b\\`. Unicode placeholders are exactly the technique
tmux-compatible clients use (tmux moves the placeholder _text_ around for free). Treat tmux as
"transmit through passthrough, place via placeholders", and gate it on `$TMUX` being set. Not tested here.

---

## 2. Unicode placeholders — the technique to use

Verbatim from the spec:

> "You can also use a special Unicode character `U+10EEEE` as a placeholder for an image. … Since this
> character is just normal text, Unicode aware application will move it around as needed when they redraw
> their screens, thereby automatically moving the displayed image as well, even though they know nothing
> about the graphics protocol. So an image is first created using the normal graphics protocol escape codes
> (albeit in quiet mode (`q=2`) …). Then, the actual image is displayed by getting the host application to
> emit normal text consisting of `U+10EEEE` and various diacritics … and colors."

Two steps:

```
1) transmit + create a VIRTUAL placement (invisible, a prototype):
   \x1b_Ga=T,U=1,i=<id>,f=100,c=<cols>,r=<rows>,q=2,m=1;<chunk>\x1b\\ …  m=0 on last chunk
   (or a=t to transmit, then \x1b_Ga=p,U=1,i=<id>,c=<cols>,r=<rows>,q=2\x1b\\)

2) print cols×rows cells of U+10EEEE, fg color = image id, diacritics = (row, col)
```

- **Image id → foreground color.** 8-bit ids via `\x1b[38;5;<id>m`, 24-bit ids via
  `\x1b[38;2;<R>;<G>;<B>m` where `id = R<<16 | G<<8 | B`. If the id needs more than 24 bits, a **third
  diacritic** carries the most significant byte (`U+030E` = 2 → id `33554474 = 42 + (2 << 24)`).
- **Placement id → underline color** (`\x1b[58;2;R;G;Bm`); omit/zero and the terminal picks any virtual
  placement of that image. Background color shows through transparent pixels.
- **Row/column → diacritics.** First diacritic = row index, second = column index, both indexes into
  `rowcolumn-diacritics.txt` (297 entries, so up to 297 rows/cols).

### First 40 diacritics, in order (index 0…39) — verbatim from `gen/rowcolumn-diacritics.txt`

```
 0: U+0305   1: U+030D   2: U+030E   3: U+0310   4: U+0312   5: U+033D   6: U+033E   7: U+033F
 8: U+0346   9: U+034A  10: U+034B  11: U+034C  12: U+0350  13: U+0351  14: U+0352  15: U+0357
16: U+035B  17: U+0363  18: U+0364  19: U+0365  20: U+0366  21: U+0367  22: U+0368  23: U+0369
24: U+036A  25: U+036B  26: U+036C  27: U+036D  28: U+036E  29: U+036F  30: U+0483  31: U+0484
32: U+0485  33: U+0486  34: U+0487  35: U+0592  36: U+0593  37: U+0594  38: U+0595  39: U+0597
```

(The table is the Unicode 6.0.0 `Mn;230;NSM` combining marks minus the ones that NFC-compose:
`0300-0304 0306-030C 030F 0311 0313 0314 0342 0653 0654`. Full 297-entry list is in the linked file.)

Canonical 2×2 example for image id 42 (spec, verbatim):

```sh
printf "\e[38;5;42m\U10EEEE\U0305\U0305\U10EEEE\U0305\U030D\e[39m\n"
printf "\e[38;5;42m\U10EEEE\U030D\U0305\U10EEEE\U030D\U030D\e[39m\n"
```

### Diacritic omission rules (verbatim, applied left-to-right)

> - If no diacritics are present, and the previous placeholder cell has the same foreground and underline
>   colors, then the row of the current cell will be the row of the cell to the left, the column will be the
>   column of the cell to the left plus one, and the most significant image ID byte will be the most
>   significant image ID byte of the cell to the left.
> - If only the row diacritic is present, and the previous placeholder cell has the same row and the same
>   foreground and underline colors, then the column of the current cell will be the column of the cell to
>   the left plus one, and the MSB will be … the cell to the left.
> - If only the row and column diacritics are present, and the previous placeholder cell has the same row,
>   the same colors, and its column is one less than the current column, then the MSB … of the cell to the left.

> "This will not work for horizontal scrolling and overlapping images …"

**Recommendation: always emit explicit row+column diacritics on every cell.** Ink's diff renderer rewrites
partial lines and re-emits SGR at line starts, which can break the "cell to the left" continuity assumption.
Explicit diacritics cost ~2 extra codepoints per cell and are unconditionally correct.

### Why this is the right fit for Ink

The placeholders are _ordinary text cells_. Ink's Yoga layout, line diffing, `<Static>`, scrolling, erasing
and resize reflow all operate on them as text. The terminal composites the image only where placeholder cells
are currently visible — so images cannot ghost, they move with the list, they clip at box edges, and clearing
the line clears the image. Real graphics placements (`a=T` without `U=1`) are anchored to screen coordinates
and would ghost on every rerender.

### Ghostty support — CONFIRMED

`src/terminal/kitty/graphics_unicode.zig` exists at tag `v1.3.1` (43 KB) and declares:

```zig
/// Codepoint for the unicode placeholder character.
pub const placeholder: u21 = 0x10EEEE;
```

with a `PlacementIterator` scanning rows flagged `kitty_virtual_placeholder`. Ghostty 1.3 supports
Unicode placeholders, all four transmission mediums, and `CSI 14/16/18 t` size reports.

---

## 3. Ink 7 rendering pitfalls (measured, not guessed)

Tested against `ink@7.1.1` unpacked + `string-width@8`, `widest-line@6`, `cli-truncate@6`, `slice-ansi@9`, `wrap-ansi@10`.

| Concern                                           | Result                                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `stringWidth('\u{10EEEE}')`                       | **1** ✅ (private-use plane 16 is East-Asian _Ambiguous_; string-width v8 defaults `ambiguousIsNarrow: true`) |
| `stringWidth(P + '̅' + '̍')`                        | **1** ✅ combining marks count 0                                                                              |
| `widestLine` of a 2-cell placeholder row with SGR | **2** ✅ (Ink's `measure-text.js` uses `widest-line`)                                                         |
| Raw `\x1b[38;2;R;G;Bm` inside `<Text>`            | **preserved verbatim** ✅                                                                                     |
| Raw `\x1b_G…\x1b\\` (APC) inside `<Text>`         | **SILENTLY STRIPPED** ❌                                                                                      |
| `slice-ansi` / `wrap-ansi` on placeholder rows    | diacritics preserved, SGR re-emitted per line ✅                                                              |
| `cli-truncate` (i.e. `wrap="truncate*"`)          | **appends `…` (U+2026)** ❌ corrupts the grid                                                                 |

The APC stripping is in `build/sanitize-ansi.js`, called from `build/squash-text-nodes.js`:

```js
// Preserved: SGR sequences (colors, bold, etc. - end with 'm') and OSC sequences.
// Stripped: cursor movement, screen clearing, and other control sequences.
```

Only `csi` tokens with `finalCharacter === 'm'` and OSC tokens survive. Confirmed empirically:

```js
renderToString(<Text>{'\x1b_Gi=1,a=T;AAAA\x1b\\' + 'X' + P + '̅̅'}</Text>);
// => "X􎻮̅̅"      <- APC gone
renderToString(<Text>{'\x1b[38;2;0;1;42m' + P + '̅̅' + '\x1b[39m'}</Text>);
// => "\x1b[38;2;0;1;42m􎻮̅̅\x1b[39m"   <- SGR intact
```

**Rules:**

1. **Never put transmission escape codes in JSX.** Write them with `stdout.write(...)` from `useStdout()`'s
   `stdout` stream (not `useStdout().write`, which erases and repaints Ink's frame — see §4).
2. **Emit the fg color as raw ANSI, not via chalk or `<Text color>`.** Ink's `colorize`/chalk wraps children
   and its `\x1b[39m` reset would terminate our per-cell color run mid-grid. Build the whole row string
   yourself and drop it in a bare `<Text>`.
3. **Never let a placeholder row be truncated.** Give the row's `<Box>` an explicit `width={cols}` (or a
   parent `flexShrink={0}` + `overflow="hidden"`), and use `wrap="hard"` if you must — never `truncate*`.
4. Consider `render(..., {incrementalRendering: true})`: unchanged placeholder rows are then not rewritten
   at all, which minimises repaint churn under the image.

---

## 4. Ink 7 API (from `ink@7.1.1` `build/*.d.ts`)

`engines: {node: ">=22"}`, `type: "module"` (ESM only), peers `react >=19.2.0`, `@types/react >=19.2.0`,
`react-devtools-core >=6.1.2`. Node 24/26 is fine.

```ts
render(node: ReactNode, options?: NodeJS.WriteStream | RenderOptions): Instance
```

`RenderOptions`: `stdout`, `stdin`, `stderr`, `debug`, `exitOnCtrlC` (default `true`), `patchConsole`
(default `true`), `onRender(metrics)`, `isScreenReaderEnabled`, `maxFps` (default 30),
`incrementalRendering` (default `false`), `concurrent` (default `false`), `kittyKeyboard`,
`interactive` (auto: false in CI or non-TTY), **`alternateScreen` (default `false`)**.

`Instance`: `rerender`, `unmount`, `waitUntilExit`, `waitUntilRenderFlush`, `cleanup`, `clear`.

**Ink 7 HAS built-in alternate-screen support — do not hand-roll `\x1b[?1049h`.** Its docstring:

> "Render the app in the terminal's alternate screen buffer. … the original terminal content is restored when
> the app exits. … Only works in interactive mode. Ignored when `interactive` is `false`. … Ink intentionally
> treats alternate-screen teardown output as disposable."

That last line matters: **teardown-time writes are discarded**, so the `a=d,d=I` cleanup must go to
`process.stdout` directly from a `process.on('exit')` / signal handler, _after_ `unmount()`, not from a React
effect cleanup.

Exports (`build/index.d.ts`): `render`, `renderToString`, `Box`, `Text`, `Static`, `Transform`, `Newline`,
`Spacer`, `measureElement`, and hooks `useInput`, `usePaste`, `useApp`, `useStdin`, `useStdout`, `useStderr`,
`useFocus`, `useFocusManager`, `useIsScreenReaderEnabled`, `useCursor`, `useAnimation`, **`useWindowSize`**,
**`useBoxMetrics`**, plus `kittyFlags`/`kittyModifiers`.

- `useStdout()` → `{stdout: NodeJS.WriteStream, write(data: string): void}`. `write()` erases Ink's frame,
  writes, and repaints (`Ink#writeToStdout`) — **wrong for graphics**. Use `stdout.write(...)`.
- `useStdin()` → `{stdin, isRawModeSupported, setRawMode, internal_*}`. Ink puts stdin in raw mode and
  consumes `data`; **run the `a=q` probe before `render()`**.
- `useWindowSize()` → `{columns, rows}`, re-renders on SIGWINCH. Prefer it over `stdout.on('resize')`.
- `useApp()` → `{exit(errorOrResult?)}`.

### Fullscreen + resize

```tsx
const { waitUntilExit } = render(<App />, {
  alternateScreen: true,
  exitOnCtrlC: false, // we handle q / ctrl-c ourselves
  patchConsole: true,
  incrementalRendering: true,
});
```

Cell pixel size (needed to pick `cols`×`rows` that match the image aspect) — verified in Ghostty
`src/terminal/size_report.zig`:

```
\x1b[16t  ->  \x1b[6;<cell_height_px>;<cell_width_px>t
\x1b[14t  ->  \x1b[4;<window_height_px>;<window_width_px>t
\x1b[18t  ->  \x1b[8;<rows>;<cols>t
```

Query these in the same pre-render raw-stdin pass as the `a=q` probe; fall back to a 2.0 cell aspect
(≈ 8×16 px) if there's no reply within the timeout.

### Testing

`ink-testing-library@4.0.0` (`type: module`, `engines: node >=18`, peer `@types/react >=18`). It has **no
`ink` peer dependency pin**, so it installs cleanly next to Ink 7 — but it is a thin wrapper over `render()`
with a fake `stdout`, so verify it against 7.x in CI rather than assuming.

```ts
const {lastFrame, frames, rerender, unmount, stdin, stdout, stderr, cleanup} = render(<App/>);
stdin.write('j');
expect(lastFrame()).toContain('\u{10EEEE}');
```

Because `lastFrame()` is a plain string, placeholder grids are directly assertable: count `U+10EEEE`
occurrences per line and check the fg-color SGR encodes the expected id.

`@inkjs/ui@2.0.0` (peer `ink >=5`, node >=18) exports `TextInput`, `EmailInput`, `PasswordInput`,
`ConfirmInput`, `Select`, `MultiSelect`, `Spinner`, `ProgressBar`, `Badge`, `StatusMessage`, `Alert`,
`UnorderedList`, `OrderedList`, plus `ThemeProvider`, `extendTheme`, `defaultTheme`, `useComponentTheme`.
The `>=5` peer range means npm won't block Ink 7; smoke-test the components regardless.

---

## 5. Recommended architecture

```ts
// media/types.ts
export type MediaHandle = { id: number; cols: number; rows: number };

export interface TerminalMediaRenderer {
  readonly kind: 'kitty' | 'fallback';
  /** Transmit + create a virtual placement. Idempotent per cache key. */
  prepare(key: string, png: Buffer, cols: number, rows: number): Promise<MediaHandle>;
  /** Text to place inside a <Text>; '' for fallback. */
  placeholder(h: MediaHandle): string;
  /** Free terminal-side image data. */
  release(h: MediaHandle): void;
  releaseAll(): void;
}
```

### The placeholder builder (the load-bearing function)

```ts
// media/placeholder.ts
const PLACEHOLDER = '\u{10EEEE}';

/** rowcolumn-diacritics.txt, index -> codepoint. First 40 shown; ship all 297. */
export const DIACRITICS: readonly number[] = [
  0x0305, 0x030d, 0x030e, 0x0310, 0x0312, 0x033d, 0x033e, 0x033f, 0x0346, 0x034a, 0x034b, 0x034c,
  0x0350, 0x0351, 0x0352, 0x0357, 0x035b, 0x0363, 0x0364, 0x0365, 0x0366, 0x0367, 0x0368, 0x0369,
  0x036a, 0x036b, 0x036c, 0x036d, 0x036e, 0x036f, 0x0483, 0x0484, 0x0485, 0x0486, 0x0487, 0x0592,
  0x0593, 0x0594, 0x0595, 0x0597,
  // …257 more; load from the shipped copy of gen/rowcolumn-diacritics.txt
];

const d = (n: number): string => {
  const cp = DIACRITICS[n];
  if (cp === undefined) throw new RangeError(`placeholder index ${n} out of range`);
  return String.fromCodePoint(cp);
};

/**
 * Build the cols x rows placeholder block for a 24-bit image id.
 * Returns `rows` strings, each exactly `cols` cells wide (stringWidth === cols).
 * Emits explicit row+column diacritics on every cell (no omission shorthand).
 */
export function buildPlaceholderRows(id: number, cols: number, rows: number): string[] {
  if (!Number.isInteger(id) || id <= 0 || id > 0xff_ff_ff) {
    throw new RangeError('image id must be a 24-bit positive integer');
  }
  if (rows > DIACRITICS.length || cols > DIACRITICS.length) {
    throw new RangeError('image exceeds max placeholder grid');
  }
  const r = (id >> 16) & 0xff;
  const g = (id >> 8) & 0xff;
  const b = id & 0xff;
  const fg = `\x1b[38;2;${r};${g};${b}m`;
  const reset = '\x1b[39m';

  const out: string[] = [];
  for (let y = 0; y < rows; y++) {
    let line = fg;
    for (let x = 0; x < cols; x++) line += PLACEHOLDER + d(y) + d(x);
    out.push(line + reset);
  }
  return out;
}

/** Single string with newlines — safe to drop into one <Text>. */
export const buildPlaceholderBlock = (id: number, cols: number, rows: number): string =>
  buildPlaceholderRows(id, cols, rows).join('\n');
```

### KittyGraphicsRenderer

```ts
// media/kitty.ts
import { randomInt } from 'node:crypto';
import { buildPlaceholderRows } from './placeholder.js';

const CHUNK = 4096; // base64 bytes per escape code, per spec

export class KittyGraphicsRenderer implements TerminalMediaRenderer {
  readonly kind = 'kitty' as const;
  readonly #out: NodeJS.WriteStream;
  readonly #cache = new Map<string, MediaHandle>();
  readonly #live = new Set<number>();

  constructor(out: NodeJS.WriteStream = process.stdout) {
    this.#out = out;
  }

  #newId(): number {
    // Random 24-bit id: ids live in a GLOBAL namespace shared with every other
    // program on this terminal, so sequential ids from 1 collide across runs.
    for (;;) {
      const id = randomInt(1, 0x1_00_00_00);
      if (!this.#live.has(id)) return id;
    }
  }

  async prepare(key: string, png: Buffer, cols: number, rows: number): Promise<MediaHandle> {
    const hit = this.#cache.get(key);
    if (hit && hit.cols === cols && hit.rows === rows) return hit;
    if (hit) this.release(hit);

    const id = this.#newId();
    const b64 = png.toString('base64');
    let first = true;
    for (let i = 0; i < b64.length; i += CHUNK) {
      const chunk = b64.slice(i, i + CHUNK);
      const last = i + CHUNK >= b64.length;
      const ctrl = first
        ? // a=T + U=1 -> transmit AND create the virtual placement in one code
          `a=T,U=1,i=${id},f=100,c=${cols},r=${rows},q=2,m=${last ? 0 : 1}`
        : `q=2,m=${last ? 0 : 1}`; // continuation: only m and q
      this.#out.write(`\x1b_G${ctrl};${chunk}\x1b\\`);
      first = false;
    }
    const handle: MediaHandle = { id, cols, rows };
    this.#live.add(id);
    this.#cache.set(key, handle);
    return handle;
  }

  placeholder(h: MediaHandle): string {
    return buildPlaceholderRows(h.id, h.cols, h.rows).join('\n');
  }

  release(h: MediaHandle): void {
    if (!this.#live.delete(h.id)) return;
    this.#out.write(`\x1b_Ga=d,d=I,i=${h.id},q=2\x1b\\`); // I = free image data
  }

  releaseAll(): void {
    for (const id of [...this.#live]) this.release({ id, cols: 0, rows: 0 });
    this.#cache.clear();
  }
}
```

### React components

```tsx
// components/KittyImage.tsx
import { Box, Text } from 'ink';

export function KittyImage({
  handle,
  renderer,
}: {
  handle: MediaHandle;
  renderer: TerminalMediaRenderer;
}) {
  // Fixed width + no wrapping: the grid must never be reflowed or ellipsised.
  return (
    <Box width={handle.cols} height={handle.rows} flexShrink={0}>
      <Text wrap="hard">{renderer.placeholder(handle)}</Text>
    </Box>
  );
}

// components/FallbackMedia.tsx
export function FallbackMedia({
  cols,
  rows,
  label,
}: {
  cols: number;
  rows: number;
  label: string;
}) {
  return (
    <Box
      width={cols}
      height={rows}
      flexShrink={0}
      borderStyle="round"
      borderColor="gray"
      alignItems="center"
      justifyContent="center"
    >
      <Text dimColor wrap="truncate">
        {label}
      </Text>
    </Box>
  );
}
```

### Lifecycle

```ts
const supported = await detectKittyGraphics();              // BEFORE render()
const media: TerminalMediaRenderer = supported
  ? new KittyGraphicsRenderer(process.stdout)
  : new FallbackMediaRenderer();

const app = render(<App media={media}/>, {alternateScreen: true, incrementalRendering: true});

const teardown = () => { media.releaseAll(); };             // writes go to real stdout
process.once('exit', teardown);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.once(sig, () => { app.unmount(); teardown(); process.exit(0); });
}
await app.waitUntilExit();
teardown();
```

---

## 6. Pitfalls checklist

1. **Pre-scale with `sharp`.** The virtual placement fits the image into `cols`×`rows` _preserving aspect
   ratio_, so a mismatched grid leaves letterboxing. Compute
   `rows = round(imgH / (imgW / cols) / cellAspect)` where `cellAspect = cellHeightPx / cellWidthPx` from
   `\x1b[16t`. Resize to `cols*cellW × rows*cellH` and re-encode PNG (`f=100`) to keep the payload small —
   base64 at 4096-byte chunks means a 300 KB PNG is ~100 escape codes.
2. **`q=2` on every graphics code.** Without it the terminal writes `\x1b_Gi=…;OK\x1b\\` to _stdin_, which
   Ink's `useInput` will happily deliver to your app as garbage keystrokes.
3. **Do the `a=q` probe and the `\x1b[16t` query before `render()`.** Ink owns stdin afterwards; a
   competing `stdin.on('data')` listener will race Ink's parser. If you must query later, use
   `useApp().suspendTerminal` or tear down and re-probe.
4. **Random 24-bit ids.** Ids are global to the terminal, not to your process — a fixed id will stomp another
   pane's image and vice versa. Keep `id <= 0xFFFFFF` so no third diacritic is needed.
5. **Delete with the uppercase selector.** `d=i` removes placements but leaks the pixel data in the
   terminal's memory for the session; `d=I` frees it.
6. **Do the deletion outside React.** Ink 7's alternate-screen teardown discards writes made during unmount.
7. **Never `wrap="truncate*"` a placeholder row** (`cli-truncate` appends `…`), and never put APC codes in
   JSX (Ink's `sanitizeAnsi` deletes them).
8. **Don't use `<Text color=…>` on placeholder rows** — chalk's `\x1b[39m` reset breaks the id encoding.
   Emit `\x1b[38;2;R;G;Bm` yourself.
9. **Resize:** the placeholders reflow for free, but the _aspect_ changes if the user changes font size.
   Re-query `\x1b[16t` is not possible mid-render; instead recompute `cols`/`rows` from
   `useWindowSize()` and re-`prepare()` (new id) when the target grid changes by more than a cell.
10. **`<Static>`:** placeholder rows inside `<Static>` are written once and never rewritten — good for a
    finished/scrolled-off post log, but the image cannot then be deleted by rewriting the text. Prefer
    normal dynamic rendering for the scrolling list.
