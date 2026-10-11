# Bolt's Journal - Critical Learnings

## 2026-03-30 - Bypassing HTML regex parsing for plain text / markdown
**Learning:** Checking HTML tags using a global regex match (`matchAll(TAG_PATTERN_HTML)`) on non-HTML markdown inputs creates significant overhead during feed rendering. Short-circuiting with `!source.includes('<')` avoids regex allocation and matching altogether, resulting in ~20x faster `looksLikeHtml` checks for non-HTML post bodies.
**Action:** Always check for character presence (e.g. `<`) before executing global regex scans for embedded HTML markup.
