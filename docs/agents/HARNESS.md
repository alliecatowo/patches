# Agent harness contract

This repository supports Codex, Claude, and other clients through the same contract:

- The root/main agent orchestrates and gates acceptance. It delegates safely separable
  product/harness implementation instead of competing with workers for the same files.
- A worker owns only the paths in its brief. Parallel briefs have disjoint write sets and state
  that the checkout may be shared; no agent reverts unrelated edits.
- State moves as short packets: done, left, owned paths, verification, and next concrete step.
  Do not keep an implementation worker alive only to preserve context.
- Review is independent and stronger than implementation; verification is a separate evidence
  step when the blast radius warrants it. Neither review nor verification silently changes code.
- Work originates in an explicit user request, `tasks.md`, or the authoritative spec. Agents may
  report a discovered follow-up, but do not create work by guessing.
- The hard rules in `AGENTS.md`/`CLAUDE.md` and `INITIAL_VISION.md` apply to every client and
  delegation level. A harness improvement cannot weaken them; a genuine conflict needs the ADR
  process and human sign-off.

Model selection and client-specific examples live in [MODEL_ROUTING.md](MODEL_ROUTING.md).

## Headless browser MCP

The project-scoped Playwright MCP entry in `.codex/config.toml` starts an isolated,
headless Playwright browser through the pinned `@playwright/mcp` package. It is independent
of the laptop display and remains usable with the screen off. It is also separate from the
Codex in-app Browser and does not attach to a user's Chrome profile or existing signed-in tabs.

After changing the MCP entry, restart or reload Codex, then reopen the project/session if the
new `playwright` tools are not discovered. Confirm the handshake by asking Codex to navigate the
isolated browser to a harmless URL and return an accessibility snapshot. The first start may
download Playwright's browser into its cache.

The server uses `--isolated`, so cookies and local storage are discarded when the browser closes;
do not add a storage-state file, browser extension, CDP endpoint, or unrestricted file access to
this project default. Its bounded diagnostic output is ignored at `.codex/playwright-output/`.

To upgrade deliberately, check the [official Playwright MCP release metadata](https://github.com/microsoft/playwright-mcp/blob/main/server.json), replace the exact version in `.codex/config.toml`, restart Codex, verify the handshake, and run the relevant harness/browser checks. Do not substitute an unpinned `latest` version.
