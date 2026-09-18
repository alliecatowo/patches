## 2026-03-31 - Fast-Path Regex & RegExp Hoisting in Markup Pipeline

**Learning:** `sanitizeForTerminal` and `parseInline` are invoked repeatedly for every rendered post, handle, title, and display name. Iterating character-by-character with `Set.has()` for sanitization and instantiating inline RegExp literals in `parseInline` and HTML attribute parsers created substantial CPU and allocation overhead (~2.01s per 1M calls for `sanitizeForTerminal` and ~828ms per 100k calls for `parseInline`). Adding a fast-path regex check (`/[\x00-\x09\x0b-\x1f\x7f-\x9f]/`) for clean text reduced sanitization time by ~88% (~0.23s per 1M calls), while hoisting RegExp constants to module scope reduced inline parsing time by ~23% (~635ms per 100k calls).

**Action:** When working on text parsing or rendering pipelines, check if standard inputs can bypass character-by-character loops via fast-path regexes, and ensure all static RegExp patterns are hoisted outside function scopes.
