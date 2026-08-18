# Monorepo Toolchain Reference (verified 2026-08-17)

Facts below verified against official docs, not memory. Fedora Linux, podman
5.8, **no** docker / docker-compose.

## 1. pnpm 11

Docs: pnpm.io/workspaces, /catalogs, /settings/build, /blog/releases/11.0, /continuous-integration

**`pnpm-workspace.yaml`:**
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**Catalogs** (shared versions, defined once, referenced everywhere):
```yaml
catalog:
  react: ^18.2.0
catalogs:
  react17:
    react: ^17.0.2
```
```json
{ "dependencies": { "react": "catalog:", "react-dom": "catalog:react17" } }
```

**Native build scripts (breaking change):** pnpm ≥10 blocks postinstall
scripts by default. In **pnpm 11** the old `onlyBuiltDependencies` /
`neverBuiltDependencies` / `ignoredBuiltDependencies` / `ignoreDepScripts`
settings were **removed**, replaced by a single `allowBuilds` map — and it
lives in `pnpm-workspace.yaml`, not `package.json`:
```yaml
allowBuilds:
  sharp: true
  "@napi-rs/keyring": true
  argon2: true
  esbuild: true
```
`strictDepBuilds` (default `true`) fails install on any unreviewed build
script. `dangerouslyAllowAllBuilds` (default `false`) is the unsafe bypass.

**`.npmrc` scope narrowed:** in v11, `.npmrc` is auth/registry-only. Everything
else (`nodeLinker`, `hoistPattern`, `shamefullyHoist`, `allowBuilds`) moved to
`pnpm-workspace.yaml` / `~/.config/pnpm/config.yaml`. `nodeLinker: isolated` is
the default and correct choice — `shamefully-hoist` is a legacy escape hatch,
not needed with isolated linker + correct `peerDependencies`.

**Commands:**
```bash
pnpm add -w typescript
pnpm add zod --filter @patches/server
pnpm --filter @patches/server run test
pnpm -r run build
pnpm dlx <pkg>
```
`workspace:*` / `workspace:^` / `workspace:~` link local packages.

**Other v11 changes:** Node 22+ required (18–21 dropped); pure ESM
distribution; CI auto-detects and runs frozen-lockfile mode when `CI` is set
(`pnpm ci` also available as explicit clean-install); store v11 = single
SQLite db, not many JSON files; audit moved from CVE- to **GHSA**-based
(`ignoreCves` → `ignoreGhsas`); `publish`/`login`/`view` no longer shell to npm.

**Corepack on Node 24 (verified):** Node TSC voted to stop distributing
Corepack. It remains bundled (as an opt-in shim) through Node **24**, and is
**gone starting Node 25**. Don't depend on it long-term — use mise or
`pnpm/setup` (§6) to install pnpm instead.
```json
{ "packageManager": "pnpm@11.22.0" }
```

## 2. Turborepo 2.10

Docs: turborepo.dev/docs/reference/configuration, /crafting-your-repository/using-environment-variables, /reference/run

**Confirmed: `pipeline` → `tasks` rename is complete**; only `tasks` exists now.
```jsonc
// turbo.json
{
  "$schema": "https://turborepo.dev/schema.json",
  "globalDependencies": ["tsconfig.json"],
  "globalEnv": ["NODE_ENV"],
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"], "env": ["API_URL"] },
    "lint": { "outputs": [] },
    "typecheck": { "dependsOn": ["^typecheck"], "outputs": [] },
    "test": { "dependsOn": ["^build"], "outputs": ["coverage/**"] },
    "dev": { "cache": false, "persistent": true }
  }
}
```
`dependsOn: ["^build"]` = run in workspace deps first. `cache:false,
persistent:true` is the standard `dev`/watch-task pattern.

**Env handling — strict mode is the 2.x default.** `globalEnv` invalidates
every task's cache hash; per-task `env` invalidates only that task. Undeclared
env vars are filtered out of the task's runtime entirely, not just excluded
from hashing. `--env-mode=loose` disables filtering (migration only).

