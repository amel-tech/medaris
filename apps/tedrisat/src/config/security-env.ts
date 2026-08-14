import { z } from "zod";

/**
 * Variables that must not fall back to a built-in default.
 *
 * `KEYCLOAK_JWKS_URL` previously defaulted to `"test-url"`, which bypassed the
 * validation in KeycloakPublicKeyProvider.loadConfig: a deployment without a
 * JWKS URL booted, swallowed the fetch error in onModuleInit and then answered
 * 401 to every request. `DB_PASSWORD` previously defaulted to `"tedrisat"` —
 * the credential created in docker/init-db.sql — so a deployment that forgot
 * the variable silently tried a well-known password.
 */
const securityEnvSchema = z.object({
  KEYCLOAK_JWKS_URL: z.string().url(),
  DB_PASSWORD: z.string().min(1),
});

/**
 * True only inside a Jest worker.
 *
 * The exemption is keyed on `JEST_WORKER_ID` rather than `NODE_ENV` alone
 * because `NODE_ENV=test` is not exclusive to the test runner — a staging
 * container or a CI job reusing a compose file can carry it, and such an
 * environment would otherwise be handed `jwksUrl = "test-url"` and 401 every
 * request, which is the exact failure this task removes.
 *
 * apps/tedrisat/test/helpers/test-app.helper.ts sets both variables before
 * AppModule is imported, so the suites do not depend on the fallbacks — the
 * fallbacks only cover unit suites that never boot the Nest container.
 */
export function isTestRunner(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "test" && env.JEST_WORKER_ID !== undefined;
}

function reject(issues: z.ZodIssue[]): never {
  const details = issues
    .map((issue) => `${issue.path.join(".")} — ${issue.message}`)
    .join("; ");

  throw new Error(
    `@medaris/tedrisat cannot start, the environment is incomplete: ${details}. ` +
      "See apps/tedrisat/.env.example."
  );
}

/** Both required variables, for the runtime config. */
export function readSecurityEnv(env: NodeJS.ProcessEnv = process.env) {
  if (isTestRunner(env)) {
    return {
      jwksUrl: env.KEYCLOAK_JWKS_URL || "test-url",
      dbPassword: env.DB_PASSWORD || "tedrisat",
    };
  }

  const parsed = securityEnvSchema.safeParse(env);

  if (!parsed.success) {
    reject(parsed.error.issues);
  }

  return {
    jwksUrl: parsed.data.KEYCLOAK_JWKS_URL,
    dbPassword: parsed.data.DB_PASSWORD,
  };
}

/**
 * Just the password, for drizzle.config.ts — the migration client needs no
 * JWKS URL, but it authenticates against the same database as the runtime
 * pool, so it must fail the same way rather than handing `undefined` to `pg`.
 */
export function requireDbPassword(
  env: NodeJS.ProcessEnv = process.env
): string {
  if (isTestRunner(env)) {
    return env.DB_PASSWORD || "tedrisat";
  }

  const parsed = securityEnvSchema.shape.DB_PASSWORD.safeParse(env.DB_PASSWORD);

  if (!parsed.success) {
    reject(
      parsed.error.issues.map((issue) => ({ ...issue, path: ["DB_PASSWORD"] }))
    );
  }

  return parsed.data;
}
