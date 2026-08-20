#!/usr/bin/env bash
# PostToolUse: warn a subagent before its `maxTurns` cap aborts it.
#
# Hitting the cap is an abort, not a graceful stop — the agent is cut off mid-sentence and the
# orchestrator gets a fragment instead of a handoff. Three agents lost work this way before this
# existed. Warn while there is still room to commit and write the packet.
#
# Counts API requests (distinct message.id), not tool calls, so batching isn't penalised.
# Adds context only; never alters tool output. Silent for the orchestrator. Fails open.
set -uo pipefail
input="$(cat)" || exit 0

node -e '
let s = "";
process.stdin.on("data", (d) => (s += d));
process.stdin.on("end", () => {
  try {
    const payload = JSON.parse(s);
    const transcript = payload.transcript_path;
    const sessionId = payload.session_id ?? payload.sessionId;
    // The live payload carries agent_type + session_id but no agent_id.
    if (typeof transcript !== "string" || typeof sessionId !== "string") process.exit(0);

    // Mirrors `maxTurns:` in .claude/agents/*.md — keep in sync.
    const CAPS = { verifier: 40 };
    const agentType = payload.agent_type ?? payload.agentType;
    if (!agentType) process.exit(0);          // main orchestrator: no cap, exempt by design
    const cap = CAPS[agentType] ?? 100;

    const fs = require("fs");
    if (fs.statSync(transcript).size > 64 * 1024 * 1024) process.exit(0);

    const ids = new Set();
    for (const line of fs.readFileSync(transcript, "utf8").split("\n")) {
      if (!line) continue;
      try {
        const m = JSON.parse(line)?.message;
        if (typeof m?.id === "string" && m?.usage) ids.add(m.id);
      } catch {}
    }

    const left = cap - ids.size;
    const first = Math.max(6, Math.round(cap * 0.15));
    const last = Math.max(3, Math.round(cap * 0.05));
    if (left !== first && left !== last) process.exit(0);

    // Latch per threshold: a batched request fires PostToolUse once per call.
    const latch = require("path").join(
      require("os").tmpdir(),
      `claude-turnbudget-${sessionId.replace(/[^A-Za-z0-9_-]/g, "")}-${left}`,
    );
    try {
      fs.writeFileSync(latch, "", { flag: "wx" });
    } catch {
      process.exit(0);
    }

    const text =
      left === first
        ? `${left} of ${cap} requests left. The cap aborts you mid-sentence — commit what is green now.`
        : `${left} of ${cap} requests left. Stop starting work. Next message: done / left / paths you own / next step.`;

    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: `TURN BUDGET: ${text}` },
      }),
    );
  } catch {
    process.exit(0);
  }
});
' <<< "$input" 2>/dev/null

exit 0
