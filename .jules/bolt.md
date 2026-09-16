## 2026-09-16 - Character Array Mutation vs String Slicing in V8

**Learning:** Replacing string slicing (`masked.slice(...)`) with array-based character mutation (`text.split('')`, `maskedChars.fill()`, `maskedChars.join('')`) in `parseInline` actually degraded performance by ~2.8x (2.097s vs 750ms). V8 optimizes short string slicing and string primitives heavily, while creating character arrays and calling `.join('')` allocates array objects and triggers extra garbage collection overhead.
**Action:** Always benchmark string manipulation micro-optimizations in V8 before assuming array/buffer conversions are faster. Prefer component-level memoization (`useMemo`, `React.memo`) for parsed ASTs over micro-optimizing string operations when parsing costs are DOM/React re-render bound.
