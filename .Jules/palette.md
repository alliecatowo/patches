## 2026-05-19 - Isolate Focus Restoration in Modal Dialogs
**Learning:** Modal components like `MediaLightbox` that trap keyboard focus and restore focus on close should separate the focus capture/restoration `useEffect([isOpen])` from event handler `useEffect`s that contain volatile dependencies (like callback props or item arrays). Bundling them into one effect causes focus cleanup/refocus when those dependencies change while the modal remains open.
**Action:** Always place `previousActiveElement` capture and restore in a standalone `useEffect` depending strictly on `isOpen`.
