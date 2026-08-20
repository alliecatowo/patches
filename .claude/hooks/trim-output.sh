#!/usr/bin/env bash
# PostToolUse (Bash): strip lossless noise from command output so verify/test runs don't
# drag redundant bytes through every future turn's context. Lossless-only: never drops,
# summarizes, or truncates diagnostics (a swallowed failing-test detail costs more turns to
# recover than the noise ever cost to keep). Fails open (exit 0, no output) on any error.
set -uo pipefail
input="$(cat)" || exit 0

node -e '
let s = "";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  try {
    const payload = JSON.parse(s);
    const tr = payload.tool_response;
    const out = typeof tr === "string" ? tr : (tr && (tr.stdout ?? tr.output));
    if (typeof out !== "string" || out.length === 0) process.exit(0);

    let text = out;
    // Strip ANSI/CSI and OSC escape sequences (color, cursor movement) — purely cosmetic.
    text = text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
    text = text.replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "");
    text = text.replace(/\r/g, "");

    // Drop pnpm/turbo lifecycle banner lines and repeated engine-mismatch warnings.
    // These never carry diagnostic content (no error/failure detail), only repeat per package.
    const bannerRe = /^(?:>\s|Scope:\s|Lifecycle scripts|Progress: resolved|Packages: [+-]|\s*Packages in scope|cache (?:hit|miss|bypass|status)|Tasks:\s+\d+ (?:successful|total)|\s*Cached:\s|\s*Time:\s+[\d.]+m?s\b|\s*•\s)/;
    const engineWarnRe = /\[WARN\]\s+Unsupported engine/;

    const lines = text.split("\n").filter((l) => !bannerRe.test(l) && !engineWarnRe.test(l));

    // Collapse runs of 3+ blank lines to a single blank line.
    let collapsed = lines.join("\n").replace(/\n{3,}/g, "\n\n");

    if (collapsed === out) process.exit(0);

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        updatedToolOutput: collapsed,
      },
    }));
  } catch {
    process.exit(0);
  }
});
' <<< "$input" 2>/dev/null

exit 0
