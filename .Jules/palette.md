## 2025-05-18 - WCAG 2.5.3 Label in Name & Toggle State Accessibility
**Learning:** Overriding visible text on a button with `aria-label` (e.g. replacing "Following" with "Unfollow") violates WCAG 2.5.3 (Label in Name) and breaks voice control / speech-to-text tools like Apple Voice Control. Use `aria-pressed={following}` to communicate state to screen readers while keeping accessible name aligned with visible text.
**Action:** For buttons with visible text, use standard state attributes like `aria-pressed` or `aria-expanded` rather than overriding `aria-label`.
