# OpenCode project configuration and custom agents

**Verified stack:** OpenCode CLI 1.18.23 on Linux; upstream OpenCode 1.18.23
tagged source and current official documentation.  
**Verification date:** 2026-08-28

## Documented facts

### Configuration discovery and validation

- OpenCode supports JSON and JSONC. The current documentation names
  `opencode.json` in the project root as the ordinary project config and says
  OpenCode searches upward to the nearest Git directory. Project custom agents
  live under `.opencode/agents/` (plural; singular is retained for backward
  compatibility). Config sources are merged rather than replaced.
  [Official config documentation](https://opencode.ai/docs/config/)
- OpenCode 1.18.23 source also explicitly loads `opencode.json` and
  `opencode.jsonc` from discovered `.opencode` directories, so this checkout's
  `.opencode/opencode.json` location is supported by the installed version.
  [OpenCode 1.18.23 config loader](https://github.com/anomalyco/opencode/blob/v1.18.23/packages/opencode/src/config/config.ts)
- The published schema is the exact authority for JSON keys. Its current
  top-level keys include singular `permission`, `model`, `small_model`,
  `provider`, `agent`, `tools`, and others; it does **not** include `worktree`,
  `env`, plural `permissions`, or `hooks`.
  [Published OpenCode JSON Schema](https://opencode.ai/config.json)
- OpenCode validates agent Markdown frontmatter during startup. A malformed
  agent prevents commands that need project configuration from starting.
  OpenCode's own customization guide warns that invalid config hard-fails and
  says config-time changes require quitting and restarting OpenCode.
  [Official OpenCode customization guide](https://github.com/anomalyco/opencode/blob/dev/packages/core/src/plugin/skill/customize-opencode.md)

The `.opencode/opencode.json` currently in this checkout is therefore not an
OpenCode-shaped configuration despite its `$schema`: `worktree`, `env`,
`permissions`, and Claude-style `hooks` must be removed or translated. OpenCode
hooks are implemented with a plugin; the Claude `PreToolUse`, `SessionStart`,
and `WorktreeCreate` object is not an OpenCode config key.

### Markdown agent frontmatter

- A project agent is `.opencode/agents/<name>.md`; the file name becomes the
  agent name and the body becomes its prompt. `description` is required by the
  user-facing agent documentation. `mode` is `primary`, `subagent`, or `all`
  (default `all`).
  [Official agents documentation](https://opencode.ai/docs/agents/)
- In 1.18.23, recognized agent fields are `name`, `model`, `variant`,
  `description`, `mode`, `hidden`, `color`, `steps`, `options`, `permission`,
  `disable`, `temperature`, `top_p`, and deprecated compatibility fields
  `tools` and `maxSteps`. Unknown fields are routed into provider `options`;
  that does not give them agent-runner semantics.
  [OpenCode 1.18.23 agent schema](https://github.com/anomalyco/opencode/blob/v1.18.23/packages/core/src/v1/config/agent.ts)
- `tools` is deprecated and, when used, must be a mapping from tool-name strings
  to booleans. A scalar such as `tools: Bash, Read, Grep, Glob` is invalid.
  Prefer `permission`, whose actions are `allow`, `ask`, or `deny` and whose
  command-specific `bash` rules are glob maps. Broad rules go first because the
  last matching rule wins.
  [Official agents permissions documentation](https://opencode.ai/docs/agents/#permissions)
- Permission/tool names are OpenCode names such as `read`, `edit`, `glob`,
  `grep`, `bash`, `task`, `webfetch`, `websearch`, `lsp`, and `skill`. `edit`
  gates the write/edit/patch tools, while `task` gates subagent invocation.
  Claude names such as `Bash`, `Read`, `Agent`, `disallowedTools`, and a comma
  list are not the OpenCode permission shape.
  [Official agents permissions documentation](https://opencode.ai/docs/agents/#permissions)
- `color` must be a six-digit hex color or one of `primary`, `secondary`,
  `accent`, `success`, `warning`, `error`, or `info`. Names such as `yellow`,
  `purple`, `cyan`, `magenta`, `green`, `blue`, `red`, and `orange` are invalid.
  [Official agents color documentation](https://opencode.ai/docs/agents/#color)
- The iteration limit is `steps`; legacy `maxSteps` is deprecated. Fields in
  this checkout such as `maxTurns`, `maxThinkingTokens`, `effort`, `memory`,
  `isolation`, and `disallowedTools` are not native 1.18.23 agent controls.
  They should not be retained as if they provided those guarantees unless a
  chosen provider documents a matching provider option.
  [Official agents options documentation](https://opencode.ai/docs/agents/#options)

A valid restrictive verifier agent can use this shape (the model is omitted so
the subagent inherits the invoking primary agent's model):

```markdown
---
description: Runs repository checks and reports pass or fail without editing.
mode: subagent
steps: 40
color: warning
permission:
  '*': deny
  read: allow
  glob: allow
  grep: allow
  bash:
    '*': deny
    'git diff*': allow
    'git log*': allow
    'git status*': allow
    'mise run check *': allow
    'mise run verify*': allow
    'pnpm format:check*': allow
    'pnpm lint*': allow
    'pnpm typecheck*': allow
    'pnpm test*': allow
    'pnpm proto:lint*': allow
    'pnpm proto:breaking*': allow
    'pnpm db:show*': allow
---

Run the requested checks and report the smallest useful failure output.
```

### Models and providers

- Model IDs use `provider/model-id`, both globally and in agents. Examples in
  the official docs include `anthropic/claude-sonnet-4-20250514` and
  `opencode/gpt-5.1-codex`; bare values such as `haiku`, `sonnet`, and `opus`
  are not valid model selections. If an agent omits `model`, a primary agent
  uses the global model and a subagent inherits the invoking primary agent's
  model.
  [Official agents model documentation](https://opencode.ai/docs/agents/#model)
- Providers are authenticated through `/connect` (or `opencode providers
login` in the installed CLI), and provider/model visibility can be limited by
  `enabled_providers`, `disabled_providers`, and provider `whitelist` or
  `blacklist` config.
  [Official providers documentation](https://opencode.ai/docs/providers/)
- OpenCode chooses a model in this order: CLI `--model`, configured `model`,
  last-used model, then an internally prioritized available model.
  [Official models documentation](https://opencode.ai/docs/models/#loading-models)

Consequently, the portable repair for these checked-in agents is to omit their
Claude shorthand `model` fields. If role-specific models are desired, first
connect/configure the provider and then use exact IDs returned by `opencode
models`; checked-in config must not assume credentials that a contributor may
not have.

### Git repository detection

- OpenCode's troubleshooting documentation distinguishes Git projects from the
  global non-Git project in its local storage model.
  [Official troubleshooting documentation](https://opencode.ai/docs/troubleshooting/)
- The 1.18.23 project implementation records `vcs: "git"` when its project
  resolver detects Git and exposes that value to the UI.
  [OpenCode 1.18.23 project source](https://github.com/anomalyco/opencode/blob/v1.18.23/packages/opencode/src/project/project.ts)

## Local verification

These are observed facts for `/home/allie/develop/patches`, not upstream API
claims:

- `opencode --version` reports `1.18.23`.
- `git rev-parse --show-toplevel --git-common-dir --is-inside-work-tree`
  reports this checkout's root, `.git`, and `true`.
- With broken project config bypassed,
  `OPENCODE_DISABLE_PROJECT_CONFIG=1 opencode debug scrap` reports the Patches
  worktree with `vcs: "git"`. The repository is therefore detected correctly.
- From outside this project, `opencode models` succeeds and lists models from
  the authenticated Z.AI Coding Plan provider plus OpenCode-hosted free models.
  Inside this project it exits on the invalid `verifier.md` before listing
  anything.
- `opencode debug config` inside this project reports the scalar `tools` and
  invalid `yellow` color errors shown by the user. It stops at the first invalid
  agent, so all agent files must be translated, not only `verifier.md`.

## Inferred conclusions

- **Inferred:** the missing model picker/list in Patches is a consequence of
  fatal project-config loading, not an empty model catalog. Repairing all agent
  frontmatter and the Claude-shaped `.opencode/opencode.json` should restore it.
- **Inferred:** the UI's “no git” state is likewise stale or incomplete startup
  state caused by the same fatal config error. OpenCode's own project database
  currently classifies this checkout as Git, so deleting or reinitializing
  `.git` is not indicated.
- **Inferred:** preserving the intent of the existing Claude hooks requires a
  separately reviewed OpenCode plugin. Removing the unsupported `hooks` key is
  enough to restore startup, but it does not preserve those hook behaviors.

## Differences from Claude-style assumptions

- OpenCode agent frontmatter is not a drop-in copy of `.claude/agents`
  frontmatter.
- Tool names and permissions are lowercase OpenCode permission keys; the
  `tools: A, B, C` and `disallowedTools` convention does not transfer.
- `maxTurns` maps conceptually to OpenCode `steps`, while reasoning effort and
  thinking-token controls are model/provider-specific rather than native agent
  fields.
- OpenCode has no agent-level `isolation: worktree` field in the 1.18.23 schema.
  Do not claim private-worktree isolation in prompts unless another verified
  mechanism actually provides it.

## Suggested follow-up

No ADR is needed to repair configuration syntax. A harness task should:

1. translate every `.opencode/agents/*.md` file to `mode`, `steps`, valid
   `color`, and `permission`;
2. omit bare model shorthands or replace them only with connected,
   provider-qualified IDs;
3. replace `.opencode/opencode.json` with schema-valid OpenCode keys; and
4. decide separately whether the three Claude hook scripts should be ported to
   a real OpenCode plugin or removed as unimplemented configuration.

Validate after edits with `opencode debug config`, `opencode agent list`,
`opencode models`, and `OPENCODE_DISABLE_PROJECT_CONFIG=1 opencode debug scrap`.
Do not publish `opencode debug config` output without redacting interpolated
authorization headers or other credentials.
