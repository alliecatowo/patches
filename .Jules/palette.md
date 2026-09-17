## 2026-09-17 - Decoupling Modal Focus Management from Internal State

**Learning:** In React modal dialogs/overlays (like lightboxes), capturing `document.activeElement` for focus restoration must be isolated to an effect that runs strictly when `isOpen` transitions to true. Bundling focus capture in an effect that re-runs when internal state changes (e.g. navigating between items) overwrites `previousFocusRef` with elements inside the unmounting modal.
**Action:** Always place `previousFocusRef` capture and restoration in a dedicated `useEffect` with `[isOpen]` as its sole dependency array.
