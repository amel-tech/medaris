# syntax=docker/dockerfile:1.7
#
# @medaris/tedrisat — NestJS API (Nx project name: `tedrisat`).
# Build from the REPO ROOT:  docker build -f apps/tedrisat/Dockerfile -t medaris-tedrisat .
#
# Six stages: base (toolchain) -> manifests (normalised package.json files)
#           -> deps (install, cached until a dependency changes)
#           -> build (source + `nx build tedrisat`)
#           -> prod-deps (runtime-only install, from the same manifests)
#           -> runner.
# The `manifests` and `deps` stages are byte-identical in all six app
# Dockerfiles so BuildKit reuses one install layer across every image.

# ---------------------------------------------------------------------------
# base — Node + corepack-pinned pnpm. Nothing app-specific.
# ---------------------------------------------------------------------------
# Base image is pinned to node:22-alpine by ADR-001 §Toolchain (docs/adr/001-monorepo-merge-and-layout.md:257):
# "hold node:22-alpine ... lift to node:24-alpine in MDRS-21 under ops sign-off".
# engines is >=22 and @types/node is pinned to ^22 against the prod floor, so a 24 runtime
# would type-check against APIs the container does not have. Do not bump this here.
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    HUSKY=0 \
    NX_DAEMON=false \
    CI=true
# corepack activates exactly the pnpm named in root package.json#packageManager
# (pnpm@11.4.0) — no floating `npm i -g pnpm`.
RUN corepack enable
WORKDIR /app

# ---------------------------------------------------------------------------
# manifests — the workspace's package.json files without their `version`,
# written by tools/docker/workspace-manifests.mjs (which says why). It finds
# them through pnpm-workspace.yaml, so nothing here is listed per package and
# a new workspace package needs no Dockerfile edit. This stage re-runs on every
# change to the context, in well under a second; what matters is its output.
# ---------------------------------------------------------------------------
FROM base AS manifests
RUN --mount=type=bind,target=/context \
    node /context/tools/docker/workspace-manifests.mjs /context /out

# ---------------------------------------------------------------------------
# deps — the install, from the normalised manifests and the lockfile alone.
# BuildKit keys `COPY --from` on file content, so a source edit or a
# release-please version bump leaves these layers, and the install, cached;
# only a dependency change (a manifest's dependencies, the lockfile, the
# workspace settings) reinstalls.
#
# The store and pnpm's metadata cache are cache mounts. They save the
# download on a machine that has built before; a fresh CI runner starts with
# them empty (`cache-to: type=gha` carries layers, never cache mounts) and
# downloads, so nothing depends on them. Kept out of the layer, the metadata
# cache (/root/.cache/pnpm, written by the install's lockfile verification)
# no longer adds about 400 MB to every install layer the GHA cache stores
# (measured 2026-10-12). node_modules is a real copy of the files and lives
# in this layer.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY --from=manifests /out/ ./
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    --mount=type=cache,id=pnpm-metadata,target=/root/.cache/pnpm \
    pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# build — source on top of the installed node_modules, then Nx. `COPY . .`
# brings the real manifests back; .dockerignore keeps node_modules out of the
# context, so the installed tree stays.
# `nx.json` targetDefaults.build sets dependsOn ["^build"], so this single
# command builds @medaris/common first. The old `cd libs/common && npm run
# build` line was redundant and is gone.
# ---------------------------------------------------------------------------
FROM deps AS build
# nx.json's `sharedGlobals` includes a runtime input that pipes into `shasum`,
# which busybox does not provide; without it Nx aborts while hashing.
RUN apk add --no-cache perl-utils
COPY . .
# `pnpm exec` warns here that node_modules is "out of sync with your
# lockfile. The workspace structure has changed since last install": deps
# installed from the manifests without `version`, and pnpm-workspace.yaml
# sets verifyDepsBeforeRun to warn. Expected; nothing is reinstalled.
RUN pnpm exec nx build tedrisat

