## 2026-03-30 - Pre-allocate byte string and ANSI SGR lookups for terminal art rendering

**Learning:** Rendering terminal art (e.g. half-block images in `@patches/terminal-media`) calls `fgColor` and `bgColor` thousands of times per frame. Doing inline string formatting (`String(r)` or `\x1b[38;5;${idx}m`) and math (`Math.round((v / 255) * 5)`) generates thousands of small string allocations and CPU overhead per render.
**Action:** Pre-allocate static lookup tables for 0..255 byte strings (`BYTE_STRINGS`), color cube quantization (`CUBE_5`), and 256-color SGR escape strings (`ANSI_256_FG`, `ANSI_256_BG`).
