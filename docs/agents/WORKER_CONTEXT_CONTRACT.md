# Bounded worker context contract

Autonomous workers receive a fresh JSON packet produced by
`node scripts/worker-context.mjs`. The packet contains only the issue, relevant changed files,
the compact workpad, exact CI failure evidence, the prior attempt, and targeted commands. A
retry packet sets `ciRepair.discoveryRequired: false`; it is self-contained and must not replay
the prior Codex transcript or rediscover facts already supplied by the harness.

The packer excludes `tasks.md`, `INITIAL_VISION.md`, `pnpm-lock.yaml`, generated/build output,
archives, lockfiles, and dependency trees by default. It keeps at most 40 changed files and 8
targeted commands, caps command output at 6,000 characters/120 lines, caps issue/workpad fields at
4,000 characters/80 lines, and caps the whole packet at 32,000 UTF-8 bytes (and 32,000
characters). Consecutive duplicate
command-output lines are collapsed. A retry must pass CI evidence (`pr`, commit SHA, failed check
name, conclusion, and URL); the old Codex transcript is never an input field.

Telemetry reports packet characters and UTF-8 bytes and may include input/output tokens, transcript
bytes, tool calls, wall time, and outcome.
Input at 40,000 tokens warns and at 60,000 tokens stops the worker; three no-progress turns stop
the worker; 8,000 characters of context growth requests compression; output at 12,000 tokens
raises a warning. These are hard per-turn guardrails, not a replacement for concise prompts and
handoffs. The representative regression fixtures cover small, normal, and CI-repair packets and
assert the 32,000-character budget plus preservation of failure evidence and completion outcome.

Regression proof: `node --test scripts/worker-context.test.mjs`.

## Adoption

After this change merges, a new worker should be based on the refreshed
`origin/main` and its driver should build the initial prompt with
`node scripts/worker-context.mjs` (JSON on stdin/stdout). CI retries should
construct a fresh packet from the current issue, changed-file inventory, workpad,
failed checks, and prior-attempt summary; they must not append the previous
conversation. The returned `telemetry.action` is the driver guard: `stop`
terminates a runaway turn, while `compress` requires a smaller packet before
dispatch.