# ---------------------------------------------------------------------------
# prod-deps — a second, runtime-only install, from the same normalised
# manifests, so it is cached exactly as long as `deps` is. Re-resolving is far
# cheaper than trying to prune pnpm's symlink farm, and it keeps
# @nestjs/cli, jest, drizzle-kit and friends out of the image.
#
# The two files deleted after the install are pnpm's bookkeeping, which
# nothing reads at runtime and which carry timestamps. Without them the output
# is byte-identical whenever the dependencies are, so the runner's
# `COPY --from=prod-deps` stays a cache hit even when this stage re-runs.
# ---------------------------------------------------------------------------
FROM base AS prod-deps
COPY --from=manifests /out/ ./
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    --mount=type=cache,id=pnpm-metadata,target=/root/.cache/pnpm \
    pnpm install --frozen-lockfile --prod --ignore-scripts \
      --filter "@medaris/tedrisat..." \
 && rm -f node_modules/.modules.yaml node_modules/.pnpm-workspace-state*.json

# ---------------------------------------------------------------------------
# runner
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S nodejs -g 1001 && adduser -S nestjs -u 1001 -G nodejs

# Runtime dependency tree (pnpm's store + the per-package symlinks that point
# into it). Copied as a whole so the relative symlinks stay intact.
COPY --from=prod-deps --chown=nestjs:nodejs /app/node_modules                ./node_modules
COPY --from=prod-deps --chown=nestjs:nodejs /app/apps/tedrisat/node_modules  ./apps/tedrisat/node_modules
COPY --from=prod-deps --chown=nestjs:nodejs /app/libs/common/node_modules    ./libs/common/node_modules

# @medaris/common resolves through apps/tedrisat/node_modules/@medaris/common
# -> ../../../libs/common, whose package.json points at dist/index.js.
COPY --from=build --chown=nestjs:nodejs /app/libs/common/package.json ./libs/common/package.json
COPY --from=build --chown=nestjs:nodejs /app/libs/common/dist        ./libs/common/dist

COPY --from=build --chown=nestjs:nodejs /app/apps/tedrisat/package.json ./apps/tedrisat/package.json
COPY --from=build --chown=nestjs:nodejs /app/apps/tedrisat/dist        ./apps/tedrisat/dist

# MDRS-66: the root-.env bootstrap moved from tools/env/root-env.cjs to the
# @medaris/env workspace package, and src/load-env.ts requires it BY NAME as the
# first import of the process. Two consequences for this stage:
#
#  1. libs/env must be here or `require("@medaris/env")` throws MODULE_NOT_FOUND
#     at boot. The symlink already exists (prod-deps installed the workspace
#     dependency into apps/tedrisat/node_modules); only its target was missing.
#  2. pnpm-workspace.yaml must be here too. findRepoRoot walks up for that
#     marker and, since MDRS-66, THROWS on reaching the filesystem root without
#     finding it — the loud behaviour the four next.config.js copies always had
#     and this side did not. With the marker present the image is a well-formed
#     workspace with no .env beside it, which is the documented normal
#     production state (empty result, no throw); without it every boot dies.
#     The file is a list of package paths and carries nothing secret.
COPY --from=build --chown=nestjs:nodejs /app/pnpm-workspace.yaml      ./pnpm-workspace.yaml
COPY --from=build --chown=nestjs:nodejs /app/libs/env/package.json    ./libs/env/package.json
COPY --from=build --chown=nestjs:nodejs /app/libs/env/src             ./libs/env/src

# MDRS-228: the live stream link parser is shared with the web apps and lives
# in @medaris/utils, a source-only package. tedrisat requires its one runnable
# file by path (`@medaris/utils/src/youtube-live.js`, an ES module that Node 22
# loads through require()), so the symlink prod-deps made needs its target.
COPY --from=build --chown=nestjs:nodejs /app/libs/utils/package.json  ./libs/utils/package.json
COPY --from=build --chown=nestjs:nodejs /app/libs/utils/src           ./libs/utils/src

USER nestjs
WORKDIR /app/apps/tedrisat
EXPOSE 3001

# NOT `npm start` (= `nest start`, which recompiles at boot and needs
# @nestjs/cli in the production image). Straight to the emitted entrypoint.
# The path is dist/src/main, not dist/main — verified by listing the built
# tree, which contains dist/src/main.js, dist/drizzle.config.js and no
# dist/main.js. nest-cli.json agrees: its migration assets target `dist/src`.
# teskilat lands in the same place. Note package.json#start:prod still says
# `node dist/main` and is wrong; that script is out of scope for MDRS-16.
CMD ["node", "dist/src/main"]
