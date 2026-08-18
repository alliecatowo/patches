# @patches/terminal-media

Inline images in the terminal for the Patches TUI: the kitty graphics protocol where the
terminal supports it (spec §73), a bordered description box everywhere else (§75).

Verified research notes: [`docs/research/ink-kitty-graphics.md`](../../docs/research/ink-kitty-graphics.md).
Architecture: [`docs/architecture/tui.md`](../../docs/architecture/tui.md#inline-media).

## Approach: Unicode placeholders, not real placements

An image is transmitted **once**, out of band, as an APC escape code written straight to
`process.stdout`. It creates a _virtual_ placement (`U=1`) — an invisible prototype. The
image is then displayed by printing ordinary text: a grid of `U+10EEEE` cells whose
foreground colour encodes the image id and whose combining diacritics encode each cell's
`(row, column)`.

```
\x1b_Ga=T,U=1,i=<id>,f=100,c=<cols>,r=<rows>,q=2,m=1;<base64 PNG chunk>\x1b\
...
\x1b[38;2;R;G;Bm􎻮̅̅􎻮̅̍...\x1b[39m     <- one line per image row
```

This is the only technique that composes with Ink. The placeholder cells are _text_, so
Yoga lays them out, the line differ diffs them, scrolling moves them, clipping clips them,
and clearing a line clears the image. Real placements (`a=T` without `U=1`) are anchored
to screen coordinates and ghost on every rerender.

## API

```ts
const caps = await detectTerminalGraphics();   // BEFORE ink's render()
const renderer = createRenderer(caps, process.stdout);
const image = await renderer.prepare({ bytes, mime }, { maxCols: 40, maxRows: 6 });

render(
  <MediaRendererProvider renderer={renderer}>
    <InlineImage image={image} />
  </MediaRendererProvider>,
  { alternateScreen: true },
);

installMediaCleanup(renderer, { onSignal: () => app.unmount() });
```

| Export                                                                            | Purpose                                                    |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `detectTerminalGraphics`                                                          | env heuristics + live `a=q` probe + `CSI 16 t` cell size   |
| `createRenderer` / `KittyGraphicsRenderer` / `FallbackMediaRenderer`              | the §73 `TerminalMediaRenderer` seam                       |
| `InlineImage`, `MediaRendererProvider`, `useMediaRenderer`                        | Ink bindings                                               |
| `installMediaCleanup`                                                             | exit/signal teardown that actually reaches the terminal    |
| `buildGraphicsCommand`, `chunkTransmit`, `buildPlaceholderGrid`, `deleteImage`, … | pure protocol builders, no I/O                             |
| `ROW_COLUMN_DIACRITICS`                                                           | kitty's 297-entry `gen/rowcolumn-diacritics.txt`, verbatim |

## Hazards (each one is enforced by a test)

1. **Ink strips APC sequences inside `<Text>`.** Transmission must go through
   `process.stdout.write`, never JSX, and never `useStdout().write` (which erases and
   repaints Ink's frame around every write).
2. **Never `wrap="truncate*"` on a placeholder row.** `cli-truncate` appends `…`, which
   replaces a cell and desynchronises every column after it. `InlineImage` uses
   `wrap="hard"` inside a fixed-width `<Box>`.
3. **Never `<Text color=…>` on a placeholder row.** Chalk emits its own `\x1b[39m`, which
   ends the colour run that encodes the image id. The row strings carry raw SGR already.
4. **Always emit explicit row _and_ column diacritics.** The protocol allows inheriting
   them from "the cell to the left", but Ink rewrites partial lines and re-emits SGR
   mid-row, which breaks that assumption.
5. **`q=2` on every command.** Otherwise the terminal replies on _stdin_ and Ink delivers
   the reply to `useInput` as garbage keystrokes.
6. **Delete with `d=I`, per id.** Lowercase `d=i` leaks the decoded image for the session,
   and `d=A` cannot touch virtual placements at all (kitty honours only `i/I/r/R/n/N`).
7. **Clean up outside React.** Ink 7 "treats alternate-screen teardown output as
   disposable", so a delete written during unmount never reaches the terminal.
   `installMediaCleanup` runs on `exit`/signals, after `unmount()`.
8. **Probe before `render()`.** Ink owns stdin afterwards; a competing `data` listener
   races its key parser.
9. **Random 24-bit image ids.** Ids are global to the terminal, not to the process — a
   fixed id stomps another pane's image. 24 bits keeps the grid at two diacritics per cell.

## Running the spike

```sh
pnpm --filter @patches/terminal-media spike            # interactive, needs a real TTY
pnpm --filter @patches/terminal-media spike -- --report  # print capabilities JSON and exit
```

See [`spike/README.md`](./spike/README.md) for the manual checklist against spec §74.

## Scripts

```sh
pnpm --filter @patches/terminal-media build      # tsup dual ESM/CJS build + .d.ts
pnpm --filter @patches/terminal-media typecheck
pnpm --filter @patches/terminal-media test
```
