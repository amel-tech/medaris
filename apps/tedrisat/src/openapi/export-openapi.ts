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
import { SwaggerModule } from "@nestjs/swagger";
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

/** Written relative to the workspace root, where the consumer lives. */
const SPEC_PATH = ["libs", "services", "swagger-docs", "tedrisat.json"];

/** The template the deterministic values are read from. */
const TEMPLATE_FILE = ".env.example";

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

/**
 * Pin the document-shaping environment to the committed template, so two runs
 * on two machines produce the same bytes.
 */
function applyDeterministicEnv(root: string): void {
  const loaderPath = join(root, "tools", "env", "root-env.cjs");
  // Required at runtime for the same reason src/load-env.ts requires it:
  // tools/ sits outside every app's tsconfig rootDir.
  const { parseEnv, resolveFor } = require(loaderPath) as RootEnvLoader;

  const templatePath = join(root, TEMPLATE_FILE);
  const resolved = resolveFor(
    "tedrisat",
    parseEnv(readFileSync(templatePath, "utf8"))
  );

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

  for (const key of PINNED_KEYS) {
    process.env[key] = resolved.get(key);
  }

  // The template is a development one and this is a development-time tool;
  // pinning this keeps the production guards in config/ from firing on a
  // machine whose shell happens to say production.
  process.env.NODE_ENV = "development";
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
      })
    );

    writeFileSync(
      join(root, ...SPEC_PATH),
      `${JSON.stringify(document, null, 2)}\n`
    );

    console.log(
      `export-openapi: wrote ${Object.keys(document.paths).length} paths to ` +
        `${SPEC_PATH.join("/")} (version ${pkg.version}).`
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
