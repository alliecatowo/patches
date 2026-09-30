# Bolt's Journal

## 2026-09-02 - Uint8Array mask tracking for inline markup parsing

**Learning:** `parseInline` previously executed sequential regex scans while mutating a masked string copy with `masked.slice()` and `'\n'.repeat()` on every match to mask claimed spans. Using a Uint8Array byte mask (`claimed`) tracks claimed character ranges directly on the original string, eliminating string allocation overhead during post body parsing.
**Action:** Use Uint8Array character masks to track claimed spans across sequential regex passes without intermediate string slicing and allocations.
