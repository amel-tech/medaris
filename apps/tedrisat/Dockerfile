# syntax=docker/dockerfile:1.7
#
# @medaris/tedrisat — NestJS API (Nx project name: `tedrisat`).
# Build from the REPO ROOT:  docker build -f apps/tedrisat/Dockerfile -t medaris-tedrisat .
#
# Six stages: base (toolchain) -> deps (`pnpm fetch`, keyed on the lockfile)
#           -> build (source, offline install, `nx build tedrisat`)
#           -> manifests (every package.json) -> prod-deps (offline
#              runtime-only install) -> runner.
# The `deps` stage is byte-identical in all six app Dockerfiles so BuildKit
# reuses one fetch layer across every image.

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
# deps — pnpm's documented `fetch` pattern: every package the lockfile names,
# downloaded into the store, keyed on the lockfile alone. `pnpm fetch` reads
# no workspace package.json, so none is copied: a release-please version bump
# in one app no longer invalidates this layer in all six images, and a new
# workspace package needs no Dockerfile edit. The root package.json is here
# only because corepack reads pnpm's version from its `packageManager`; it
# changes with the lockfile, never on a release.
#
# The store lives IN this layer, deliberately not in a `--mount=type=cache`:
# `cache-to: type=gha` carries layers between runners but never cache mounts,
# so a fresh runner would reuse a cached fetch layer over an empty store and
# the offline installs below would fail.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

# ---------------------------------------------------------------------------
# build — source, node_modules linked from the fetched store, then Nx.
# `nx.json` targetDefaults.build sets dependsOn ["^build"], so this single
# command builds @medaris/common first. The old `cd libs/common && npm run
# build` line was redundant and is gone.
# ---------------------------------------------------------------------------
FROM deps AS build
# nx.json's `sharedGlobals` includes a runtime input that pipes into `shasum`,
# which busybox does not provide; without it Nx aborts while hashing.
RUN apk add --no-cache perl-utils
COPY . .
# --offline: everything comes from the store the deps layer fetched. A package
# missing there fails the build here instead of reaching for the registry.
RUN pnpm install --offline --frozen-lockfile
RUN pnpm exec nx build tedrisat

# ---------------------------------------------------------------------------
# manifests — every package.json of the context, found rather than listed, so
# a new workspace package needs no edit here. prod-deps copies this stage's
# output, and BuildKit keys that COPY on content: a change that touches no
# manifest leaves the runtime install below cached, as it was before
# `pnpm fetch`.
# ---------------------------------------------------------------------------
FROM base AS manifests
RUN --mount=type=bind,target=/context \
    cd /context \
 && find . -name package.json -not -path '*/node_modules/*' \
  | tar -cf - -T - | tar -xf - -C /app

# ---------------------------------------------------------------------------
# prod-deps — a second, runtime-only install, from the manifests alone, as
# before. Re-resolving is far cheaper than trying to prune pnpm's symlink
# farm, and it keeps @nestjs/cli, jest, drizzle-kit and friends out of the image.
#
# It installs offline from the store the deps layer fetched, mounted, and is
# deliberately not built FROM deps: `pnpm fetch` also lays every package of
# the lockfile out in node_modules/.pnpm, and a filtered --prod install on top
# of that adds its links without pruning the rest. Built FROM deps, the
# runner's node_modules was 1.2 GB with Next, Vite and Storybook in it
# (measured 2026-10-12). The mount is read-write only so pnpm can write its
# temporary files; nothing written there is kept.
#
# The two files deleted after the install are pnpm's bookkeeping, which
# nothing reads at runtime and which carry timestamps. Without them the output
# is byte-identical whenever the dependencies are, so the runner's
# `COPY --from=prod-deps` stays a cache hit even after a version bump.
# ---------------------------------------------------------------------------
FROM base AS prod-deps
COPY --from=manifests /app ./
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=bind,from=deps,source=/pnpm/store,target=/pnpm/store,rw \
    pnpm install --offline --frozen-lockfile --prod --ignore-scripts \
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