**Running:** `turbo run build` and `turbo build` are equivalent; docs recommend
`turbo run` (or `pnpm turbo run` / `pnpm exec turbo`) in CI, bare `turbo`
locally. `--filter=ui`, `--filter=./apps/*`, `--filter=[HEAD^1]`,
`--filter=!./apps/admin` (combinable). `--affected` filters to packages changed
vs `main`→`HEAD` (override via `TURBO_SCM_BASE`/`TURBO_SCM_HEAD`); combine with
`--filter`. Remote cache is optional; `--cache=local:rw` skips it.

## 3. mise

Docs: mise.jdx.dev/configuration.html, /cli/use.html, /continuous-integration.html

```toml
# mise.toml
[tools]
node = "24.10.0"
pnpm = "11.22.0"
buf = "aqua:bufbuild/buf@1.47.2"
actionlint = "aqua:rhysd/actionlint@1.7.7"

[tasks.dev]
run = "pnpm turbo run dev"

[env]
NODE_ENV = "development"
```
`aqua:<owner>/<repo>@<version>` is the backend for tools without a dedicated
mise plugin (buf, actionlint) — pin an exact version, not `@latest`.

**Pinning:**
```bash
mise use --pin node@24        # resolves to exact concrete version, writes it
mise use --pin pnpm@11.22.0
mise use -g --pin node@24     # global config instead of project
```

**Trust:** `mise trust` approves a project's config once; or pre-approve a
directory tree globally via `~/.config/mise/config.toml`:
```toml
[settings]
trusted_config_paths = ["~/develop"]
```

**CI:**
```yaml
- uses: jdx/mise-action@v4   # v4: runtime moved to Node 24 ahead of GH's Node20 EOL
  with:
    version: 2026.8.1
    install: true
    cache: true
```

## 4. Podman compose (no Docker on this machine)

Docs: docs.podman.io/en/latest/markdown/podman-compose.1.html, github.com/containers/podman-compose

`podman compose` is a thin dispatcher to an external *provider*. Default
providers: `docker-compose` (takes precedence if present on `PATH`) and
`podman-compose`. Override via `containers.conf` `[engine] compose_providers =
[...]` or `PODMAN_COMPOSE_PROVIDER` env var. `podman-compose` itself is pure
Python, talks to Podman directly — no Docker socket needed.

**Recommended (simplest, Fedora):**
```bash
sudo dnf install -y podman-docker podman-compose
```
- `podman-docker` installs a `docker` shim forwarding Docker-CLI calls to
  `podman`, so a literal `docker compose up -d` in the README resolves to
  `podman compose`.
- `podman compose` then finds `podman-compose` as its provider and talks to the
  local Podman socket directly — no `DOCKER_HOST`, no daemon.
- README stays `docker compose up -d` unchanged for real-Docker contributors;
  add one Fedora/Podman setup line.
- Non-Fedora/no-root alternative: `pipx install podman-compose`, document
  `podman compose up -d` (not `docker compose`) directly. Avoid mise's
  `aqua:docker/compose` (standalone `docker-compose` v2 binary) here — it
  needs a Docker-API-compatible socket (`systemctl --user enable --now
  podman.socket` + `DOCKER_HOST=...`), more moving parts for no benefit over
  `podman-compose`.

## 5. ESLint 10 flat config (TS monorepo)

Docs: eslint.org/docs/latest/use/migrate-to-10.0.0, typescript-eslint.io/getting-started/typed-linting, /users/dependency-versions

