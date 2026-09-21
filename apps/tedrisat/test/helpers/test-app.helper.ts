import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import {
  AuthGuard,
  GlobalExceptionFilter,
  LoggerFactory,
  MedarisValidationPipe,
  PUBLIC_KEY_PROVIDER,
} from "@medaris/common";
import { ExecutionContext, INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Client } from "pg";
import { expect, inject } from "vitest";
import { stubPublicKeyProvider } from "./test-keycloak.helper";

// Fixed user id injected by the stubbed AuthGuard in tests.
export const TEST_USER_ID = "623fdf08-fd0e-481b-a927-4a1c15135e62";
/**
 * The second identity for two-app owner/attacker specs. Declared once so the
 * pattern's one precondition — that the two ids differ — cannot be broken by
 * a mistyped copy.
 */
export const OTHER_USER_ID = "11111111-1111-1111-1111-111111111111";

/**
 * The database this test file owns, or null before the first `createTestApp`.
 *
 * A module-level variable is exactly per-file here, and deliberately so:
 * `vitest.config.ts` sets `pool: "forks"`, which gives every test file a fresh
 * fork and therefore a fresh copy of this module. That is the same mechanism
 * that used to make the container singleton per-file (MDRS-84's bug); the
 * container has moved to `test/global-setup.ts`, and what is left behind is a
 * name, which is what we actually wanted per file.
 */
let databaseForThisFile: string | null = null;

/** Postgres identifiers are 63 bytes, and this one is interpolated into DDL. */
const DATABASE_NAME_PATTERN = /^[a-z0-9_]{1,63}$/;

/**
 * A stable, unique, DDL-safe database name for the calling test file.
 *
 * The stem keeps the run output readable (`tedrisat_kosk_e2e_1f3c9ab2`); the
 * digest is what makes it unique, so two files that share a basename in
 * different directories cannot collide.
 */
