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
    // No agent id => this is the main orchestrator, which has no cap and is exempt by design.
    const agentId = payload.agent_id ?? payload.agentId;
    const transcript = payload.transcript_path;
    if (!agentId || typeof transcript !== "string") process.exit(0);

    // Mirrors the `maxTurns:` frontmatter in .claude/agents/*.md. Keep the two in sync.
    const CAPS = {
      verifier: 12,
      researcher: 20,
      reviewer: 20,
      "docs-writer": 20,
      "harness-tuner": 20,
      architect: 30,
      "spec-auditor": 35,
      implementer: 40,
    };
    const agentType = payload.agent_type ?? payload.agentType;
    const cap = CAPS[agentType];
    if (cap === undefined) process.exit(0);

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
    if (left !== 6 && left !== 3) process.exit(0);

    // A batched request fires PostToolUse once per tool call, all at the same request count —
    // latch each threshold so a well-batched agent is warned once, not four times.
    const os = require("os");
    const path = require("path");
    const latch = path.join(
      os.tmpdir(),
      `claude-turnbudget-${String(agentId).replace(/[^A-Za-z0-9_-]/g, "")}-${left}`,
    );
    try {
      fs.writeFileSync(latch, "", { flag: "wx" });
    } catch {
      process.exit(0); // already warned at this threshold
    }

    const text =
      left === 6
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
