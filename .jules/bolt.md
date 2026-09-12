## 2026-03-30 - Fast-path Regex Checks for Text Hot Paths

**Learning:** Character-by-character string iteration (with `codePointAt` and `Set.has`) and inline `RegExp` literal declarations in hot-path string parsers (`sanitizeForTerminal` and `parseInline`) create unnecessary loop overhead and GC pressure. Over 95% of normal post bodies/text contain no control characters or markdown syntax.

**Action:** Use a fast `test()` regex scan (`/
[\x00-\x08\x09\x0b-\x1f\x7f-\x9f]/` or `/
[*`_@#]|https?:\/\/|\[/u`) before entering heavy string loops or running multiple `matchAll`regexes, and hoist`RegExp` instances to module scope.
