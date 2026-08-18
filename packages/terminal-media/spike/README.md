# §74 image-rendering spike — manual test checklist

The spike renders six fake posts, each with an inline image, in Ink's alternate screen.
It exists to answer the seven questions in `INITIAL_VISION.md` §74 **before** the timeline
UI is built.

## Running it

```sh
# Interactive — must be a real TTY. Run it in Ghostty and in a non-graphics terminal.
pnpm --filter @patches/terminal-media spike

# Non-interactive capability report (works in CI / a pipe; prints JSON and exits 0).
pnpm --filter @patches/terminal-media spike -- --report
```

Keys: `j`/`k` (or arrows) move the selection · `d` release/restore the selected image ·
`R` force a rerender · `q` (or Ctrl-C) quit.

A one-line capability report goes to **stderr** at startup, so it does not corrupt the
alternate screen:

```
[patches spike] kitty=true renderer=kitty cell=10x21px size=204x52 term="ghostty 1.3.1"
```

## Checklist

Run in **Ghostty 1.3** (TERM=xterm-ghostty) and again in a terminal with no graphics
protocol (e.g. `TERM=xterm-256color` under GNOME Terminal, or any terminal over `ssh`
without kitty). Record pass/fail per row.

| #   | §74 requirement                                | How to check                                          | Expected                                                                                                                                                                     |
| --- | ---------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Ink full-screen layout works                   | launch the spike                                      | alternate screen; header top, status bar bottom; no scrollback pollution; the original shell contents come back on exit                                                      |
| 2   | Kitty graphics render at a controlled position | look at the six posts                                 | each image sits _inside_ its post's rounded border, left-aligned, never overlapping the border or the post below                                                             |
| 3   | Placement survives normal rerenders            | press `R` ten times                                   | the `rerenders N` counter climbs; images do not flicker, move, or disappear (no re-transmission happens — the renderer's cache is hit)                                       |
| 4   | Placements can be removed                      | select a post, press `d`                              | the image vanishes and is replaced by `[image released — press d to restore]`; press `d` again and it comes back                                                             |
| 5   | Scrolling/selecting leaves no ghosts           | hold `j` to the bottom and `k` back to the top        | the selection border moves; images scroll with their posts; **no image fragment is ever left behind on a row that now shows text**, and no image is drawn outside a post box |
| 6   | Resize recovers cleanly                        | drag the window narrower, wider, shorter, taller      | posts reflow; images are re-prepared at the new cell budget (aspect preserved, no stretching); no torn rows; no leftover pixels in the newly exposed area                    |
| 7   | Exit clears image state                        | press `q`; then run `ls` and scroll the terminal back | shell prompt returns, **cursor is visible**, original screen contents restored, no image is drawn over the prompt or reappears when scrolling                                |

Extra checks worth doing while you are in there:

- **Fallback path.** `TERM=xterm-256color pnpm --filter @patches/terminal-media spike`
  in the same window: every post shows the §75 box
  (`┌ image · 1600×900 · png ─┐ / │ press o to open externally │ / └───┘`), sized to the
  post width, and `q` still exits cleanly.
- **Aspect ratios.** Post 4 is a 4:1 panorama and post 5 a 64px thumbnail — the panorama
  should be wide and short, the thumbnail small and _not_ upscaled.
- **tmux.** Inside tmux without `allow-passthrough`, the spike must report
  `kitty=false` and use the fallback box rather than spraying escape codes.
- **Stray keystrokes.** No `_Gi=…;OK` text should ever appear in the UI — that would mean
  a graphics command went out without `q=2`.

## Automated evidence that already exists

The interactive checks above cannot run in CI, but the parts that can be pinned down are:

| Claim                                                                                                                          | Test                                                         |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Escape sequences are byte-exact (transmit, chunking, delete, placeholder grid)                                                 | `src/protocol/kitty.test.ts` (24 cases)                      |
| The 297-entry diacritic table matches kitty's `gen/rowcolumn-diacritics.txt`                                                   | `src/protocol/diacritics.test.ts`                            |
| Chunks break at exactly 4096 base64 chars; continuations carry only `m`,`q`                                                    | `src/protocol/kitty.test.ts`                                 |
| The probe parses OK / error / DA1-only / cell-size replies, restores raw mode, times out, and never throws on a non-TTY        | `src/detect.test.ts` (with fake streams)                     |
| Images are scaled to fit the cell budget with aspect preserved, cached by content hash, and deleted with `d=I`                 | `src/renderer.test.ts`                                       |
| Ink passes the placeholder rows through untouched — SGR preserved, both diacritics intact, never ellipsised even when squeezed | `src/react/InlineImage.test.tsx` (via `ink-testing-library`) |
| Cleanup runs `unmount` → `releaseAll` → `exit`, exactly once                                                                   | `src/cleanup.test.ts`                                        |
| Non-TTY `--report` exits 0 without hanging; non-TTY interactive exits 1 with a message                                         | run both commands above in a pipe                            |
