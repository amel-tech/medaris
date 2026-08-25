// MDRS-66: the root-.env bootstrap lives in exactly one place, `@medaris/env`.
// Next only reads .env files from the project directory, so the root file is
// applied to process.env here — early enough for NEXT_PUBLIC_* inlining and for
// env.ts's build-time validation, both of which happen after this module is
// evaluated.
//
// `createRequire` rather than a static `import`: @medaris/env is CommonJS and
// needs no build step, which matters because Next evaluates this file before any
// TypeScript in the repo has been compiled. MDRS-25 computed a path to
// `tools/env/root-env.cjs` here and re-implemented the walk-up to do it; a real
// workspace package resolves by name, so both the path arithmetic and the
// duplicated marker logic are gone. A missing workspace root now throws from
// `findRepoRoot` — the same failure the two Nest apps get, stated once there.
import { createRequire } from "node:module";

const requireCjs = createRequire(import.meta.url);

requireCjs("@medaris/env").loadRootEnv("nazir");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // MDRS-16: the deploy image ships `.next/standalone`. pnpm's node_modules is
  // a symlink farm into node_modules/.pnpm, so a runtime stage cannot copy a
  // subtree of it; Next's file tracing produces a real, pruned tree instead.
  output: "standalone",
  // ADR-001 §D3: explicit, not relying on Turbopack auto-transpilation.
  transpilePackages: ["@medaris/ui", "@medaris/icons"],
};

export default nextConfig;
