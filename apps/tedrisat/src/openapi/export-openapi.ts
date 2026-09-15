/**
 * Writes `libs/services/swagger-docs/tedrisat.json` from the live Nest metadata.
 *
 * WHY THIS EXISTS (MDRS-58)
 * The spec only ever existed as the output of `SwaggerModule.createDocument`
 * inside a running service — no script in the repository wrote it. Refreshing
 * it therefore meant booting tedrisat, opening Swagger UI and saving the JSON
 * by hand, and predictably nobody did: MDRS-27 put both `flashcard-label`
 * controllers behind `AuthGuard`, and the committed spec did not merely miss
 * the security requirement, it had never heard of those ten routes at all.
 * This is the missing step; `pnpm --filter @medaris/services generate:tedrisat`
 * then regenerates the typed client from what it writes.
 *
 * WHY PREVIEW MODE
 * `createDocument` needs an initialised application, and `AppModule` pulls in
 * `DatabaseService`, whose `onModuleInit` opens a `pg` pool and runs the
 * migrator. Nest's preview mode registers every module, controller and route in
 * the container without instantiating providers or firing lifecycle hooks, so
 * the router metadata the Swagger scanner reads is complete while nothing
 * connects to anything. The alternative — `docker compose up` for a throwaway
 * Postgres — would make regenerating the contract depend on a running database,
 * which is the friction that let the spec go stale in the first place.
 *
 * WHY THE ENVIRONMENT COMES FROM .env.example
 * A committed artifact must not change with whoever runs the script. Two things
 * would otherwise leak in: `config/security-env.ts` refuses to build a config
 * without `KEYCLOAK_JWKS_URL`, `KEYCLOAK_ISSUER`, `KEYCLOAK_AUDIENCE` and
 * `DB_PASSWORD`, and the first of those decides the two OAuth2 URLs in
 * `components.securitySchemes.bearer`. They are therefore read from the
 * committed `.env.example`, through the same loader the apps use so that the
 * `API__`/`TEDRISAT__` prefix rules stay in one implementation, and written
 * over whatever the ambient environment holds. Nothing here opens a socket; the
 * values only shape the document.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { type OpenAPIObject, SwaggerModule } from "@nestjs/swagger";
import * as pkg from "../../package.json";
import { buildTedrisatOpenApiConfig } from "../config/openapi-document";

interface EnvEntry {
  key: string;
  value: string;
}

interface RootEnvLoader {
  parseEnv: (text: string) => EnvEntry[];
  resolveFor: (app: string, entries: EnvEntry[]) => Map<string, string>;
}

/**
 * Where the document goes: the first CLI argument, resolved against the
 * current directory. The default lives in this package's `openapi:export`
 * script, not here — the destination is inside `libs/services`, another
 * package's directory layout, and this app declares no dependency on it, so
 * the exporter itself names no path it does not own. `libs/services/
 * swagger-docs/README.md`'s two-command sequence is unchanged.
 */
function targetPathFromArgv(): string {
  const arg = process.argv[2];
  if (!arg) {
    throw new Error(
      "export-openapi: pass the destination file as the first argument, e.g. " +
        "`pnpm --filter @medaris/tedrisat run openapi:export` (whose script " +
        "supplies libs/services/swagger-docs/tedrisat.json)."
    );
  }
  return resolve(process.cwd(), arg);
}

/** The template the deterministic values are read from. */
const TEMPLATE_FILE = ".env.example";

/** Set to accept a document that drops paths the committed spec had. */
const ALLOW_REMOVALS_FLAG = "OPENAPI_EXPORT_ALLOW_PATH_REMOVALS";

/**
 * The keys whose values can reach the document, directly or by way of the
 * config validation that runs before it. Anything outside this list is left
 * alone: this is a build-time tool, not a second environment loader.
 */
const PINNED_KEYS = [
  "KEYCLOAK_JWKS_URL",
  "KEYCLOAK_ISSUER",
  "KEYCLOAK_AUDIENCE",
  "DB_PASSWORD",
];

/**
 * Same marker and same walk as tools/env/root-env.cjs. `pnpm-workspace.yaml`
 * rather than `.git`, which is a *file* rather than a directory inside a git
 * worktree — and this is run from worktrees. Walking also keeps the depth of
 * this file from being encoded as a count of `..` segments.
 */
function findRepoRoot(from: string): string {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        "export-openapi: no pnpm-workspace.yaml above this file, so the " +
          `workspace root — and with it ${TEMPLATE_FILE} and the spec's own ` +
          "destination — cannot be located."
      );
    }
    dir = parent;
  }
}

/** True for the one errno that means "no such file", not "cannot read it". */
function isNotFound(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "ENOENT";
}

/**
 * Read a file, or return undefined when it does not exist.
 *
 * Deliberately not `existsSync` followed by `readFileSync`: checking a path and
 * then acting on it is a time-of-check/time-of-use race (CWE-367), which CodeQL
 * flags — correctly, even for a build-time tool. Opening it once and handling
 * ENOENT is both race-free and shorter. Any other errno (a permission problem,
 * a directory where a file was expected) still propagates, because those are
 * real failures rather than an absent file.
 */
