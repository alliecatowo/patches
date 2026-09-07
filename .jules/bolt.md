## 2026-03-31 - [Inline Markup Parsing Optimization]

**Learning:** `RegExp.prototype.matchAll` and `Array.prototype.some` create non-trivial short-lived array allocations in high-frequency string parsing paths like post body rendering. Replacing `matchAll` with pre-compiled `RegExp.prototype.exec` and building masked strings iteratively reduced `parseInline` runtime by ~33%.
**Action:** Use pre-compiled regexes and `exec()` loops with `Set` lookups when parsing text hot paths.
