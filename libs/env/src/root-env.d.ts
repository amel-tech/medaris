// Types for src/root-env.cjs, which is authored as CommonJS rather than
// TypeScript on purpose — see the WHY .cjs note at the top of that file.
//
// Only the two Nest apps consume these types. `apps/tedrisat` and
// `apps/teskilat` compile with `moduleResolution: "node"` (the node10
// algorithm); the four `next.config.js` call sites go through `createRequire`
// and are never typechecked. Measured against apps/tedrisat: `.d.ts` and
// `.d.cts` both resolve, with or without the `types` field, because node10
// substitutes the declaration extension onto `main`. `.d.ts` plus an explicit
// `types` field is the combination that needs no algorithm-specific knowledge
// to read.

/** The six deployable apps the prefix scheme knows about. */
export type MedarisApp =
  | "landing"
  | "nazir"
  | "nizam"
  | "tedris"
  | "tedrisat"
  | "teskilat";

/** How wide a declaration in the root file reaches. */
export type EnvScope = "root" | "shared" | "group" | "app";

export interface EnvClassification {
  scope: EnvScope;
  /** The apps this key reaches. Empty for `root`-scoped keys. */
  targets: MedarisApp[];
  /** The key as the app sees it, with any prefix stripped. */
  key: string;
}

export interface LoadRootEnvOptions {
  /**
   * Skip the walk-up and use this directory as the workspace root. Intended for
   * tests; production callers pass nothing so the marker decides.
   */
  root?: string;
  /** File name to read inside the root. Defaults to `.env`. */
  file?: string;
}

/** The marker file that identifies the workspace root. */
export declare const MARKER: "pnpm-workspace.yaml";

export declare const APPS: MedarisApp[];
export declare const WEB_APPS: MedarisApp[];
export declare const API_APPS: MedarisApp[];

/** Keys read from the root file by docker-compose, belonging to no app. */
export declare const ROOT_ONLY: Set<string>;

/**
 * Walk up from `from` for the workspace root.
 *
 * @throws if no `pnpm-workspace.yaml` exists anywhere up the tree. That is the
 * single not-found behaviour every call site inherits (MDRS-66); it never
 * returns null and never skips in silence.
 */
export declare function findRepoRoot(from?: string): string;

/** Split `NIZAM__NEXTAUTH_URL` into its targets and its canonical key name. */
export declare function classify(key: string): EnvClassification;

/** Parse `KEY=VALUE` lines, dropping comments and blank lines. */
export declare function parseEnv(
  text: string
): Array<{ key: string; value: string }>;

/** Reduce parsed entries to what one app should see. Narrowest scope wins. */
export declare function resolveFor(
  app: MedarisApp,
  entries: Array<{ key: string; value: string }>
): Map<string, string>;

/**
 * Apply the root `.env` to `process.env` for one app and return the keys it
 * actually set. An empty map means the file was absent or set nothing new,
 * which is the normal production shape. A missing workspace root throws.
 */
export declare function loadRootEnv(
  app: MedarisApp,
  options?: LoadRootEnvOptions
): Map<string, string>;
