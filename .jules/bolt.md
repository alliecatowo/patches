## 2026-03-31 - Memoize AST markup parsing & plain text inline fast-path

**Learning:** Post feed timelines re-render frequently (due to polling, focus index changes, interactions). Unmemoized `parseMarkup` calls in components like `RichBody` force complete AST parsing and regex execution on every render cycle. Additionally, `parseInline` runs 7 separate `matchAll` regex loops over text; plain text lines without backticks, bold/italic symbols, links, mentions, or tags can skip all regex scanning via a simple trigger test (`/[`*_\n[\]@#]|https?:\/\//u`).

**Action:** Wrap rich text AST rendering components with `React.memo` and `useMemo` for parsing, and add early-exit trigger checks before executing multiple regex passes over plain text strings.