**Breaking changes vs ESLint 9 (confirmed):** `.eslintrc*` fully removed, no
`ESLINT_USE_FLAT_CONFIG` escape hatch — `eslint.config.js` only. New
upward-search config lookup is default (no longer a flag). Removed CLI flags:
`--env`, `--ignore-path`, `--no-eslintrc` (→ `--no-config-lookup`),
`--resolve-plugins-relative-to`, `--rulesdir`. `eslint-env` comments are now
lint errors. `root: true` has no meaning. `files` must be an array. `stylish`
formatter uses Node's `styleText`, not `chalk`. Min Node: 20.19+ / 22.13+ / 24+.

```js
// eslint.config.js
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

export default defineConfig([
  globalIgnores(["**/dist/**", "**/.turbo/**", "**/coverage/**"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended, // Ink/React 19 app packages
    ],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.node },
    },
  },
  eslintConfigPrettier, // last: disables stylistic rules Prettier owns
]);
```
`defineConfig()` from `"eslint/config"` is now the recommended composition
helper (both ESLint and typescript-eslint docs lead with it); the older
`tseslint.config()` wrapper still works but is no longer the headline example.
`projectService: true` replaces `project: ["./tsconfig.json"]` — uses TS's
project service (same mechanism as the IDE).

**typescript-eslint 8.67 peer ranges (confirmed):** TypeScript `>=4.8.4
<6.1.0` — **this is exactly why the toolchain pins TS 5.9, not 7.x**: 8.x's
peer range tops out below 6.1. ESLint `^8.57.0 || ^9.0.0 || ^10.0.0`. Node
`^18.18.0 || ^20.9.0 || >=21.1.0`.

**`eslint-plugin-react-hooks` v6** (Oct 2025) ships flat config by default:
`reactHooks.configs.flat.recommended` (stable) or
`.flat["recommended-latest"]` (opt-in React Compiler rules) — compatible with
React 19.

## 6. Vitest 4

Docs: vitest.dev/guide/projects, /guide/coverage.html, /config/

**Confirmed: `projects` replaces `workspace`.** `workspace` was deprecated in
3.2; v4's API is `projects`, set directly in the root config (no separate
`vitest.workspace.ts` file needed):
```ts
// vitest.config.ts (root)
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { projects: ["packages/*", "apps/*"] } });
```
```ts
// packages/server/vitest.config.ts
import { defineProject } from "vitest/config";
import swc from "unplugin-swc";
export default defineProject({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: { name: "server", environment: "node", globals: false, testTimeout: 20_000 },
});
```
Run: `pnpm vitest run --project server` (repeat `--project` for multiple).

**Defaults (confirmed):** `testTimeout` 5000ms, `hookTimeout` 10000ms (`0`
disables). `globals` defaults `false` (explicit imports required).
`environment` defaults `"node"`.

**Coverage:** `coverage: { provider: "v8" }` — recommended, no pre-transpile
step, faster than Istanbul, comparable accuracy.

**NestJS decorators:** esbuild (Vite/Vitest's default transformer) does **not**
emit `emitDecoratorMetadata`, which NestJS DI requires. Fix: `unplugin-swc` +
`@swc/core` as above, plus `tsconfig.json` `"experimentalDecorators": true,
"emitDecoratorMetadata": true` — SWC reads those flags where esbuild ignores
them.

**Ink components:** `ink-testing-library` (`render()` → `{ lastFrame(),
frames, stdin }`). Caution: last published release predates Ink/React 19 by
roughly two years per npm — verify it still renders against the pinned Ink/
React 19 versions before relying on it broadly.

## 7. GitHub Actions

Docs: github.com/actions/setup-node, github.com/pnpm/setup, github.com/jdx/mise-action, github.com/bufbuild/buf-action, docs.github.com (dependabot, postgres services, permissions)

**Node + pnpm — two paths.** Classic: `actions/setup-node@v7` (current major)
with pnpm already on `PATH`:
```yaml
- uses: actions/setup-node@v7
  with: { node-version: 24, cache: pnpm, cache-dependency-path: pnpm-lock.yaml }
```
New, simpler for pnpm 11+: **`pnpm/setup@v2`** is the successor to
`pnpm/action-setup` — installs pnpm's self-contained binary (no Node needed to
bootstrap) *and* a JS runtime in one step, replacing `actions/setup-node`
entirely:
```yaml
- uses: actions/checkout@v4
- uses: pnpm/setup@v2
  with: { runtime: node@24, cache: true, install: true }
```
`pnpm/action-setup` is still correct only for pnpm ≤10; use `pnpm/setup@v2`
for this repo's pnpm 11 pin.

