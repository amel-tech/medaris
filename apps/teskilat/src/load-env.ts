// MDRS-25: the workspace has one .env, at the repository root, and its keys are
// prefixed by app (`TESKILAT__PORT` -> `PORT`). This module applies it to
// process.env and must be imported FIRST in main.ts — ./otel and ConfigModule
// both read the environment as they are evaluated.
//
// The loader is resolved at runtime rather than imported. tools/ exists in every
// checkout and in the Docker build context, but not in the runtime image — where
// there is no .env either, and the real environment already carries the canonical
// names, so skipping is the correct behaviour rather than a fallback.
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function findRepoRoot(from: string): string | null {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const root = findRepoRoot(__dirname);
const loader = root ? join(root, "tools", "env", "root-env.cjs") : null;

if (loader && existsSync(loader)) {
  const { loadRootEnv } = require(loader);
  loadRootEnv("teskilat");
}
