#!/usr/bin/env bash
# PostToolUse (all tools): warn a subagent as it approaches its `maxTurns` cap.
#
# Why this exists: hitting `maxTurns` is an ABORT, not a graceful wind-down — the binary's own
# message is "hit max turns, aborting". The agent is cut off wherever it happens to be, which is
# usually mid-thought, and the orchestrator gets a fragment instead of a handoff. An agent can
# only write a handoff packet if it knows the cap is coming, so tell it while it can still act.
#
# Counts real API requests (distinct `message.id` in the agent's own transcript), not tool calls —
# a well-batched agent issues several tool calls per request, and counting calls would warn it
# absurdly early precisely for doing the right thing.
#
# Adds context only; never modifies or suppresses tool output. Fails open (exit 0, silent).
set -uo pipefail
input="$(cat)" || exit 0

node -e '
let s = "";
process.stdin.on("data", (d) => (s += d));
process.stdin.on("end", () => {
  try {
    const payload = JSON.parse(s);
    const transcript = payload.transcript_path;
    if (typeof transcript !== "string") process.exit(0);

    // The real payload (verified against a live subagent run, see LEARNINGS.md) has no
    // `agent_id`/`agentId` field at all — only `agent_type`/`session_id`. The original check
    // required agent_id AND agent_type AND transcript_path, so it exited silently on every
    // single call. `session_id` is the per-agent identifier now; `agent_type` is present and
    // correctly named already.
    const sessionId = payload.session_id ?? payload.sessionId;
    if (typeof sessionId !== "string") process.exit(0);

    // Mirrors the `maxTurns:` frontmatter in .claude/agents/*.md. Keep the two in sync.
    const CAPS = {
      verifier: 40,
      researcher: 100,
      reviewer: 100,
      "docs-writer": 100,
      "harness-tuner": 100,
      architect: 100,
      "spec-auditor": 100,
      implementer: 100,
    };
    const agentType = payload.agent_type ?? payload.agentType;
    let cap = agentType ? CAPS[agentType] : undefined;
    if (cap === undefined) {
      if (agentType) process.exit(0); // a real, known-but-uncapped agent type — nothing to warn
      // No agent_type at all: usually the main orchestrator (no cap, exempt by design). But a
      // subagent transcript is identifiable by its path shape even without agent_type, so fall
      // back to the most common cap rather than staying silent — a slightly-wrong warning beats
      // no warning for a subagent that would otherwise run unbounded.
      const looksLikeSubagentTranscript = /\/tasks\/[^/]+\.output$/.test(transcript);
      if (!looksLikeSubagentTranscript) process.exit(0);
      cap = 40;
    }

    const fs = require("fs");
    let stat;
    try {
      stat = fs.statSync(transcript);
    } catch {
      process.exit(0);
    }
    if (stat.size > 64 * 1024 * 1024) process.exit(0);

    const ids = new Set();
    for (const line of fs.readFileSync(transcript, "utf8").split("\n")) {
      if (line === "") continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const message = entry?.message;
      if (typeof message?.id === "string" && message?.usage) ids.add(message.id);
    }

    const used = ids.size;
    const left = cap - used;
    // Two warnings only: one with room to finish the work, one to stop and write the packet.
    // Proportional to the cap: a fixed "6 remaining" is ample at cap 40 and far too late at
    // cap 100, where an agent needs room to land a commit before the abort.
    const firstWarn = Math.max(6, Math.round(cap * 0.15));
    const lastWarn = Math.max(3, Math.round(cap * 0.05));
    if (left !== firstWarn && left !== lastWarn) process.exit(0);

    // A batched request fires PostToolUse once per tool call, all at the same request count —
    // latch each threshold so a well-batched agent is warned once, not four times.
    const os = require("os");
    const path = require("path");
    const latch = path.join(
      os.tmpdir(),
      `claude-turnbudget-${String(sessionId).replace(/[^A-Za-z0-9_-]/g, "")}-${left}`,
    );
    try {
      fs.writeFileSync(latch, "", { flag: "wx" });
    } catch {
      process.exit(0); // already warned at this threshold
    }

    const text =
      left === firstWarn
        ? `TURN BUDGET: ${used}/${cap} requests used, ${left} left. Hitting the cap is an abort, ` +
          `not a graceful stop — you will be cut off mid-sentence and your caller gets a fragment. ` +
          `Land what is already green now: commit the paths you own, then keep going only if the ` +
          `remaining work genuinely fits.`
        : `TURN BUDGET: ${used}/${cap} requests used, ${left} left. STOP starting new work. Commit ` +
          `what is green, then make your very next message the handoff packet: done / left / paths ` +
          `you own / the single next concrete step. A fresh agent continues from it.`;

    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: text,
        },
      }),
    );
  } catch {
    process.exit(0);
  }
});
' <<< "$input" 2>/dev/null

exit 0
