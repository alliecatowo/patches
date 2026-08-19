---
name: edit-tool-strips-literal-control-bytes
description: hand-typing a string containing a literal ESC/control byte through Edit's old_string/new_string silently drops the byte — use a JS escape (\x1b) instead
metadata:
  type: feedback
---

Copying or retyping a string that is supposed to contain a literal control byte (e.g. a
bracketed-paste sequence `\x1b[200~...\x1b[201~` used to drive `stdin.write()` in an Ink
test) as an `old_string`/`new_string` argument to the Edit tool can silently drop the
invisible byte. The result parses fine (no syntax error) and looks identical in a
terminal/log, but is not byte-identical to the original — e.g. `'\x1b[200~...'` becomes
`'[200~...'`, which no longer matches whatever parser was looking for the real ESC byte
(Ink's bracketed-paste detector, `TextEditor`'s paste interceptor, etc.), so the test
fails with a confusing symptom (the literal markers show up in rendered output) rather
than an obvious "missing ESC" error.

**Why:** discovered writing `ComposeScreen.test.tsx`'s art-thumbnail tests (2026-08-19) —
a copy-pasted `stdin.write('[200~/tmp/dropped.png[201~')` (missing the ESC bytes the
original test had) inserted the paste as literal text instead of triggering the attach
flow, and the failure diff showed the escape markers as visible text with no hint that a
control byte was the actual problem.

**How to apply:** when a new test needs a control-byte-bearing stdin sequence (bracketed
paste, ANSI escapes, etc.), write it as an explicit JS escape in the string literal
(`'\x1b[200~...\x1b[201~'`) rather than hand-copying an existing literal-byte string
through a text-editing tool. If a paste/escape-driven test behaves as if the input were
plain text, suspect a dropped control byte before suspecting the component's own logic.
