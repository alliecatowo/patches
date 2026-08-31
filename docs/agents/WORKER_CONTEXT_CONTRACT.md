# Bounded worker context contract

Autonomous workers receive a fresh JSON packet produced by
`node scripts/worker-context.mjs`. The packet contains only the issue, relevant changed files,
the compact workpad, exact CI failure evidence, the prior attempt, and targeted commands.

The packer excludes `tasks.md`, `INITIAL_VISION.md`, `pnpm-lock.yaml`, generated/build output,
archives, and dependency trees by default. Command output is capped at 6,000 characters and the
whole packet is capped at 32,000 characters. A retry must pass CI evidence (`pr`, commit SHA,
failed check name, conclusion, and URL); the old Codex transcript is never an input field.

Telemetry may include input/output tokens and transcript bytes. Input at 40,000 tokens warns and
at 60,000 tokens stops the worker; output at 12,000 tokens raises a warning. These are guardrails,
not a replacement for concise prompts and handoffs.

Regression proof: `node --test scripts/worker-context.test.mjs`.