**mise:**
```yaml
- uses: jdx/mise-action@v4
  with: { version: 2026.8.1, install: true, cache: true }
```

**Postgres 17 service:**
```yaml
services:
  postgres:
    image: postgres:17
    env: { POSTGRES_PASSWORD: postgres }
    options: >-
      --health-cmd pg_isready --health-interval 10s
      --health-timeout 5s --health-retries 5
    ports: ["5432:5432"]
```

**Buf:** legacy `buf-setup-action`/`buf-lint-action`/`buf-breaking-action`/
`buf-push-action` are superseded by unified **`bufbuild/buf-action@v1`**:
```yaml
- uses: actions/checkout@v4
  with: { fetch-depth: 0 }   # needed for --against main diff
- uses: bufbuild/buf-action@v1
  with: { token: "${{ secrets.BUF_TOKEN }}", args: "lint format breaking --against main" }
```

**Dependabot:** pnpm supported under `package-ecosystem: "npm"`
(auto-detects `pnpm-lock.yaml`), including GA `catalog:` support since Feb
2025. **Caveat found in research:** open upstream issues as of mid-2026 —
Dependabot can drop catalog entries when regenerating `pnpm-lock.yaml`, and
pnpm 11's new multi-document lockfile format has been reported as unparseable
(`dependency_file_not_parseable`) by dependabot-core in some repos. Treat
Dependabot pnpm-lockfile PRs as needing manual review, not auto-merge, until
this is confirmed fixed upstream.
```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule: { interval: "weekly" }
    groups:
      dev-dependencies: { dependency-type: "development", patterns: ["*"] }
      production-dependencies: { dependency-type: "production", patterns: ["*"] }
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule: { interval: "weekly" }
    groups:
      actions: { patterns: ["*"] }
```

**Permissions:** default to least privilege at the workflow top, elevate per-job:
```yaml
permissions:
  contents: read
```

## 8. Prettier 3.9, EditorConfig, git hooks

Docs: prettier.io/docs/configuration

```js
// prettier.config.js
/** @type {import("prettier").Config} */
export default { semi: true, singleQuote: true, trailingComma: "all", printWidth: 100 };
```
```ini
# .editorconfig
root = true
[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
```
**Git hooks — recommend lefthook**, installed via mise (`[tools] lefthook =
"1.x"`) or as a devDependency with a `prepare` script (`npx lefthook install`)
so hooks self-install on `pnpm install`:
```yaml
# lefthook.yml
pre-commit:
  parallel: true
  commands:
    lint-staged: { run: "pnpm exec lint-staged" }
```
Lefthook's `root`/`glob`/`files` scoping suits monorepos; `simple-git-hooks` is
lighter if only one or two hooks are needed, but lefthook's parallelism and
path filtering earn the extra dependency here.

## Summary of what changed vs older tutorials

- pnpm 11: `onlyBuiltDependencies` etc. removed → `allowBuilds` in
  `pnpm-workspace.yaml` (not `package.json`).
- pnpm 11: `.npmrc` is now auth/registry-only; general settings moved to
  `pnpm-workspace.yaml` / `~/.config/pnpm/config.yaml`.
- Turborepo: `pipeline` key fully gone, `tasks` only.
- Vitest: `workspace` key fully gone, `projects` only (deprecated since 3.2).
- ESLint 10: no eslintrc fallback of any kind.
- Corepack: bundled through Node 24, dropped starting Node 25.