function readIfPresent(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

/**
 * Pin the document-shaping environment to the committed template, so two runs
 * on two machines produce the same bytes.
 */
function applyDeterministicEnv(root: string): Map<string, string> {
  const loaderPath = join(root, "tools", "env", "root-env.cjs");
  // Required at runtime for the same reason src/load-env.ts requires it:
  // tools/ sits outside every app's tsconfig rootDir. Attempted rather than
  // probed first, for the reason on readIfPresent above.
  let loader: RootEnvLoader;
  try {
    loader = require(loaderPath) as RootEnvLoader;
  } catch (error) {
    if ((error as { code?: string } | null)?.code !== "MODULE_NOT_FOUND") {
      throw error;
    }
    throw new Error(
      `export-openapi: ${loaderPath} could not be loaded. The prefix rules for ` +
        "the root .env live there and are deliberately not duplicated here, so " +
        "there is no fallback to take."
    );
  }
  const { parseEnv, resolveFor } = loader;

  const templatePath = join(root, TEMPLATE_FILE);
  const template = readIfPresent(templatePath);
  if (template === undefined) {
    throw new Error(
      `export-openapi: ${templatePath} is missing, and it is where the four ` +
        "keys that shape the document are read from. Unlike a real .env, this " +
        "file is committed, so its absence is a broken checkout rather than a " +
        "normal state."
    );
  }

  // Only the pinned keys are handed to the loader. resolveFor calls classify()
  // on every entry, and classify THROWS on a prefix it does not recognise — so
  // passing the whole template would let a future unrelated line (a
  // `POSTGRES__…`, say) break `openapi:export` for no reason.
  const entries = parseEnv(template).filter((entry) =>
    PINNED_KEYS.some(
      (key) => entry.key === key || entry.key.endsWith(`__${key}`)
    )
  );
  const resolved = resolveFor("tedrisat", entries);

  // A key present but empty is as unusable as an absent one — security-env.ts
  // rejects both — so `!value` is the right test rather than `!has(key)`.
  const missing = PINNED_KEYS.filter((key) => !resolved.get(key));
  if (missing.length > 0) {
    throw new Error(
      `export-openapi: ${templatePath} no longer declares ${missing.join(", ")} ` +
        "for tedrisat. config/security-env.ts requires all four, and " +
        "KEYCLOAK_JWKS_URL decides the OAuth2 URLs in the emitted document, so " +
        "the spec cannot be regenerated deterministically without them. Restore " +
        "the keys in the template (with their API__ or TEDRISAT__ prefix), or " +
        "update PINNED_KEYS here."
    );
  }

  // Written OVER whatever the shell holds, which is the whole point. The
  // loader's own loadRootEnv() cannot be used for this: root-env.cjs:170 skips
  // any key already in process.env, so it would preserve exactly the ambient
  // values this has to discard.
  for (const key of PINNED_KEYS) {
    const value = resolved.get(key);
    if (value !== undefined) process.env[key] = value;
  }

  // The template is a development one and this is a development-time tool;
  // pinning this keeps the production guards in config/ from firing on a
  // machine whose shell happens to say production.
  process.env.NODE_ENV = "development";

  return resolved;
}

/**
 * Refuse to publish a document that has LOST a path (MDRS-58).
 *
 * Preview mode is what makes this exporter cheap, and it works because nothing
 * here registers routes outside the decorators the scanner reads. That is true
 * today and nothing enforces it: the day a module registers a controller in
 * `onModuleInit`, preview mode skips the hook, the export quietly drops those
 * paths, `generate:tedrisat` deletes the matching client files and
 * `.openapi-generator/FILES` shrinks — silent contract drift, which is the exact
 * failure this whole task exists to end. So the previous artifact is the
 * baseline: paths may be added, and may not vanish.
 *
 * Deliberately not a fixed minimum count. A real deletion is legitimate — PR
 * #50 removes the example module — so this fails LOUD rather than closed
 * forever, and names the override.
 */
function assertNoPathsLost(previous: string, next: OpenAPIObject): void {
  let before: OpenAPIObject;
  try {
    before = JSON.parse(previous) as OpenAPIObject;
  } catch {
    // An unparseable artifact is not a baseline; the fresh write is the fix.
    return;
  }

  const lost = Object.keys(before.paths ?? {}).filter(
    (path) => !(path in next.paths)
  );
  if (lost.length === 0) return;

  throw new Error(
    `export-openapi: ${lost.length} path(s) present in the committed spec are ` +
      `absent from the document just generated:\n  ${lost.join("\n  ")}\n` +
      "Writing this would delete the matching files from the generated client. " +
      "If a route really was removed, re-run with " +
      `${ALLOW_REMOVALS_FLAG}=1 to accept the deletion deliberately; otherwise ` +
      "something stopped the Swagger scanner from seeing those controllers — " +
      "preview mode fires no lifecycle hooks, so a route registered in " +
      "onModuleInit is invisible to this exporter."
  );
}

async function main(): Promise<void> {
  const root = findRepoRoot(__dirname);
  applyDeterministicEnv(root);

  // Imported after the environment is pinned. `./load-env` is deliberately not
  // imported at all — it would apply the developer's own .env, the very
  // non-determinism this script removes. `./otel` is skipped for the same
  // reason, and because no exporter should start a tracing SDK.
  const { NestFactory } = await import("@nestjs/core");
  const { AppModule } = await import("../app.module");

  const app = await NestFactory.create(AppModule, {
    preview: true,
    logger: false,
  });

  try {
    const document = SwaggerModule.createDocument(
      app,
      buildTedrisatOpenApiConfig({
        version: pkg.version,
        jwksUrl: process.env.KEYCLOAK_JWKS_URL,
        // A wrong URL here becomes bytes in a committed artifact — refuse.
        strictJwksUrl: true,
      })
    );

    const target = targetPathFromArgv();

    // Read first, decide after. A missing artifact is a legitimate state — the
    // very first export — and is simply not a baseline to compare against.
    const previous = readIfPresent(target);
    if (previous !== undefined && process.env[ALLOW_REMOVALS_FLAG] !== "1") {
      assertNoPathsLost(previous, document);
    }

    writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);

    console.log(
      `export-openapi: wrote ${Object.keys(document.paths).length} paths to ` +
        `${target} (version ${pkg.version}).`
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
