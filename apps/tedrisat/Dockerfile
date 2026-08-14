# syntax=docker/dockerfile:1.7
#
# @medaris/tedrisat — NestJS API (Nx project name: `tedrisat`).
# Build from the REPO ROOT:  docker build -f apps/tedrisat/Dockerfile -t medaris-tedrisat .
#
# Five stages: base (toolchain) -> deps (manifest-only install, cached)
#           -> build (source + `nx build tedrisat`) -> prod-deps -> runner.
# The `deps` stage is byte-identical in all six app Dockerfiles so BuildKit
# reuses one install layer across every image.

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
# deps — the workspace manifest surface only, so the install layer survives
# every source edit. pnpm-workspace.yaml enumerates its 16 members explicitly
# (no globs), and --frozen-lockfile needs every one of their package.json
# files present, so all 16 are copied here even though this image builds one.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/tedrisat/package.json       apps/tedrisat/
COPY apps/teskilat/package.json       apps/teskilat/
COPY apps/tedris/package.json         apps/tedris/
COPY apps/nizam/package.json          apps/nizam/
COPY apps/nazir/package.json          apps/nazir/
COPY apps/landing/package.json        apps/landing/
COPY apps/keycloak-theme/package.json apps/keycloak-theme/
COPY libs/common/package.json         libs/common/
COPY libs/ui/package.json             libs/ui/
COPY libs/icons/package.json          libs/icons/
COPY libs/tokens/package.json         libs/tokens/
COPY libs/hooks/package.json          libs/hooks/
COPY libs/services/package.json       libs/services/
COPY libs/i18n/package.json           libs/i18n/
COPY libs/types/package.json          libs/types/
COPY libs/utils/package.json          libs/utils/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# build — source on top of the cached node_modules, then Nx.
# `nx.json` targetDefaults.build sets dependsOn ["^build"], so this single
# command builds @medaris/common first. The old `cd libs/common && npm run
# build` line was redundant and is gone.
# ---------------------------------------------------------------------------
FROM deps AS build
# nx.json's `sharedGlobals` includes a runtime input that pipes into `shasum`,
# which busybox does not provide; without it Nx aborts while hashing.
RUN apk add --no-cache perl-utils
COPY . .
RUN pnpm exec nx build tedrisat

# ---------------------------------------------------------------------------
# prod-deps — a second, runtime-only install. Re-resolving from the same
# manifest surface is far cheaper than trying to prune pnpm's symlink farm,
# and it keeps @nestjs/cli, jest, drizzle-kit and friends out of the image.
# ---------------------------------------------------------------------------
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/tedrisat/package.json       apps/tedrisat/
COPY apps/teskilat/package.json       apps/teskilat/
COPY apps/tedris/package.json         apps/tedris/
COPY apps/nizam/package.json          apps/nizam/
COPY apps/nazir/package.json          apps/nazir/
COPY apps/landing/package.json        apps/landing/
COPY apps/keycloak-theme/package.json apps/keycloak-theme/
COPY libs/common/package.json         libs/common/
COPY libs/ui/package.json             libs/ui/
COPY libs/icons/package.json          libs/icons/
COPY libs/tokens/package.json         libs/tokens/
COPY libs/hooks/package.json          libs/hooks/
COPY libs/services/package.json       libs/services/
COPY libs/i18n/package.json           libs/i18n/
COPY libs/types/package.json          libs/types/
COPY libs/utils/package.json          libs/utils/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts \
      --filter "@medaris/tedrisat..."

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
