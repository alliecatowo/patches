# Package conventions

Every workspace lives under `apps/*` (deployable/runnable) or `packages/*` (shared libraries). Names are `@patches/<dir>`.

## Module format

| Kind                                       | Format                                                                                                        | Why                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `apps/server`, `apps/worker`, `apps/admin` | **CommonJS** (no `"type":"module"`), `module: NodeNext`                                                       | NestJS 11 has no native ESM support (see `docs/research/nestjs-grpc-protobuf.md` §4). |
| `apps/tui`                                 | **ESM**                                                                                                       | Ink 7 is ESM-only.                                                                    |
| `packages/*`                               | **ESM source, dual build** (`tsup --format esm,cjs --dts`) with an `exports` map (`types`/`import`/`require`) | Consumed by both the CJS server and the ESM TUI.                                      |

Shared package `package.json` shape:

```json
{
  "name": "@patches/example",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests",
    "clean": "rm -rf dist .turbo"
  }
}
```

`tsup.config.ts`: `entry: ['src/index.ts']`, `format: ['esm','cjs']`, `dts: true`, `sourcemap: true`, `clean: true`, `target: 'node24'`. Native or framework deps go in `external`.

`tsconfig.json` extends `../../tsconfig.base.json` with `rootDir: "src"`, `outDir: "dist"`, `include: ["src"]`; add `"jsx": "react-jsx"` for Ink packages, `"experimentalDecorators": true, "emitDecoratorMetadata": true` for Nest/TypeORM packages.

## Scripts every workspace must expose

`build`, `typecheck`, `test` (Vitest — a `vitest.config.ts` with `defineProject` and a unique `test.name`), `clean`. Apps also expose `dev`/`start`. Root `turbo.json` wires them; root `pnpm verify` is the gate.

## Dependencies

- Add with `pnpm add <pkg> --filter @patches/<name>` (`-D` for dev). Versions shared across packages live in the `catalog:` in `pnpm-workspace.yaml`; `catalogMode: prefer` makes `pnpm add` use them automatically.
- Workspace deps: `pnpm add '@patches/other@workspace:*' --filter @patches/<name>`.
- **When several agents run in parallel, wrap installs in a lock:** `flock /tmp/patches-pnpm.lock pnpm add ...` — concurrent lockfile writes corrupt `pnpm-lock.yaml`.
- Native modules must be listed under `allowBuilds` in `pnpm-workspace.yaml` (pnpm 11 blocks build scripts otherwise).

## Tests

Vitest 4 `projects` at the root pick up every `**/vitest.config.ts`. Unit tests sit next to code as `*.test.ts`. Integration tests that need Postgres read `TEST_DATABASE_URL` (see `.env.example`) and go in `test/` with the project name suffixed `-integration` so CI can run them separately. Never point tests at the dev DB.

## Layering (spec §128–129)

protobuf request → controller (transport adapter) → application service → repository/TypeORM. Domain code never imports Ink; database package never imports gRPC; TUI never imports TypeORM; proto package never imports server code. Don't create `utils.ts`/`helpers.ts` dumping grounds.
