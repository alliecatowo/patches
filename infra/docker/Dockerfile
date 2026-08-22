# syntax=docker/dockerfile:1.7
#
# Multi-stage image for `@patches/server` and `@patches/worker` (Phase 7, P7-001).
# One image, two Fly.io process groups — see `infra/fly/fly.toml`'s `[processes]` table,
# which picks the entrypoint per group; this Dockerfile's own `CMD` is only the default
# used when the image is run directly (e.g. `podman run`), not what Fly actually invokes.
#
# Build context MUST be the repo root (pnpm workspace needs the whole monorepo), so this
# file lives under `infra/docker/` but is always built with `-f infra/docker/Dockerfile`
# from the repo root — see `docs/operations/deployment.md` for the exact command. The
# root `.dockerignore` (not one next to this file) is what Docker/Podman actually reads,
# since ignore files are resolved against the build context, not the Dockerfile's path.
#
# docs/research/fly-io.md documents the Fly-specific parts (process groups, h2c ingress,
# release_command, why there's no native gRPC health check).

ARG NODE_IMAGE=node:24.19.0-slim
ARG PATCHES_BUILD_SHA
# Pinned to the same version as `mise.toml`'s `buf` tool — keep these in sync by hand;
# there's no single source of truth shared between a `mise.toml` pin and a Dockerfile ARG.
ARG BUF_VERSION=1.72.0

# ---------------------------------------------------------------------------
# base: toolchain only, no source yet, so this layer caches across everything below.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:${PATH}"
# Corepack ships with Node 24 and reads `packageManager` from whichever package.json is
# in cwd at invocation time — no need to hard-code a pnpm version here, it stays in sync
# with the root package.json (`pnpm@11.22.0`) automatically.
RUN corepack enable

# `buf` (packages/proto's `gen` script) has no npm package, only a standalone binary —
# turbo's `build` task depends on `gen` for every package with a `gen` script (see
# turbo.json), so `@patches/proto:gen` runs during `pnpm turbo run build` even though its
# output (`src/generated/**`) is already committed: turbo has no cache metadata inside a
# fresh build context (`.turbo/` is dockerignored, same as it's gitignored) and re-derives
# it from source. Installed only in this build-time stage, matching mise.toml's pin —
# never present in the `runtime` stage below.
ARG BUF_VERSION
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && arch="$(dpkg --print-architecture)" \
    && case "$arch" in \
         amd64) buf_arch=x86_64 ;; \
         arm64) buf_arch=aarch64 ;; \
         *) echo "unsupported arch: $arch" >&2; exit 1 ;; \
       esac \
    && curl -sSL -o /usr/local/bin/buf \
         "https://github.com/bufbuild/buf/releases/download/v${BUF_VERSION}/buf-Linux-${buf_arch}" \
    && chmod +x /usr/local/bin/buf \
    && buf --version

WORKDIR /repo

# ---------------------------------------------------------------------------
# fetch: only the lockfile + workspace manifest, so this layer only invalidates when
# dependencies actually change (pnpm fetch warms the content-addressable store; it
# doesn't need any package.json beyond the workspace root to resolve `catalog:` entries).
# ---------------------------------------------------------------------------
FROM base AS fetch
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Two separate pnpm caches, both BuildKit cache mounts keyed by `id` (shared across stages
# and builds, but NOT committed into either stage's own image layer — see the `build`
# stage below, which chains `FROM fetch` rather than `COPY --from=fetch`, precisely
# because a cache-mounted path doesn't exist outside the RUN that mounted it):
#   - store-dir: the content-addressable package store (`pnpm fetch`'s actual output).
#   - pnpm's own cache dir (`~/.cache/pnpm`): registry resolution metadata, needed for
#     `--offline` installs to resolve the dependency graph without hitting the network.
#     Omitting this cache mount and relying on layer inheritance alone still failed
#     (`ERR_PNPM_NO_OFFLINE_META`) when this stage's RUN wasn't chained into `build` via
#     `FROM fetch` — keeping it as an explicit named cache mount makes that independent of
#     which stage `build` happens to extend from.
RUN --mount=type=cache,id=patches-pnpm-store,target=/pnpm-store \
    --mount=type=cache,id=patches-pnpm-meta,target=/root/.cache/pnpm \
    pnpm config set store-dir /pnpm-store && \
    pnpm fetch --frozen-lockfile

# ---------------------------------------------------------------------------
# build: full source, offline install from the fetched store, build server+worker
# (turbo's task graph pulls in every workspace dependency they need — proto, database,
# config, media — via `dependsOn: ["^build"]` in turbo.json), then `pnpm deploy` each
# app into a self-contained directory (own node_modules with workspace deps copied in,
# not symlinked, and devDependencies excluded via --prod).
# ---------------------------------------------------------------------------
FROM fetch AS build
COPY . .
RUN --mount=type=cache,id=patches-pnpm-store,target=/pnpm-store \
    --mount=type=cache,id=patches-pnpm-meta,target=/root/.cache/pnpm \
    pnpm config set store-dir /pnpm-store && \
    pnpm install --frozen-lockfile --offline

RUN pnpm turbo run build --filter=@patches/server --filter=@patches/worker

# `--legacy`: pnpm 10+ defaults to injected (hard-linked) workspace deps for `pnpm deploy`,
# which isn't what we want here — legacy mode copies each workspace dependency's published
# files into the deployed package's own `node_modules`, producing a directory that's
# actually self-contained and portable into the runtime stage below. Verified locally
# (`pnpm --filter @patches/server deploy --prod --legacy /tmp/deploy-server`) — without
# `--legacy` this fails outright with ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE.
RUN pnpm --filter @patches/server deploy --prod --legacy /deploy/server && \
    pnpm --filter @patches/worker deploy --prod --legacy /deploy/worker

# ---------------------------------------------------------------------------
# runtime: slim, non-root, no build toolchain, no devDependencies.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ARG PATCHES_BUILD_SHA
ENV NODE_ENV=production \
    PATCHES_BUILD_SHA=${PATCHES_BUILD_SHA}
WORKDIR /app

# node:*-slim images already create a `node` user (uid/gid 1000) in every variant —
# reused here rather than creating a new one, per docs/research/fly-io.md §8 (non-root
# `USER` is supported on Fly Machines; not independently confirmed against a real deploy
# yet, flagged there for verification).
COPY --from=build --chown=node:node /deploy/server ./server
COPY --from=build --chown=node:node /deploy/worker ./worker

# Runs database migrations as the Fly `release_command` (see infra/fly/fly.toml). Placed
# inside `server/` (not packages/database) so it resolves `@patches/database` from the
# deployed app's own `node_modules` without needing `packages/database`'s devDependency
# on `tsx`/the TypeORM CLI at runtime — see the file's own header comment for why.
COPY --chown=node:node infra/docker/migrate.mjs ./server/migrate.mjs

USER node

# gRPC (h2c behind Fly's TLS-terminating edge — see infra/fly/fly.toml and
# docs/research/fly-io.md §2). Not published by Podman/Docker directly; Fly's
# `[[services]]` block declares the actual public port mapping.
EXPOSE 50051

# Default command; Fly overrides per process group via `[processes]` in
# infra/fly/fly.toml (`server` / `worker`), which is the actual mechanism that runs the
# worker — this CMD only matters for `podman run`/`docker run` without an explicit
# command, e.g. `podman run --rm patches:local node server/dist/main.js --help`.
CMD ["node", "server/dist/main.js"]
