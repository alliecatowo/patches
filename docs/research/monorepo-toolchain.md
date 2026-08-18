# Monorepo Toolchain Reference (verified Aug 2026)

Scope: pnpm 11, Turborepo 2.10, mise, ESLint 10 flat config, typescript-eslint 8.67,
Vitest 4, GitHub Actions, Dependabot, Prettier 3.9. Machine: Fedora Linux, podman 5.8,
no docker/docker-compose. All facts below verified against official docs on 2026-08-17;
URLs cited per section.

## 1. pnpm 11

Docs: https://pnpm.io/workspaces · https://pnpm.io/catalogs · https://pnpm.io/settings/build ·
https://pnpm.io/blog/releases/11.0 · https://pnpm.io/continuous-integration

### 1.1 `pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "!**/test/**"
```

### 1.2 Catalogs (shared version constants)

Default (unnamed) catalog plus optional named catalogs, all defined in
`pnpm-workspace.yaml`:

```yaml
catalog:
  react: ^18.2.0
  react-dom: ^18.2.0

catalogs:
  react17:
    react: ^17.0.2
    react-dom: ^17.0.2
```

Reference from any package's `package.json`:

```json
{
  "dependencies": {
    "react": "catalog:",
    "react-dom": "catalog:react17"
  }
}
```

### 1.3 Native module build scripts — `allowBuilds` (pnpm ≥10 blocks postinstall by default)

**Breaking change vs older habits:** in pnpm 11 the old settings
`onlyBuiltDependencies`, `onlyBuiltDependenciesFile`, `neverBuiltDependencies`,
`ignoredBuiltDependencies`, and `ignoreDepScripts` were **removed** and replaced
by a single `allowBuilds` map. `onlyBuiltDependencies:` no longer exists — do not
carry that habit forward from pnpm 9/10 docs found in older blog posts.

`pnpm-workspace.yaml` (this — not `package.json` — is the correct location in v11):

```yaml
allowBuilds:
  sharp: true
  "@napi-rs/keyring": true
  argon2: true
  esbuild: true
  core-js: false   # explicitly denied
