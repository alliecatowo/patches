## 2026-08-18 - Synchronizing parser optimizations across duplicated TUI and package modules

**Learning:** Post body markup parser logic is intentionally duplicated in `apps/tui/src/format/markup.ts` and `@patches/markup` (`packages/markup/src/markup.ts`). When optimizing parsing functions like `parseInline`, `extractMentions`, or `extractTags`, both files must be updated together to ensure TUI timeline rendering and backend/web markup parsing remain in sync and share fast-path performance gains.

**Action:** Whenever profiling or optimizing `parseInline` or related markup utilities in TUI, check `packages/markup/src/markup.ts` and apply equivalent trigger-based fast paths.
