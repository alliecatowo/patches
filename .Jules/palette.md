## 2025-05-18 - Keyboard Activation on Role Buttons & Contextual Delete Labels

**Learning:** Custom interactive elements using `role="button"` require `event.preventDefault()` on Space/Enter keypresses to prevent default browser page scrolling on Space. In addition, generic icon-only actions inside repeated lists (e.g. "Remove block") must include item details in `aria-label` (e.g. `Remove Text block: [preview]`) so screen reader users know which specific element is being modified.
**Action:** Always inspect `onKeyDown` handlers on `role="button"` for missing `event.preventDefault()`, and ensure list item buttons interpolate item context in their `aria-label`.
