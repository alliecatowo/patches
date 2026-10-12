# Palette's Journal - Critical UX & Accessibility Learnings

## 2026-08-27 - Dialog Modal Keyboard Dismissal & Backdrop Click Consistency
**Learning:** React modal dialogs (`role="dialog"`) on web require explicit `keydown` event listeners for the `Escape` key and backdrop click handlers (`onClick={onClose}` with `stopPropagation()` on dialog content) to support standard accessible modal navigation.
**Action:** Always include an `Escape` key `useEffect` listener and backdrop click handler when creating or auditing web modal dialog components.