```

- `strictDepBuilds` (default `true`): install fails non-zero if any dependency has
  an unreviewed build script — forces explicit allow/deny decisions rather than
  silently skipping scripts.
- `dangerouslyAllowAllBuilds` (default `false`): escape hatch that runs every
  dependency's install scripts unreviewed; avoid in CI.
- Git-hosted deps use the repo URL as the key, e.g.
  `'foo@git+https://github.com/org/foo.git': true`.

### 1.4 Config file reorganization (breaks old `.npmrc` habits)

In pnpm 11, **`.npmrc` is auth/registry-only**. General pnpm settings —
`nodeLinker`, `hoistPattern`, `shamefullyHoist`, `allowBuilds`, etc. — must live in
`pnpm-workspace.yaml` (project) or `~/.config/pnpm/config.yaml` (global). The
`npm_config_*` env var prefix also became `pnpm_config_*`.

Recommended `pnpm-workspace.yaml` additions:

```yaml
nodeLinker: isolated   # default; do NOT set shamefully-hoist — not needed with isolated linker
```

`shamefully-hoist`/`shamefullyHoist` is a legacy escape hatch for packages that
assume a flat `node_modules` (Yarn-classic-style); pnpm's default `isolated`
linker with proper `peerDependencies` avoids needing it — leave unset unless a
specific broken package requires it.

### 1.5 Command cheatsheet

```bash
pnpm add -w typescript                 # add to workspace root
pnpm add zod --filter @patches/server  # add to one package
pnpm --filter @patches/server run test # run a script in one package
pnpm -r run build                      # run in every package
pnpm dlx <pkg>                         # one-off binary, no local install
```

`workspace:` protocol: `"@patches/core": "workspace:*"` (any local version),
`workspace:^`, `workspace:~`, or a pinned `workspace:1.2.3`. A bare `workspace:`
range with no specifier is treated as `workspace:*`.

### 1.6 Other pnpm 11 changes that break old habits

- **Node.js 22+ required**; support for Node 18–21 dropped. Node 24 (this repo's
  target) is fine.
- pnpm is now **pure ESM** distribution.
- CI still auto-detects and switches to frozen-lockfile mode
  (`pnpm install` behaves like `--frozen-lockfile` when `CI` env var is set) —
  `pnpm ci` is also now available as an explicit clean-install command.
- Store format v11 uses a single SQLite database instead of many JSON index
  files (faster, fewer syscalls) — no action needed, but don't hand-edit the
  store.
- Security audit switched from CVE-based to **GHSA-based** filtering:
  `ignoreCves` → `ignoreGhsas`.
- `pnpm publish`/`login`/`view` no longer delegate to the npm CLI (native impl).

### 1.7 `packageManager` field / Corepack status on Node 24 (Aug 2026)

Verified: the Node.js TSC voted to stop distributing Corepack; **Corepack ships
bundled (as an experimental/opt-in shim) with Node.js up to, but not including,
25.0.0** — i.e. it is still present on **Node 24 LTS**, but is gone by default
starting Node 25. Don't assume Corepack will be available on future Node lines;
prefer installing pnpm directly (mise, or the new `pnpm/setup` binary install,
see §6) rather than depending on Corepack long-term.

```json
{ "packageManager": "pnpm@11.22.0" }
```

Sources: https://pnpm.io/workspaces, https://pnpm.io/catalogs,
https://pnpm.io/settings/build, https://pnpm.io/settings,
https://pnpm.io/blog/releases/11.0, https://pnpm.io/continuous-integration,
https://pnpm.io/npmrc, https://socket.dev/blog/node-js-tsc-votes-to-stop-distributing-corepack

## 2. Turborepo 2.10

Docs: https://turborepo.dev/docs/reference/configuration ·
https://turborepo.dev/docs/crafting-your-repository/using-environment-variables ·
https://turborepo.dev/docs/reference/run

**Confirmed: `pipeline` → `tasks` rename is complete.** Current docs use only
`tasks`; there is no remaining mention of a `pipeline` key.

```jsonc
// turbo.json
{
  "$schema": "https://turborepo.dev/schema.json",
  "globalDependencies": ["tsconfig.json", ".env"],
  "globalEnv": ["NODE_ENV"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"],
      "env": ["API_URL"]
    },
    "lint": { "outputs": [] },
    "typecheck": {
      "dependsOn": ["^typecheck"],
      "outputs": []
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

- `dependsOn: ["^build"]` — caret means "run this task in all of this package's
  workspace dependencies first."
- `cache: false` + `persistent: true` is the standard pattern for `dev`/watch
  tasks — prevents other tasks from depending on a task that never exits.

### 2.1 Env var handling — strict mode is the 2.x default

`globalEnv` invalidates the cache hash for *every* task; per-task `env` only
invalidates that task's hash. **Strict env mode is on by default in Turborepo
2.x**: only variables declared in `globalEnv`/`env` are passed into a task's
runtime — undeclared env vars are filtered out (not just "excluded from
hashing" but literally not visible to the process). Use `--env-mode=loose` to
disable filtering during migration; not recommended long-term.

```json
{
  "globalEnv": ["NODE_ENV"],
  "tasks": {
    "build": { "env": ["API_URL", "API_KEY"], "inputs": ["$TURBO_DEFAULT$", ".env"] }
  }
}
```

### 2.2 Running

- `turbo run build lint check-types` and bare `turbo build lint check-types` are
  equivalent; docs recommend `turbo run` in CI for explicitness and bare `turbo`
  locally. Whether invoked as `turbo` (global) or `pnpm turbo` (via
  `devDependencies` + pnpm scripts) is purely about how the binary is resolved —
  behavior is identical; prefer `pnpm turbo` / `pnpm exec turbo` in CI so the
  workspace-pinned version is used rather than a global install.
- `--filter`: `--filter=ui`, `--filter=./apps/*`, `--filter=[HEAD^1]` (git-diff
  based), `--filter=!./apps/admin` (negation), combinable.
- `--affected`: filters to packages affected by changes on the current branch,
  diffing `main` → `HEAD` by default; override with `TURBO_SCM_BASE` /
  `TURBO_SCM_HEAD` env vars. Combine: `turbo run build --affected --filter=web`.
- Remote cache is fully optional; `--cache` controls local/remote read-write,
  default `local:rw,remote:rw`; `--cache=local:rw` skips remote entirely.

## 3. mise

Docs: https://mise.jdx.dev/configuration.html · https://mise.jdx.dev/cli/use.html ·
https://mise.jdx.dev/continuous-integration.html

### 3.1 `mise.toml`

```toml
[tools]
node = "24.10.0"
pnpm = "11.22.0"
buf = "aqua:bufbuild/buf@1.47.2"
actionlint = "aqua:rhysd/actionlint@1.7.7"
# optional, project-dependent:
flyctl = "aqua:superfly/flyctl@0.3.0"

[tasks.dev]
run = "pnpm turbo run dev"

[tasks.test]
run = "pnpm turbo run test"

[env]
NODE_ENV = "development"
```

- `aqua:<owner>/<repo>@<version>` is the aqua-registry backend syntax used for
  tools (like `buf`, `actionlint`) that don't have a dedicated mise "core"
  plugin; pin an exact version after `@` for reproducibility rather than
  `@latest`.
- `[tasks.<name>]` with `run = "..."` defines a task runnable as `mise run
  <name>` (or `mise run` to list). `[env]` sets process env vars whenever the
  directory's config is active.

### 3.2 Pinning exact versions

```bash
mise use --pin node@24        # resolves and writes the exact concrete version
mise use --pin pnpm@11.22.0
mise use -g --pin node@24     # writes to the global config instead of project
```

`--pin` (or `MISE_PIN=1` env var) writes the fully resolved version string into
the config instead of a fuzzy range — needed for reproducible CI installs.

### 3.3 Trust

mise refuses to execute tasks/config from an untrusted directory. Run
`mise trust` once per project (interactively, after reviewing `mise.toml`), or
pre-approve paths globally:

```toml
# ~/.config/mise/config.toml
[settings]
trusted_config_paths = ["~/develop"]
```

### 3.4 CI usage

```yaml
- uses: jdx/mise-action@v4
  with:
    version: 2026.8.1
    install: true
    cache: true
```

(`jdx/mise-action@v4` is current — v4 moved the action runtime to Node 24 ahead
of GitHub's June 2026 deprecation of Node 20 runners; v3 examples with older
`version:` pins still appear in some docs but v4 is the version to use now.)

## 4. Podman compose (no Docker on this machine)

Docs: https://docs.podman.io/en/latest/markdown/podman-compose.1.html ·
https://github.com/containers/podman-compose

- `podman compose` (the built-in podman subcommand, distinct from the separate
  `podman-compose` package) is a **thin dispatcher**: it shells out to an
  external compose *provider*. The two default providers are `docker-compose`
  and `podman-compose`; **if a `docker-compose` binary is found on `PATH`, it
  takes precedence** over `podman-compose`, purely because it's the reference
  Compose-spec implementation.
- Provider selection can be forced via `containers.conf`'s `[engine]` table
  (`compose_providers = ["/path/to/provider"]`) or the `PODMAN_COMPOSE_PROVIDER`
  env var. Warning noise about running an external command can be silenced with
  `compose_warning_logs = false` (or `PODMAN_COMPOSE_WARNING_LOGS=false`).
- `podman-compose` itself is a pure-Python implementation of the Compose spec
  (deps: `podman`, Python ≥3.9, PyYAML, python-dotenv) that talks to Podman
  directly — no Docker socket/API needed.

**Recommended simplest approach for this repo (Fedora, no Docker):**

```bash
sudo dnf install -y podman-docker podman-compose
```

- `podman-docker` installs a `docker` shell shim that forwards Docker-CLI
  invocations to `podman`, plus symlinked man pages — so a literal
  `docker compose up -d` typed by a contributor resolves to `podman compose`.
- `podman compose` then finds `podman-compose` (installed by the second
  package) as its provider and runs against the local Podman socket directly —
  no `docker-compose` binary, no `DOCKER_HOST`, no Docker daemon required.
- README instruction: keep the literal `docker compose up -d` in docs (works
  for real-Docker contributors unchanged) and add a one-line Fedora/Podman note:
  `sudo dnf install -y podman-docker podman-compose` once, then the same command
  works.
- Alternative (non-Fedora / no root): `pipx install podman-compose` and
  document `podman compose up -d` (not `docker compose`) directly — skip
  `podman-docker` if you don't want the `docker` shim. **Do not** rely on mise's
  `aqua:docker/compose` (the standalone `docker-compose` v2 binary) unless you
  also stand up Podman's Docker-API-compatible socket
  (`systemctl --user enable --now podman.socket` + `DOCKER_HOST=unix://…`) —
  that's more moving parts for no benefit over `podman-compose` here.

## 5. ESLint 10 flat config (TS monorepo)

Docs: https://eslint.org/docs/latest/use/migrate-to-10.0.0 ·
https://typescript-eslint.io/getting-started/typed-linting ·
https://typescript-eslint.io/users/dependency-versions

### 5.1 Breaking changes vs ESLint 9 (confirmed)

- **`.eslintrc*` is fully removed** — no `ESLINT_USE_FLAT_CONFIG` escape hatch
  anymore; `eslint.config.js` (flat config) is the only supported format.
- New file-based config lookup (search upward from each linted file) is now
  default, no longer a feature flag.
- Removed CLI flags: `--env`, `--ignore-path`, `--no-eslintrc` (use
  `--no-config-lookup`), `--resolve-plugins-relative-to`, `--rulesdir`.
- `eslint-env` config comments are now **lint errors**, not recognized config.
- `root: true` no longer has meaning (flat config has no cascading root
  concept).
- `files` must be an array (a bare string is rejected).
- `stylish` formatter now uses Node's built-in `styleText` instead of `chalk`.
- Minimum Node.js for ESLint 10 itself: `20.19+`, `22.13+`, or `24+`.
- Codemods exist for the 9→10 migration (`eslint-config-inspector`/official
  codemod tooling) — see migration guide for exact command.

### 5.2 Recommended `eslint.config.js`

`defineConfig()` from `"eslint/config"` is the current recommended composition
helper (both ESLint's own docs and typescript-eslint's quickstart show it) —
the older `tseslint.config()` wrapper still works but new docs favor wrapping
everything, including `tseslint.configs.*`, inside `defineConfig`'s `extends`
array:

```js
// eslint.config.js
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

export default defineConfig([
  globalIgnores(["**/dist/**", "**/.turbo/**", "**/coverage/**", "**/build/**"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended, // Ink/React 19 app packages only
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node },
    },
  },
  eslintConfigPrettier, // must be last: turns off stylistic rules Prettier owns
]);
```

- `projectService: true` replaces the older `project: ["./tsconfig.json"]`
  pattern — it lets typescript-eslint use TS's own project service (same
  mechanism as the IDE) instead of building a one-off Program, and is the
  current recommended default for type-aware linting.
- `tsconfigRootDir: import.meta.dirname` is the ESM-native replacement for
  `__dirname`.

### 5.3 typescript-eslint 8.67 peer ranges (confirmed)

- TypeScript: **`>=4.8.4 <6.1.0`** — this is exactly why the toolchain pins
  **TypeScript 5.9, not 7.x**: typescript-eslint 8.x's peer range tops out
  below 6.1, so a TS 7 upgrade would break typed linting until typescript-eslint
  ships a new major.
- ESLint: `^8.57.0 || ^9.0.0 || ^10.0.0` — ESLint 10 is supported.
- Node: `^18.18.0 || ^20.9.0 || >=21.1.0`.

### 5.4 `eslint-plugin-react-hooks` for the Ink app (React 19)

Version 6 (released ~Oct 2025) ships flat config by default:

```js
import reactHooks from "eslint-plugin-react-hooks";
// reactHooks.configs.flat.recommended  (stable rules)
// reactHooks.configs.flat["recommended-latest"]  (opt-in React Compiler rules)
```

## 6. Vitest 4 (monorepo, NestJS decorators, Ink)

Docs: https://vitest.dev/guide/projects · https://vitest.dev/guide/coverage.html ·
https://vitest.dev/config/

### 6.1 `projects` replaces `workspace` (confirmed)

**Vitest 4 API confirmed: the key is `projects`.** `workspace` (used through
v2/early v3) was deprecated starting **3.2** and is now `projects` — the old
`vitest.workspace.ts` standalone file is also superseded by putting `projects`
directly in the root `vitest.config.ts`.

```ts
// vitest.config.ts (root)
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*", "apps/*"],
  },
});
```

Per-package config uses `defineProject()`:

```ts
// packages/server/vitest.config.ts
import { defineProject } from "vitest/config";
import swc from "unplugin-swc";

export default defineProject({
  plugins: [swc.vite()],
  test: {
    name: "server",
    environment: "node",
    globals: false,
    testTimeout: 20_000, // integration tests: raise from the 5s default
  },
});
```

Run a single project: `pnpm vitest run --project server` (repeatable for
multiple: `--project server --project cli`).

### 6.2 Defaults (confirmed)

- `testTimeout` default: **5000ms**; `hookTimeout` default: **10000ms**. `0`
  disables. Override per-project as above, or globally via root config /
  `--testTimeout` CLI flag.
- `globals: false` is the default (no auto-injected `describe`/`it`/`expect`) —
  explicit imports from `vitest` required unless you opt into `globals: true`.
- `environment` default is `"node"`.

### 6.3 Coverage — v8 provider

```ts
test: {
  coverage: { provider: "v8" }, // recommended: no pre-transpile, fast, accurate
}
```

### 6.4 NestJS decorators — esbuild does not emit decorator metadata

Vite/Vitest use esbuild for transforms by default, and **esbuild does not
support `emitDecoratorMetadata`**, which NestJS's DI relies on. The current
recommended fix (unchanged pattern, still current per Vitest/NestJS community
docs) is `unplugin-swc` + `@swc/core`:

```ts
import swc from "unplugin-swc";

export default defineProject({
  plugins: [swc.vite({ module: { type: "es6" } })],
});
```

`tsconfig.json` must still set `"experimentalDecorators": true` and
`"emitDecoratorMetadata": true` — SWC reads those flags and emits the metadata
esbuild silently drops.

### 6.5 Ink components — `ink-testing-library`

`ink-testing-library` (github.com/vadimdemedes/ink-testing-library) provides
`render()` returning `{ lastFrame(), frames, stdin }` for asserting on Ink
output in Vitest. **Caution:** its last published release predates Ink/React 19
by a couple of years (npm listed it as ~2 years stale as of this research) —
verify it still renders against your pinned React 19 / Ink version before
relying on it; pin the exact resolved version and smoke-test one component
before writing a full suite.

## 7. GitHub Actions

Docs: https://docs.github.com (setup-node, dependabot config, postgres service
containers, permissions) · https://github.com/actions/setup-node ·
https://github.com/pnpm/setup · https://github.com/jdx/mise-action ·
https://github.com/bufbuild/buf-action

### 7.1 Node + pnpm setup — two viable paths

**Path A (classic, still fully supported):** `actions/setup-node@v7` (current
major) handles Node + pnpm-aware caching once pnpm itself is on `PATH` (e.g.
via `packageManager` + Corepack, or `pnpm/action-setup`):

```yaml
- uses: actions/setup-node@v7
  with:
    node-version: 24
    cache: pnpm
    cache-dependency-path: pnpm-lock.yaml
```

**Path B (new, pnpm 11+ only, simpler):** `pnpm/setup@v2` is the successor to
`pnpm/action-setup`. It installs pnpm's self-contained binary (no Node
required to bootstrap) **and** provisions a JS runtime (Node/Bun/Deno) in the
same step, replacing `actions/setup-node` entirely:

