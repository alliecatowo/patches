# Issue #420 plan

- Reproduce the cached scoped-check behavior and record environment limits.
- Add a direct uncached changed-file ESLint command that includes untracked files.
- Include that command in `mise run check <workspace>` and the CI quality gate.
- Document cache-suspect conditions and validate the changed-file command.