function databaseNameForCurrentFile(): string {
  const testPath = expect.getState().testPath;

  if (!testPath) {
    throw new Error(
      "createTestApp could not read expect.getState().testPath, so it cannot " +
        "name this file's database. Call it from a test file's lifecycle hook " +
        "or test body, not at module scope."
    );
  }

  const stem = basename(testPath)
    .replace(/\.spec\.ts$/, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .toLowerCase()
    .slice(0, 40);
  const digest = createHash("sha1").update(testPath).digest("hex").slice(0, 8);
  const name = `tedrisat_${stem}_${digest}`;

  if (!DATABASE_NAME_PATTERN.test(name)) {
    throw new Error(
      `Derived an unusable Postgres database name ${JSON.stringify(name)} ` +
        `from ${testPath}. This is a bug in databaseNameForCurrentFile, not a ` +
        "problem with the test file."
    );
  }

  return name;
}

/**
 * Creates this test file's own database inside the run-wide container and points
 * the environment at it. Runs at most once per file; later `createTestApp` calls
 * in the same file (the owner/attacker pattern) reuse the same database, which
 * is what those specs need.
 *
 * Why a database per file rather than one shared by all of them: before
 * MDRS-84 every file owned a whole container, so cross-file isolation was free.
 * Most suites do truncate in a `beforeEach`, but not all of them —
 * `app.e2e.spec.ts` never cleans, `throttler.e2e.spec.ts` cleans two tables by
 * name — so a single shared database would have made that free property depend
 * on eight files keeping their cleanup discipline, and on `fileParallelism`
 * staying `false`. A fresh database costs one `CREATE DATABASE` plus the
 * migrations the app already runs on boot, and replaces the property instead of
 * dropping it.
 *
 * The environment must be populated BEFORE AppModule is imported, so that
 * `configuration()` reads these values rather than the defaults.
 *
 * **Exported because a suite may need phase one on its own.**
 * `keycloak-audience.e2e.spec.ts` (MDRS-42) starts its own Keycloak container
 * and has to replace the `KEYCLOAK_*` values this function writes before
 * `createTestApp` imports AppModule. It therefore calls this directly, edits
 * the environment, and only then boots the app. The early return above is what
 * makes that safe: `createTestApp` calls this again, finds the database already
 * made, and returns without writing the placeholder `KEYCLOAK_*` values back
 * over the suite's real ones.
 *
 * Do not "simplify" the early return into an unconditional assignment, and do
 * not inline this back into `createTestApp` — either one silently points that
 * suite at production Keycloak instead of its own container, and its
 * assertions would still pass or fail for the wrong reason.
 */
export async function useDatabaseForThisFile(): Promise<void> {
  if (databaseForThisFile) {
    return;
  }

  const postgres = inject("postgres");
  const name = databaseNameForCurrentFile();

  const client = new Client({
    host: postgres.host,
    port: postgres.port,
    user: postgres.username,
    password: postgres.password,
    database: postgres.adminDatabase,
  });

  await client.connect();
  try {
    // Not parameterisable — CREATE DATABASE takes an identifier, not a value.
    // DATABASE_NAME_PATTERN above is what makes the interpolation safe.
    await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }

  databaseForThisFile = name;

  // One line per test file, where the old code printed one container boot per
  // test file. It is what makes "exactly one container, N databases" readable
  // off a run rather than something you have to take on trust.
  console.log(`Using database ${name} in the shared container`);

  process.env.NODE_ENV = "test";
  process.env.DB_HOST = postgres.host;
  process.env.DB_PORT = String(postgres.port);
  process.env.DB_USERNAME = postgres.username;
  process.env.DB_PASSWORD = postgres.password;
  process.env.DB_NAME = name;
  process.env.DB_SSL = "false";
  process.env.AUTO_MIGRATIONS_ENABLED = "true";
  process.env.AUTO_MIGRATIONS_FOLDER = join(
    __dirname,
    "../../src/database/migrations"
  );
  process.env.LOG_LEVEL = "info";
  process.env.OTEL_ENABLED = "false";
  process.env.SWAGGER_ENABLED = "false";
  // The KEYCLOAK_* variables are deliberately NOT written here — see
  // `applyStubKeycloakEnv`, which `createTestApp` calls only in stub mode.
}

/**
 * Points the app at this run's fake realm (MDRS-89).
 *
 * Called from `createTestApp` in stub mode only, immediately before AppModule
 * is imported. It used to live in `useDatabaseForThisFile`, which made
 * `keyProvider: "real"` depend on an unwritten rule: a suite had to call that
 * function itself, THEN set its own `KEYCLOAK_*`, because otherwise
 * `createTestApp` ran it first and overwrote them. A suite that set the
 * variables and called `createTestApp({ keyProvider: "real" })` directly —
 * the obvious way to write it — booted against `keycloak.invalid`, had the
 * failed pre-load swallowed by `onModuleInit`, and answered 401 to everything
 * for a reason nothing in the output named.
 *
 * Binding the writes to the mode instead makes call order irrelevant: in
 * `"real"` mode nothing here runs and the suite's own values stand.
 */
function applyStubKeycloakEnv(): void {
  const keycloak = inject("keycloak");

  // RFC 2606 `.invalid`, not the deployed realm. The stubbed provider means
  // nothing dereferences the URL; if some future code path does, DNS fails it
  // fast instead of quietly succeeding against production Keycloak — which is
  // what happened until MDRS-89: 21 of this suite's 22 app boots made a real
  // request to auth.medaris.app.
  process.env.KEYCLOAK_JWKS_URL = keycloak.jwksUrl;
  process.env.KEYCLOAK_ISSUER = keycloak.issuer;
  process.env.KEYCLOAK_AUDIENCE = keycloak.audience;

  // Pinned by deletion, not left to the ambient environment. The verifier only
  // enforces an `azp` allow-list when this is set, and `mintTestToken` stamps
  // no `azp`; an inherited value — a shell that sourced the root `.env` through
  // a prefix-stripping tool, a CI job exporting it for another step — would
  // turn every minted token into a 401 with nothing in the output to explain
  // it.
  delete process.env.KEYCLOAK_ALLOWED_CLIENTS;
}

/**
 * Creates a test application backed by this file's database in the run-wide
 * Testcontainers postgres instance. AppModule is imported after the environment
 * variables are populated so its ConfigModule reads the connection details
 * directly, and its own boot-time auto-migration builds the schema.
 *
 * Pass `authUserId` to stub the AuthGuard so guarded endpoints run as that
 * user (the guard only auto-bypasses when NODE_ENV === 'development', which is
 * not the case under Vitest).
 *
 * `keyProvider` selects where the app gets its signing keys (MDRS-89):
 *
 * - `"stub"`, the default — `PUBLIC_KEY_PROVIDER` is replaced with an
 *   in-process provider holding this run's generated public key. Nothing
 *   fetches anything. Note this is a SEPARATE override from `authUserId`:
 *   `overrideGuard(AuthGuard)` swaps the guard and leaves the provider in
 *   place, so before MDRS-89 even a fully impersonated app still booted
 *   `KeycloakPublicKeyProvider` and awaited its `onModuleInit` fetch.
 * - `"real"` — the container keeps `KeycloakPublicKeyProvider`. Its one caller
 *   is `keycloak-audience.e2e.spec.ts` (MDRS-42), which runs a Keycloak of its
 *   own and exists specifically to prove that the realm mints the audience the
 *   real provider and verifier accept. Stubbing it there would leave nine
 *   passing tests that assert nothing about Keycloak.
 *
 * A suite asking for `"real"` owns its own `KEYCLOAK_*` values and may set them
 * at any point before this call — nothing here overwrites them, because the
 * placeholders are written only in stub mode. The loopback allowance in
 * `test/setup-no-network.ts` is what lets such a suite reach its container.
 */
export async function createTestApp(options?: {
  authUserId?: string;
  keyProvider?: "stub" | "real";
}): Promise<INestApplication> {
  await useDatabaseForThisFile();

  const useStub = (options?.keyProvider ?? "stub") === "stub";
  if (useStub) {
    applyStubKeycloakEnv();
  }

  // Import AppModule lazily so configuration() runs after env vars are set.
  const { AppModule } = await import("../../src/app.module");

  const builder = Test.createTestingModule({
    imports: [AppModule],
  });

  if (useStub) {
    builder
      .overrideProvider(PUBLIC_KEY_PROVIDER)
      .useValue(stubPublicKeyProvider());
  }

  if (options?.authUserId !== undefined) {
    const userId = options.authUserId;
    builder.overrideGuard(AuthGuard).useValue({
      canActivate: (context: ExecutionContext) => {
        const request = context
          .switchToHttp()
          .getRequest<{ user: { sub: string; preferred_username: string } }>();
        request.user = { sub: userId, preferred_username: "test" };
        return true;
      },
    });
  }

  const moduleFixture: TestingModule = await builder.compile();

  const app = moduleFixture.createNestApplication();

  const logger = LoggerFactory.create();

  app.useGlobalPipes(new MedarisValidationPipe());
  app.useGlobalFilters(new GlobalExceptionFilter(logger));

  return app.init();
}
