# syntax=docker/dockerfile:1.7
#
# @medaris/nazir-web — Next.js (Nx project name: `nazir-web`, NOT `nazir`).
# Build from the REPO ROOT:  docker build -f apps/nazir/Dockerfile -t medaris-nazir .
#
# Four stages: base (toolchain) -> deps (manifest-only install, cached)
#           -> build (source + `nx build nazir-web`) -> runner.
# The `deps` stage is byte-identical in all six app Dockerfiles so BuildKit
# reuses one install layer across every image.
#
# Runtime ships Next's `output: "standalone"` tree, not node_modules: under pnpm
# node_modules is a symlink farm into node_modules/.pnpm, so copying any subtree
# of it into a fresh stage yields dangling links. Standalone's file tracing
# emits a real, pruned dependency tree instead — and the whole runtime image
# lands around 250 MB instead of well over a gigabyte.

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
# build — source on top of the cached node_modules, then Nx. `nx.json`
# targetDefaults.build sets dependsOn ["^build"], so the workspace libraries
# this app consumes are built first.
# ---------------------------------------------------------------------------
FROM deps AS build
# nx.json's `sharedGlobals` includes a runtime input that pipes into `shasum`,
# which busybox does not provide; without it Nx aborts while hashing.
RUN apk add --no-cache perl-utils
COPY . .
# apps/nazir/env.ts validates the environment at build time via
# @t3-oss/env-nextjs, so `next build` needs values present. Since MDRS-25 there
# is one .env, at the root; next.config.js applies it and strips the app prefix.
# .env.example holds placeholders only. KNOWN LIMITATION, unchanged by MDRS-25:
# every NEXT_PUBLIC_* value is inlined into the client bundle at build time, so
# the placeholder is what ships. Fixing that means passing real values as build
# args from the deploy workflow — MDRS-16 left it open and it is still open.
# The placeholder .env is never copied into the runtime stage.
RUN cp .env.example .env
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm exec nx build nazir-web

# ---------------------------------------------------------------------------
# runner
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=4002 \
    HOSTNAME=0.0.0.0
WORKDIR /app
RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001 -G nodejs

# The standalone tree is rooted at the workspace root (Next infers the output
# file-tracing root from pnpm-lock.yaml at /app), so it unpacks as
# ./apps/nazir/server.js + ./node_modules.
COPY --from=build --chown=nextjs:nodejs /app/apps/nazir/.next/standalone ./
# Static assets and public/ are deliberately excluded from the standalone tree
# and have to be laid back on top.
COPY --from=build --chown=nextjs:nodejs /app/apps/nazir/.next/static ./apps/nazir/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/nazir/public ./apps/nazir/public
# Belt and braces: the build-time .env lives at the workspace root and Next
# only traces the project directory, so nothing should have carried it in. A
# placeholder that silently satisfies runtime env validation is worse than a
# loud failure, so make sure of it.
RUN rm -f ./.env ./apps/nazir/.env

USER nextjs
EXPOSE 4002

# NOT `npm start` (= `next start`), which needs the full dev dependency tree.
# server.js is the standalone entrypoint and honours PORT/HOSTNAME.
CMD ["node", "apps/nazir/server.js"]
