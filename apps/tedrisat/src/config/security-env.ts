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
 *
 * `KEYCLOAK_ISSUER` and `KEYCLOAK_AUDIENCE` join them for the same reason
 * (MDRS-30): JwtVerifierService checks `iss` and `aud` on every token, and a
 * fallback would silently restore the behaviour where any token signed by the
 * realm key — an ID token, a token minted for another client — is accepted.
 */
const securityEnvSchema = z.object({
  KEYCLOAK_JWKS_URL: z.string().url(),
  KEYCLOAK_ISSUER: z.string().url(),
  KEYCLOAK_AUDIENCE: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
});

/**
 * True only inside a test-runner worker.
 *
 * The exemption is keyed on a worker variable rather than `NODE_ENV` alone
 * because `NODE_ENV=test` is not exclusive to the test runner — a staging
 * container or a CI job reusing a compose file can carry it, and such an
 * environment would otherwise be handed `jwksUrl = "test-url"` and 401 every
 * request, which is the exact failure this task removes.
 *
 * Both runners are named because MDRS-20 replaced Jest with Vitest, which never
 * sets `JEST_WORKER_ID`. Keying on Jest alone silently voided this exemption
 * the moment the two landed together, and tedrisat then refused to boot in its
 * own unit suites. `JEST_WORKER_ID` is kept so the guard does not depend on
 * which runner a given app has been migrated to.
 *
 * apps/tedrisat/test/helpers/test-app.helper.ts sets both variables before
 * AppModule is imported, so the suites do not depend on the fallbacks — the
 * fallbacks only cover unit suites that never boot the Nest container.
 */
export function isTestRunner(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.NODE_ENV === "test" &&
    (env.JEST_WORKER_ID !== undefined || env.VITEST_WORKER_ID !== undefined)
  );
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

/**
 * `KEYCLOAK_ALLOWED_CLIENTS` is a comma-separated `azp` allow-list. It is not
 * validated here because whether it is required depends on the audience, which
 * only the verifier knows: with an audience that names this API specifically
 * it is an optional narrowing, but with a realm-wide audience such as
 * `account` it is the only thing carrying the client binding, and
 * `loadJwtClaimPolicy` refuses to construct without it. Empty therefore means
 * "no `azp` restriction", never "checks disabled".
 */
function readAllowedClients(env: NodeJS.ProcessEnv): string {
  return env.KEYCLOAK_ALLOWED_CLIENTS || "";
}

/** All required variables, for the runtime config. */
export function readSecurityEnv(env: NodeJS.ProcessEnv = process.env) {
  if (isTestRunner(env)) {
    return {
      jwksUrl: env.KEYCLOAK_JWKS_URL || "test-url",
      issuer: env.KEYCLOAK_ISSUER || "https://keycloak.invalid/realms/test",
      audience: env.KEYCLOAK_AUDIENCE || "test-audience",
      allowedClients: readAllowedClients(env),
      dbPassword: env.DB_PASSWORD || "tedrisat",
    };
  }

  const parsed = securityEnvSchema.safeParse(env);

  if (!parsed.success) {
    reject(parsed.error.issues);
  }

  return {
    jwksUrl: parsed.data.KEYCLOAK_JWKS_URL,
    issuer: parsed.data.KEYCLOAK_ISSUER,
    audience: parsed.data.KEYCLOAK_AUDIENCE,
    allowedClients: readAllowedClients(env),
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
