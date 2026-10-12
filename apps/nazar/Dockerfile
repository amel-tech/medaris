# syntax=docker/dockerfile:1.7
#
# @medaris/nazar-web — Next.js (Nx project name: `nazar-web`, NOT `nazar`).
# Build from the REPO ROOT:  docker build -f apps/nazar/Dockerfile -t medaris-nazar .
#
# Four stages: base (toolchain) -> deps (`pnpm fetch`, keyed on the lockfile)
#           -> build (source, offline install, `nx build nazar-web`) -> runner.
# The `deps` stage is byte-identical in all six app Dockerfiles so BuildKit
# reuses one fetch layer across every image.
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
# the offline install below would fail.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

# ---------------------------------------------------------------------------
# build — source, node_modules linked from the fetched store, then Nx.
# `nx.json` targetDefaults.build sets dependsOn ["^build"], so the workspace
# libraries this app consumes are built first.
# ---------------------------------------------------------------------------
FROM deps AS build
# nx.json's `sharedGlobals` includes a runtime input that pipes into `shasum`,
# which busybox does not provide; without it Nx aborts while hashing.
RUN apk add --no-cache perl-utils
COPY . .
# --offline: everything comes from the store the deps layer fetched. A package
# missing there fails the build here instead of reaching for the registry.
RUN pnpm install --offline --frozen-lockfile
# apps/nazar/env.ts validates the environment at build time via
# @t3-oss/env-nextjs, so `next build` needs values present. Since MDRS-25 there
# is one .env, at the root; next.config.js applies it and strips the app prefix.
# .env.example holds placeholders only, and that is all this build needs:
# since MDRS-86 no NEXT_PUBLIC_ value exists in any web app, so nothing from
# this file is inlined into the browser bundle. Every real value is read on the
# server at request time from the container's environment, which makes this
# image environment-agnostic — the same bytes serve development and production.
# The placeholder .env is never copied into the runtime stage.
RUN cp .env.example .env
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm exec nx build nazar-web

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
# ./apps/nazar/server.js + ./node_modules.
COPY --from=build --chown=nextjs:nodejs /app/apps/nazar/.next/standalone ./
# Static assets and public/ are deliberately excluded from the standalone tree
# and have to be laid back on top.
COPY --from=build --chown=nextjs:nodejs /app/apps/nazar/.next/static ./apps/nazar/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/nazar/public ./apps/nazar/public
# Belt and braces: the build-time .env lives at the workspace root and Next
# only traces the project directory, so nothing should have carried it in. A
# placeholder that silently satisfies runtime env validation is worse than a
# loud failure, so make sure of it.
RUN rm -f ./.env ./apps/nazar/.env

USER nextjs
EXPOSE 4002

# NOT `npm start` (= `next start`), which needs the full dev dependency tree.
# server.js is the standalone entrypoint and honours PORT/HOSTNAME.
CMD ["node", "apps/nazar/server.js"]
