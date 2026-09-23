# Bolt's Journal - Critical Learnings

## 2026-03-30 - Dynamic RegExp allocation in markup parsing

**Learning:** Instantiating `new RegExp(...)` inside parsing loops or helpers like `attributeValue` creates unnecessary garbage collection pressure and regex compilation overhead on hot execution paths (e.g., rendering feed markup or HTML bodies).
**Action:** Use pre-compiled static regexes or module-scoped RegExp instances for static target attributes like `href`.
