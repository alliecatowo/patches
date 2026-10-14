## 2026-10-14 - Mirrored Post Body Markup AST Parsers

**Learning:** Post body markup parser logic is intentionally duplicated in `@patches/markup` (`packages/markup/src/markup.ts`) and `apps/tui/src/format/markup.ts` to isolate TUI terminal layout/wrapping logic from shared package dependencies. When optimizing `parseInline` or AST generation in `@patches/markup`, the exact optimization must be mirrored in `apps/tui/src/format/markup.ts` (and vice-versa).
**Action:** Always check both `packages/markup/src/markup.ts` and `apps/tui/src/format/markup.ts` when introducing performance optimizations or fixes to inline body parsing.
