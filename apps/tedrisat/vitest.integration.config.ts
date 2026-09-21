/**
 * tedrisat — Vitest config for `test:e2e` (MDRS-20).
 *
 * Replaces `test/jest-e2e.json`, whose `testRegex` was
 * `.*\.e2e.*\.spec\.ts$` against `rootDir: ".."` — i.e. every
 * `test/e2e/*.e2e.spec.ts` suite, which the glob below selects. The glob is
 * deliberately not a fixed list, so a new suite is picked up without touching
 * this file.
 *
 * They also run under the `test` target (see `vitest.config.ts`), exactly as
 * they did under Jest: `test:e2e` is a narrower re-run, not extra coverage.
 */
import { defineConfig, mergeConfig } from "vitest/config";
import { nestSwcPlugin } from "../../vitest.config";
import integrationBaseConfig from "../../vitest.integration.config";

export default mergeConfig(
  integrationBaseConfig,
  defineConfig({
    plugins: [nestSwcPlugin()],
    test: {
      root: __dirname,
      include: ["test/**/*.e2e.spec.ts"],
      exclude: ["node_modules/**", "dist/**"],
      // The same single container the `test` target gets (MDRS-84). It has to
      // be named here too: `globalSetup` is not inherited from the sibling
      // config — this file merges the workspace-root integration base, not
      // `./vitest.config.ts` — so leaving it out would give this target no
      // container at all and `inject("postgres")` would throw in every suite.
      //
      // The workspace-root `vitest.integration.config.ts` still explains its
      // `fileParallelism: false` in terms of "parallel suites each start their
      // own postgres". That was true of tedrisat until MDRS-84 and is still
      // true of nothing else — teskilat, the only other consumer, uses no
      // containers. It is left as-is rather than edited because `nx.json`
      // lists the root configs under `sharedGlobals`, so touching one
      // invalidates every project's cached `test` result.
      globalSetup: ["./test/global-setup.ts"],
      // MDRS-89: runs in every worker and refuses any fetch that leaves this
      // machine. `globalSetup` above cannot do this — it runs once in the main
      // process, and the requests happen inside the forks.
      setupFiles: ["./test/setup-no-network.ts"],
    },
  })
);
