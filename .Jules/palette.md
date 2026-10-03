# Palette's Journal - Critical Learnings

## 2026-03-30 - Standardizing Tablist & Live Counter ARIA Roles

**Learning:** Timeline switcher navigation tabs and dynamic live counters (e.g. radial progress counters) in web routes often default to generic `<div>` or `<button>` elements without explicit screen reader tab or status roles. Adding `role="tablist"`/`role="tab"`/`role="tabpanel"` and `role="status"` with `aria-live="polite"` provides immediate screen reader feedback without impacting styling.
**Action:** When inspecting navigation tab bars or live input counters, ensure standard ARIA tab controls and status live regions are declared along with `aria-hidden="true"` on decorative progress SVGs.
