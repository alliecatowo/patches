---
name: gh-stack
description: Reconcile GitHub stacked pull requests with the gh stack extension.
---

# GitHub Stacks

Inspect a stack before changing it:

```bash
gh stack view --json
```

Synchronize and rebase when needed:

```bash
gh stack sync
gh stack rebase
```

Only merge when every PR is green, conflict-free, and there is no human hold:

```bash
gh stack merge --yes
```

Do not invent a stack for an unrelated single PR. If the stack is ambiguous, record the blocker
and leave it for human direction.
