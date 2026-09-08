## 2026-03-31 - Fast-Path Regex Check for Text Sanitization

**Learning:** `sanitizeForTerminal` runs on every text string rendered in TUI and web post bodies. Over 99% of user-supplied text contains no control characters or tabs. Performing character-by-character code point iteration and string concatenation on clean strings adds unnecessary overhead.
**Action:** Use a fast-path regex (`/[\x00-\x08\x09\x0b-\x1f\x7f-\x9f]/u`) to test strings first; if no control characters or tabs are present, return the string immediately without character iteration or allocation.
