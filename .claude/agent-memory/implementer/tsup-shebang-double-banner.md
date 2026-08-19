---
name: tsup-shebang-double-banner
description: adding banner.js '#!/usr/bin/env node' in tsup.config.ts to a CLI entry that already has that shebang as its own first source line produces two shebang lines in the output, which is a SyntaxError at runtime (a bare # on line 2), not a harmless duplicate
metadata:
  type: feedback
---

esbuild (which tsup wraps) already detects and preserves a leading `#!/usr/bin/env node`
shebang from the entry source file verbatim in the bundled output — that's automatic, no
config needed. If the `tsup.config.ts` _also_ sets `banner: { js: '#!/usr/bin/env node' }`
(a pattern that looks like harmless belt-and-braces), the output gets the shebang twice: once
from esbuild's own preservation, once prepended by the banner. The second line, `#!/usr/bin/env
node`, is not a comment in JS — a bare `#` is only special as the literal first two characters
of a file — so line 2 throws `SyntaxError: Invalid or unexpected token` the instant the bundle
is executed (`node dist/cli.js` failed outright with this).

**Why:** Found building `apps/tui/dist/cli.js` (P9-003/A-046) via a plain `pnpm --filter
@patches/tui build`; the build itself reported success (`tsup` doesn't validate the bundle's
JS at the file level beyond its own transform), and the bug only surfaced running the output.

**How to apply:** If the entry file already starts with a shebang line, don't also set
`banner.js` to the same shebang in `tsup.config.ts` — trust esbuild's built-in preservation.
Only add `banner.js` for a shebang if the entry file itself does _not_ already have one. Either
way, verify by literally running the built bin (`node dist/<entry>.js --version` or similar)
from outside the build tool, not just checking the build exited 0.

Related: [[tsup-noexternal-bundles-built-dist-not-source]]
