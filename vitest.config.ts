/**
 * Shared Vitest base for the whole workspace (MDRS-20).
 *
 * Per-project configs `mergeConfig` this file, so anything that must be true
 * everywhere belongs here and nothing project-specific does. `nx.json`
 * `sharedGlobals` lists this path, so editing it invalidates every cached
 * `test` result — which is the point.
 *
 * Deliberately does NOT set `test.include`: `mergeConfig` concatenates arrays,
 * so a base glob would leak into every project's spec selection and could not
 * be narrowed. Each project owns its own `include`.
 */
import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

/**
 * The one non-negotiable piece of the Vitest migration, for the NestJS apps
 * only (MDRS-65 hoisted it here; it lived twice, byte-identically, in
 * `apps/tedrisat/vitest.config.ts` and `apps/teskilat/vitest.config.ts`).
 *
 * NestJS resolves constructor dependencies from the `design:paramtypes`
 * metadata that `emitDecoratorMetadata` writes. Vitest transforms with esbuild
 * by default, and esbuild emits no decorator metadata at all — so DI silently
 * stops resolving in tests while `tsc --noEmit` and `nest build` stay green.
 * Routing the transform through SWC with these three flags is what keeps the
 * metadata alive:
 *
 *   - `parser.decorators`      — parse decorators at all
 *   - `transform.legacyDecorator`  — TS experimental (Stage 1) semantics, which
 *                                    is what `experimentalDecorators` in
 *                                    `tsconfig.json` selects and what Nest needs
 *   - `transform.decoratorMetadata` — the actual `design:*` emit
 *
 * Two copies of this were one dropped flag away from one app losing DI while
 * the other kept it, with typecheck and build green either way.
 *
 * Exported, never added to this file's own `plugins` array below: only the two
 * Nest apps need the SWC transform, so a web project that later `mergeConfig`s
 * this base does not run its files through SWC. The four consumers — each Nest
 * app's `vitest.config.ts` and `vitest.integration.config.ts` — call it and get
 * the same options object.
 *
 * Note what that does NOT buy: the `unplugin-swc` import above is a static
 * top-level import, so it is evaluated whenever this module loads, whether or
 * not `nestSwcPlugin()` is ever called. Any project merging this base therefore
 * resolves `unplugin-swc` at config-load time. That is fine — but it is why the
 * package is declared in the workspace-root `package.json` rather than per app,
 * along with `@swc/core`, its required peer and the thing the catalog pins for
 * `emitDecoratorMetadata` under Vitest. If the plugin ever has to become truly
 * opt-in, the import has to move behind a dynamic `await import()` first.
 *
 * Neither Nest app declares `unplugin-swc` any more, because neither imports
 * it: moving the import without moving the declaration left both of them
 * failing `depcheck` with `Unused devDependencies * unplugin-swc`.
 */
export const nestSwcPlugin = () =>
  swc.vite({
    // Read nothing from tsconfig.json: `module: "commonjs"` there is correct for
    // `nest build` and wrong for Vitest, which needs ESM out of the transform.
    tsconfigFile: false,
    jsc: {
      target: "es2022",
      parser: { syntax: "typescript", decorators: true },
      transform: { legacyDecorator: true, decoratorMetadata: true },
      // Nest logs and some error paths read `constructor.name`.
      keepClassNames: true,
    },
    module: { type: "es6" },
    sourceMaps: true,
  });

export default defineConfig({
  test: {
    // Keeps `describe` / `it` / `expect` / `beforeEach` / `vi` ambient, so the
    // specs inherited from Jest need no import churn.
    globals: true,
    environment: "node",
    // A project whose glob matches nothing is a dropped suite, not a pass.
    passWithNoTests: false,
    // Replaces jest-junit; Vitest ships the reporter, so no extra dependency.
    reporters: ["default", "junit"],
    outputFile: { junit: "./coverage/junit.xml" },
    coverage: {
      provider: "v8",
      reporter: ["json-summary", "text", "html"],
      reportsDirectory: "./coverage",
    },
  },
});