```yaml
- uses: actions/checkout@v4
- uses: pnpm/setup@v2
  with:
    runtime: node@24
    cache: true
    install: true   # runs `pnpm install` for you (default: true)
```

`pnpm/action-setup` remains correct only for pnpm ≤10; for this repo's pnpm 11
pin, prefer `pnpm/setup@v2`.

### 7.2 mise-action

```yaml
- uses: jdx/mise-action@v4
  with:
    version: 2026.8.1
    install: true
    cache: true
```

### 7.3 Postgres 17 service container

```yaml
services:
  postgres:
    image: postgres:17
    env:
      POSTGRES_PASSWORD: postgres
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
    ports:
      - 5432:5432
```

### 7.4 Buf

The four legacy actions (`buf-setup-action`, `buf-lint-action`,
`buf-breaking-action`, `buf-push-action`) are superseded by the unified
**`bufbuild/buf-action@v1`**, which runs build/lint/format/breaking, posts a PR
summary comment, and can push to the BSR:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0   # required so `--against main` has history to diff
- uses: bufbuild/buf-action@v1
  with:
    token: ${{ secrets.BUF_TOKEN }}   # only if pushing to BSR
    args: "lint format breaking --against main"
```

### 7.5 Dependabot

pnpm is supported under `package-ecosystem: "npm"` (Dependabot auto-detects
`pnpm-lock.yaml`), including GA support for `catalog:`/`pnpm-workspace.yaml`
catalogs since Feb 2025. **Caveat found during this research:** as of mid-2026
there are open upstream bugs where Dependabot can drop catalog entries from a
regenerated `pnpm-lock.yaml`, and separately, pnpm 11's new multi-document
`pnpm-lock.yaml` format has been reported as unparseable by
`dependabot-core` (`dependency_file_not_parseable`) in some repos — treat
Dependabot pnpm-11-lockfile PRs as **needing manual verification**, not blind
auto-merge, until upstream confirms multi-document lockfile parsing.

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    groups:
      dev-dependencies:
        dependency-type: "development"
        patterns: ["*"]
      production-dependencies:
        dependency-type: "production"
        patterns: ["*"]
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    groups:
      actions:
        patterns: ["*"]
```

