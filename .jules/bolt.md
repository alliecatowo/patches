## 2026-09-22 - Caching dynamic RegExp instances in attribute parsing
**Learning:** In markup parsers, helper functions like `attributeValue` that construct `new RegExp(`${name}...`)` on every attribute extraction incur ~60% overhead from repeated RegExp compilation.
**Action:** Use a module-level `Map<string, RegExp>` cache when RegExp patterns are constructed from limited set of parameter strings (e.g., attribute names). Ensure `g` or `y` flags are not used so the RegExp instance remains stateless.
