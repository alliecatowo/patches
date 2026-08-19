# Terminal ASCII / pixel-art image rendering (non-Kitty fallback)

Verified 2026-08-19 against: [Unicode 17.0 code chart — Block Elements, U+2580–U+259F](https://www.unicode.org/charts/PDF/U2580.pdf) ·
[Unicode 17.0 code chart — Braille Patterns, U+2800–U+28FF](https://www.unicode.org/charts/PDF/U2800.pdf) ·
[xterm `ctlseqs.html`](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html) ·
[xterm `256colres.pl`](https://raw.githubusercontent.com/ThomasDickey/xterm-snapshots/master/256colres.pl) (xterm's own generator for its 256-color resource table) ·
[chalk/`ansi-styles` `rgbToAnsi256`](https://github.com/chalk/ansi-styles/blob/main/index.js) ·
[jonasjacek/colors](https://github.com/jonasjacek/colors) (community reference table, cross-checked against `256colres.pl`) ·
[drawille `drawille.py`](https://raw.githubusercontent.com/asciimoo/drawille/master/drawille.py) ·
[termstandard/colors ("true color" survey, formerly XVilka's gist)](https://github.com/termstandard/colors) ·
[chafa](https://hpjansson.org/chafa/) · [timg](https://github.com/hzeller/timg) · [no-color.org](https://no-color.org)

**Bottom line:** this package's non-Kitty fallback has two renderers, both already implemented
(`packages/terminal-media/src/art/`): `HalfBlockRenderer` (two pixels/cell via U+2580/U+2584 +
truecolor-or-256-color SGR) and `AsciiRenderer` (colourless luminance ramp, one glyph/cell). A
third technique — Unicode Braille Patterns (U+2800–U+28FF) for a 2×4 dot matrix per cell — is
**documented here for a future variant but not implemented in v0**. The half-block + 256-color
pieces rest on a mix of formally-documented facts (Unicode chart, xterm's own source) and
widely-used-but-informally-specified conventions (the truecolor SGR extension, the RGB→256
quantization rounding formula); both are flagged explicitly below.

---

## 1. Half-block technique (U+2580/U+2584 + truecolor SGR)

### Documented: the glyphs

Unicode 17.0 code chart, **Block Elements, range 2580–259F** (fetched directly as the PDF chart):

| Code point              | Name                                                           |
| ----------------------- | -------------------------------------------------------------- |
| U+2580 `▀`              | UPPER HALF BLOCK                                               |
| U+2584 `▄`              | LOWER HALF BLOCK                                               |
| U+2588 `█`              | FULL BLOCK                                                     |
| U+258C `▌` / U+2590 `▐` | LEFT HALF BLOCK / RIGHT HALF BLOCK                             |
| U+2596–U+259F           | QUADRANT … (2×2 quadrant glyphs — what `timg -p quarter` uses) |

Source: `https://www.unicode.org/charts/PDF/U2580.pdf`, "The Unicode Standard, Version 17.0,
Copyright © 1991–2025 Unicode, Inc." page 265. This is the primary/official specification per
research priority order §1.

The half-block technique: one cell = two vertically stacked source pixels. Draw `▀`
(UPPER HALF BLOCK) with the **foreground** SGR color set to the top pixel and the **background**
SGR color set to the bottom pixel — two pixels, one glyph, one cell.

### Documented (mostly) / widely-used convention: truecolor SGR

xterm's own `ctlseqs.html` (fetched directly) documents, under SGR:

> `CSI Ps = 3 8 : 2 : Pi : Pr : Pg : Pb ⇒ Set foreground color using RGB values.` (`Pr`/`Pg`/`Pb`
> range 0–255) — this is the **colon-delimited form**, which xterm's docs tie to ISO-8613-6
> (the international standard `ctlseqs.html` cites for the general `38:…`/`48:…` selective
> graphic rendition parameter structure).
>
> `CSI Ps = 3 8 ; 2 ; Pr ; Pg ; Pb ⇒ Set foreground color using RGB values … for compatibility
with KDE konsole.` — the **semicolon-delimited form**.
>
> "xterm allows either colons (standard) or semicolons (legacy) to separate the subparameters
> (but after the first colon, colons must be used)."

**Inferred/flagged:** xterm's own doc is explicit that the semicolon form (`\x1b[38;2;r;g;bm` /
`\x1b[48;2;r;g;bm` — the form virtually every terminal-graphics tool actually emits, including
what this package emits) is a **legacy compatibility variant**, not the ISO-8613-6-aligned form.
Neither form is part of ECMA-48 itself (ECMA-48 defines the `SGR 38`/`48` parameter numbers as
"reserved for future standardization" territory that ISO-8613-6 and vendors filled in
independently) — there is **no single canonical spec for the semicolon 24-bit form**; it's a
convention that xterm documents as vendor-compatibility and that the terminal ecosystem
(iTerm2, kitty, Alacritty, Ghostty, VTE/GNOME Terminal, Windows Terminal) converged on as a de
facto standard. The community survey most commonly cited for "which terminals support this" is
[`termstandard/colors`](https://github.com/termstandard/colors) (successor to the original
XVilka gist) — cited here as a secondary/community source per research priority §5, since no
higher-priority source enumerates terminal-by-terminal support.

```
\x1b[38;2;<r>;<g>;<b>m   set foreground truecolor
\x1b[48;2;<r>;<g>;<b>m   set background truecolor
\x1b[39m / \x1b[49m       reset foreground / background only
\x1b[0m                   full SGR reset
```

### Prior art: chafa, timg

[chafa](https://hpjansson.org/chafa/) (fetched): "Outputs to all popular terminal graphics
formats: Sixels, Kitty, iTerm2, Unicode mosaics," with "Multiple color modes, including
Truecolor, 256-color, 16-color and simple FG/BG," and its symbol mode can be constrained to
"using only U+2580 (upper half block)" or the richer default that "combin[es] Unicode symbols
from multiple selectable ranges for optimal output" — i.e. half-block is chafa's simplest
fallback symbol mode, with more elaborate Unicode-mosaic modes layered on top.

[timg](https://github.com/hzeller/timg) (fetched) documents its fallback explicitly:

> "The half block pixelation (`-p half`) uses the unicode character ▄ (U+2584 - 'Lower Half
> Block') _or_ ▀ (U+2580 - 'Upper Half Block') … The quarter block pixelation (`-p quarter`)
> uses eight different blocks … With both of these pixelations, choosing the foreground color
> and background 24-bit color, `timg` can simulate 'pixels'."

Both confirm: half-block + truecolor (or 256-color) SGR is the standard non-Sixel/Kitty terminal
image fallback technique, and both timg and chafa treat it as their lowest common denominator.

### This package

`packages/terminal-media/src/art/halfblock-renderer.ts` implements exactly this: `▀` per cell,
foreground = top sample pixel, background = bottom sample pixel, degrading gracefully to a
`RESET_BG`-only glyph when one half is transparent (see `ALPHA_OPAQUE_THRESHOLD` in
`src/art/shared.ts`). Color emission is delegated to `src/art/color.ts` (`fgColor`/`bgColor`),
which picks truecolor or 256-color escapes per §2 below.

---

## 2. 256-color xterm palette quantization

### Documented: palette structure

`ctlseqs.html` (fetched): "XTerm maintains a color palette whose entries are identified by an
index beginning with zero. If 88- or 256-color support is compiled, [SGR `38:5:Ps` / `48:5:Ps`
select indexed color] apply." This establishes the **existence and SGR syntax** of the indexed
256-color palette as xterm-documented, official-project-docs fact (priority §2). `ctlseqs.html`
does **not** itself enumerate the specific RGB value at each of the 256 indices.

### Documented (primary/source-code level): the actual RGB values

The specific layout — **16 basic colors (0–15), a 6×6×6 RGB cube (16–231), a 24-step grayscale
ramp (232–255)** — and its exact numbers come from xterm's own resource-table generator,
[`256colres.pl`](https://raw.githubusercontent.com/ThomasDickey/xterm-snapshots/master/256colres.pl)
(maintained by Thomas Dickey, xterm's maintainer; this is priority §3, "official source
repository," per the spec's own precedent of reading TypeORM source directly). Verbatim:

```perl
# colors 16-231 are a 6x6x6 color cube
for ($red = 0; $red < 6; $red++) {
  for ($green = 0; $green < 6; $green++) {
    for ($blue = 0; $blue < 6; $blue++) {
      $code = 16 + ($red * 36) + ($green * 6) + $blue;
      # RGB channel value: 0 if the axis index is 0, else axis*40 + 55
      # -> axis values 0,1,2,3,4,5 produce RGB 0, 95, 135, 175, 215, 255
    }
  }
}

# colors 232-255 are a grayscale ramp, intentionally leaving out black and white
for ($gray = 0; $gray < 24; $gray++) {
  $level = ($gray * 10) + 8;   # 8, 18, 28, ... 238
  $code = 232 + $gray;
}
```

So: cube index `= 16 + 36*R + 6*G + B` for `R,G,B ∈ {0..5}`, with axis intensity
`{0, 95, 135, 175, 215, 255}`; grayscale index `232 + n` for `n ∈ {0..23}` with level `10n + 8`
(8 → 238). Cross-checked against the independently-maintained
[jonasjacek/colors](https://github.com/jonasjacek/colors) table: index 16 = `#000000`, index 17
= `#00005f` (0,0,95), index 21 = `#0000ff` (0,0,255, the R=0,G=0,B=5 corner — matches
`16+36*0+6*0+5=21`), index 232 = `#080808` (8,8,8), index 233 = `#121212` (18,18,18), index 255
= `#eeeeee` (238,238,238) — all consistent with `256colres.pl`.

### Widely-used convention, no single canonical spec: the _quantization/rounding_ formula

Given an arbitrary truecolor RGB triple, mapping it to the _nearest_ palette index is not
specified by xterm or Unicode at all — it's purely a client-side nearest-neighbor problem. The
formula this package uses (`packages/terminal-media/src/art/color.ts` `rgbToAnsi256`):

```ts
// non-gray:
ansi256 = 16 + 36 * round((r / 255) * 5) + 6 * round((g / 255) * 5) + round((b / 255) * 5);
// gray (r===g===b): r<8 -> 16, r>248 -> 231, else round((r-8)/247*24) + 232
```

This is **verbatim the algorithm in
[chalk/ansi-styles `rgbToAnsi256`](https://github.com/chalk/ansi-styles/blob/main/index.js)**
(fetched directly — the same special-case-grayscale-then-cube-round structure, comment included:
"We use the extended greyscale palette here, with the exception of black and white"). ansi-styles
itself does not cite a primary source for the rounding approach in its comments — it is simply
the convention the JS terminal-color ecosystem (chalk, `color-convert`, and by extension most
CLI tools) converged on. **Flagged: no canonical spec for this exact rounding formula** — it is
inferred/derived (round each axis to nearest of 6 cube steps; use the extended grayscale ramp,
not the cube, for true grays) rather than documented anywhere upstream. It is, however, the
industry-standard approach and reproduces the "closest reasonable index" for every value we
checked against the `256colres.pl`-derived table.

---

## 3. Braille Patterns (U+2800–U+28FF) — documented for a future variant, **not implemented in v0**

This package's actual colorless fallback is `AsciiRenderer`
(`packages/terminal-media/src/art/ascii-renderer.ts`), a **luminance-ramp** renderer — see §3b.
Braille dot art is a plausible higher-density future addition (more spatial resolution per cell
than the ramp, still colorless) and is researched here so a future implementer doesn't have to
re-derive the bit mapping.

### Documented: the block and its naming convention

Unicode 17.0 code chart, **Braille Patterns, range 2800–28FF** (fetched directly as the PDF
chart, pages 285–288). Every code point's official name directly encodes its bit pattern, e.g.:

| Code point | Name                              | Bit        |
| ---------- | --------------------------------- | ---------- |
| U+2801     | BRAILLE PATTERN DOTS-**1**        | bit 0      |
| U+2802     | BRAILLE PATTERN DOTS-**2**        | bit 1      |
| U+2804     | BRAILLE PATTERN DOTS-**3**        | bit 2      |
| U+2808     | BRAILLE PATTERN DOTS-**4**        | bit 3      |
| U+2810     | BRAILLE PATTERN DOTS-**5**        | bit 4      |
| U+2820     | BRAILLE PATTERN DOTS-**6**        | bit 5      |
| U+2840     | BRAILLE PATTERN DOTS-**7**        | bit 6      |
| U+2880     | BRAILLE PATTERN DOTS-**8**        | bit 7      |
| U+28FF     | BRAILLE PATTERN DOTS-**12345678** | all 8 bits |

i.e. code point `= 0x2800 + Σ(2^(dot_number − 1))` for each of the 8 raised dots — this is
directly readable off the Unicode names themselves, not an inference. The chart's own note:
"When braille patterns are punched, the filled circles shown here correspond to punch
impression."

### Documented (source code): the 2×4 spatial layout used by prior art

The Unicode chart names the bits but not their on-screen _position_ — that's the standard 6/8-dot
braille cell layout, which [drawille](https://github.com/asciimoo/drawille)'s source states
explicitly (`drawille.py`, fetched directly, citing
`http://www.alanwood.net/unicode/braille_patterns.html`):

```python
# dots:
#    ,___,
#    |1 4|
#    |2 5|
#    |3 6|
#    |7 8|
pixel_map = (
    (0x01, 0x08),  # row 0: dot1 (top-left)         dot4 (top-right)
    (0x02, 0x10),  # row 1: dot2 (upper-mid-left)    dot5 (upper-mid-right)
    (0x04, 0x20),  # row 2: dot3 (lower-mid-left)    dot6 (lower-mid-right)
    (0x40, 0x80),  # row 3: dot7 (bottom-left)       dot8 (bottom-right)
)
# final char = chr(0x2800 | OR of the pixel_map bits for every "on" dot)
```

This matches the mapping described in the task brief exactly: dot1=bit0 (top-left), dot2=bit1,
dot3=bit2, dot4=bit3 (top-right), dot5=bit4, dot6=bit5, dot7=bit6 (bottom-left, the 8-dot
extension row), dot8=bit7 (bottom-right) — a 2-wide × 4-tall dot matrix per cell, four times the
spatial resolution of the half-block technique (at the cost of being colorless, or requiring one
color per whole cell rather than per dot).

**Not implemented in v0.** If a future `BrailleRenderer` is built, it belongs alongside
`HalfBlockRenderer`/`AsciiRenderer` in `packages/terminal-media/src/art/`, sharing
`computeArtGrid`/`sampleImage` from `art/shared.ts`, thresholding each of the 8 sub-cell samples
against a luminance (or alpha) cutoff to decide "dot on/off," then OR-ing `pixel_map` bits per
the table above.

### 3b. What v0 actually implements: the luminance-ramp `AsciiRenderer`

`packages/terminal-media/src/art/ascii-renderer.ts` renders one glyph per cell (no half-block
split) from the ramp `' .:-=+*#%@'` (space = darkest/blank, `@` = densest/brightest), selected by
per-pixel luminance with a 4×4 Bayer ordered-dither matrix to avoid banding. Luminance uses
`0.299R + 0.587G + 0.114B` — the ITU-R BT.601 luma coefficients, the conventional weighting for
8-bit gamma-encoded RGB (BT.709 coefficients, `0.2126/0.7152/0.0722`, are the alternative for
HD/linear-light content; BT.601 is the long-standing convention for exactly this kind of
"map 8-bit RGB to a perceived-brightness ramp" use). **This is a documented ITU convention, not
independently re-verified against the ITU-R BT.601 text itself for this note** — flagged as
inferred/widely-accepted rather than freshly cited against the primary ITU document.
Luminance-ramp ASCII art itself (mapping brightness to glyph density) is a decades-old convention
predating any single canonical spec; chafa's own "symbols" mode is a much richer version of the
same idea (multi-glyph selection by shape-matching, not just brightness).

---

## 4. NO_COLOR

[no-color.org](https://no-color.org) (fetched, exact quote):

> "Command-line software which adds ANSI color to its output by default should check for a
> `NO_COLOR` environment variable that, when present **and not an empty string** (regardless of
> its value), prevents the addition of ANSI color."

**Discrepancy to flag:** the convention's precise text excludes an _empty-string_ `NO_COLOR`
(`NO_COLOR=` with nothing after `=`) from disabling color — only "present and non-empty" counts.
`packages/terminal-media/src/art/color.ts`'s `detectColorSupport` currently checks
`env['NO_COLOR'] !== undefined`, which treats `NO_COLOR=` (empty string, still "present" in
`process.env`) as disabling color too. This is a minor deviation from the letter of the
convention — worth a one-line fix (`env['NO_COLOR']` truthy-and-defined, i.e. also reject `''`)
but not a spec/ADR-level issue; flagging for the implementer, not fixing here (out of this
agent's scope).

---

## 5. Summary: what's documented vs. inferred

| Claim                                                              | Status                                                                                                                                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U+2580/U+2584 names, Block Elements range                          | **Documented** — Unicode 17.0 chart (official spec)                                                                                                                                   |
| U+2800–U+28FF names encode dot bits via "DOTS-N"                   | **Documented** — Unicode 17.0 chart (official spec)                                                                                                                                   |
| Braille 2×4 spatial dot layout (1/2/3/7 left, 4/5/6/8 right)       | **Documented** — drawille source, citing alanwood.net; matches the standard 8-dot braille cell used throughout the braille-computing world, not drawille-specific                     |
| `38;2;r;g;b` / `48;2;r;g;b` truecolor SGR                          | **Convention** — xterm's own docs call the semicolon form a legacy/konsole-compat variant of the ISO-8613-6-derived colon form; no ECMA-48/ISO spec defines the semicolon form itself |
| 6×6×6 cube axis values `{0,95,135,175,215,255}`, grayscale `8+10n` | **Documented** — xterm's own `256colres.pl` source (official source repository)                                                                                                       |
| RGB→256 nearest-index rounding formula                             | **Convention** — matches chalk/ansi-styles; no upstream spec, but industry-standard                                                                                                   |
| Half-block as the standard non-Sixel/Kitty fallback                | **Documented** (project docs) — both chafa and timg's own docs describe this exact technique                                                                                          |
| NO_COLOR: "present (regardless of value)" disables color           | **Documented** — no-color.org verbatim, _with_ the "and not an empty string" qualifier this package's current check doesn't yet honor                                                 |
| BT.601 luma weights for the ASCII ramp                             | **Inferred** — standard convention, not re-verified against the ITU-R BT.601 text for this note                                                                                       |

## Suggested follow-up (not this agent's scope to act on)

- **Rule change, not ADR-level:** `detectColorSupport` in `art/color.ts` should treat
  `NO_COLOR=''` (present-but-empty) as color-enabled per the literal no-color.org text — a small
  implementer fix, flagged above.
- No discrepancy here rises to ADR-level: v0's renderer choices (half-block + 256/truecolor SGR,
  luminance-ramp ASCII, braille deferred) all match documented prior art and spec §153's
  "TUI must always have a non-Kitty fallback." No architectural deviation to record.

```

```
