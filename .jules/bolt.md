## 2025-05-18 - Fast-path character scans for string sanitization and UTF-8 encoding

**Learning:** Running multiple global regex `.replace()` passes (or `TextEncoder.encode()`) on string validation primitives creates significant CPU and garbage collection overhead even when inputs are clean. Performing an O(N) `charCodeAt()` scan first allows clean text (>90-95% of inputs) to bypass allocations and regex execution entirely.

**Action:** Before applying multi-pass regex replacements or object allocations on high-frequency string transformers, write an O(N) `charCodeAt()` fast path to return clean string inputs directly with zero allocations.