### 7.6 Least-privilege `permissions:`

```yaml
permissions:
  contents: read
```

Grant additional scopes (`pull-requests: write`, `issues: write`, etc.) only on
the specific job that needs them, never at the top of the file by default.

## 8. Prettier 3.9, EditorConfig, git hooks

Docs: https://prettier.io/docs/configuration

```js
// prettier.config.js
/** @type {import("prettier").Config} */
export default {
  semi: true,
  singleQuote: true,
  trailingComma: "all",
  printWidth: 100,
};
```

`.editorconfig` (kept in sync with the above, for editors that don't run
Prettier on save):

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
```

**Git hooks: recommend lefthook**, installed via mise (`[tools] lefthook =
"latest"` or a pinned version) or as a devDependency with a `prepare` script
(`npx lefthook install`) so hooks self-install on `pnpm install`:

```yaml
# lefthook.yml
pre-commit:
  parallel: true
  commands:
    lint-staged:
      run: pnpm exec lint-staged
```

Lefthook's `root`/`glob`/`files` options make it monorepo-friendly (scope a
command to files under a given package). `simple-git-hooks` is a lighter
alternative if only a couple of hooks are needed, but lefthook's parallel
execution and monorepo path filtering are worth the extra dependency here.

---

## Verification notes / things that changed since older blog posts

- pnpm 11 removed `onlyBuiltDependencies` etc. in favor of `allowBuilds` — any
  pre-2026 tutorial referencing `onlyBuiltDependencies` is stale for pnpm 11.
- pnpm 11 moved general settings out of `.npmrc` into `pnpm-workspace.yaml` /
  `~/.config/pnpm/config.yaml`.
- Turborepo's `pipeline` key is gone; `tasks` only.
- Vitest's `workspace` config key is gone; `projects` only (deprecated since
  3.2, removed as the primary API in 4).
- ESLint 10 has zero eslintrc fallback (no env-var escape hatch).
