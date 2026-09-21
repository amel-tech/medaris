/**
 * tedrisat — one Postgres container for the whole run, not one per file
 * (MDRS-84).
 *
 * Before this file, `test/helpers/test-app.helper.ts` held the container in a
 * module-level singleton. `vitest.config.ts` sets `pool: "forks"` and
 * `fileParallelism: false`, so Vitest isolates every test file in its own fork
 * and that singleton never survived a file boundary: each e2e suite started its
 * own `postgres:17-alpine` and ran the full 14-migration set. Measured on main
 * at 9cf36a8 — 8 container boots, 38.5 s wall clock for `nx run tedrisat:test`.
 *
 * A `globalSetup` module is the fix because it runs once per Vitest run in the
 * main process, which is the one scope that outlives the per-file forks.
 *
 * The connection details reach the workers through `provide` / `inject`, NOT
 * through `process.env`. A fork's environment is a copy taken when it is
 * spawned, so a variable set here would reach a worker only by accident of
 * timing — and silently not reach one that was already running.
 *
 * What this file does not do is hand every suite the same database. It exposes
 * the container's own database as `adminDatabase`, and `createTestApp` creates
 * a fresh database per test file inside this one container; see
 * `test/helpers/test-app.helper.ts` for why.
 */
import { generateKeyPairSync } from "node:crypto";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";

/**
 * `import type`, not a plain import, for the two symbols above that are only
 * ever used in type position. `TestProject` has no runtime export at all, so a
 * value import of it fails at load time under the SWC/ESM transform.
 *
 * This is NOT the `useImportType` trap CLAUDE.md warns about. That one is about
 * NestJS constructor parameters, whose types have to survive into
 * `design:paramtypes` metadata; nothing here is injected by Nest. Biome's rule
 * stays off for this package either way — these are hand-written, not the rule
 * reintroduced.
 */

/** The shape handed to every worker. Must stay structured-clone-serialisable. */
export interface TestPostgresConnection {
  host: string;
  port: number;
  username: string;
  password: string;
  /**
   * The database the container itself created. Suites never run against it —
   * it is the connection target used to `CREATE DATABASE` the per-file ones.
   */
  adminDatabase: string;
}

/**
 * The realm this run pretends to be (MDRS-89).
 *
 * Before this, every `createTestApp` booted `KeycloakPublicKeyProvider` against
 * the live `auth.medaris.app`, because `overrideGuard(AuthGuard)` replaces the
 * guard and not the key provider — its `onModuleInit` ran regardless and
 * `app.init()` awaited it. Measured on `2b9457f`: 22 `createTestApp` call sites
 * across the nine e2e files, 21 of them pointed at production.
 *
 * That made the gate depend on a host being reachable, and the dependency was
 * invisible in both directions: the provider swallows a failed fetch and logs,
 * so a run where the realm is down looks identical to one where it is up. On
 * 2026-09-18 every boot on one machine logged `Failed to pre-load JWKS keys`;
 * on 2026-09-20 the same commit on the same machine logged none, because the
 * host had become reachable again. Same code, two different paths through
 * `onModuleInit`, no way to tell from the output which one a run took.
 *
 * The keypair is generated once per run here rather than per file: RSA-2048
 * keygen is the expensive part, and the workers only need the PEMs.
 */
export interface TestKeycloakKeys {
  /** The `kid` both the stub provider and every minted token carry. */
  kid: string;
  /** SPKI PEM — what the stub key provider hands the verifier. */
  publicKey: string;
  /** PKCS#8 PEM — what `mintTestToken` signs with. */
  privateKey: string;
  /** `iss` the verifier is configured with and tokens must carry. */
  issuer: string;
  /** `aud` the verifier is configured with and tokens must carry. */
  audience: string;
  /**
   * The JWKS URL the app is configured with. An RFC 2606 `.invalid` host on
   * purpose: nothing should reach it, and if some future code path does, DNS
   * fails it fast and deterministically instead of quietly succeeding against
   * a real realm.
   */
  jwksUrl: string;
}

declare module "vitest" {
  export interface ProvidedContext {
    postgres: TestPostgresConnection;
    keycloak: TestKeycloakKeys;
  }
}

const TEST_REALM_ISSUER = "https://keycloak.invalid/realms/amel-tech-dev";

/**
 * The in-flight or settled start — a PROMISE, not the container it resolves to.
 *
 * Holding the resolved container instead would leave a hole for the whole
 * duration of `start()`: image pull, container create and the wait strategy,
 * which is the longest single stretch of the run and exactly when a developer
 * reaches for Ctrl-C. A signal in that window would find this still `null`,
 * `stopContainer` would return immediately, and the process would exit with a
 * Postgres container nothing holds a reference to. Ryuk would be the only thing
 * left to reap it, and `TESTCONTAINERS_RYUK_DISABLED=true` is a real setting.
 *
 * It is assigned synchronously in the same statement that calls `.start()`,
 * before any await point, so the window closes rather than merely narrows.
 */
let startup: Promise<StartedPostgreSqlContainer> | null = null;

/**
 * Stops the container if it is still up, waiting for an in-flight start first.
 * Idempotent, so the signal handlers and `teardown` below can both call it.
 */
async function stopContainer(): Promise<void> {
  const pending = startup;
  if (!pending) {
    return;
  }
  startup = null;

  console.log("Stopping the shared PostgreSQL container...");
  // A start that threw leaves nothing to stop, and rethrowing here would only
  // replace the real failure with a teardown one. Ryuk stays the backstop for a
  // container that got far enough to exist before failing.
  const started = await pending.catch(() => null);
  await started?.stop();
}

/**
 * Ctrl-C during a run. Vitest is not guaranteed to reach `teardown` on a
 * signal, and these handlers live here rather than in the helper because the
 * main process is now the only one holding the container. Testcontainers' Ryuk
 * reaper is the backstop if the process dies without running either.
 *
 * `once`, so a second Ctrl-C reaches the default handler instead of starting a
 * second stop on a container that is already going away.
 *
 * A signal that arrives mid-`start()` does NOT exit immediately: `stopContainer`
 * waits for the start to settle so that it has something to stop. That is the
 * deliberate trade — a few seconds against a leaked container — and the second
 * Ctrl-C is the way out of it.
 */
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    // 128 + the signal number, the shell convention. Exiting 0 — which is what
    // the per-fork handlers this replaced did — reports an interrupted run as a
    // passing one, and `-t test` is the gate CLAUDE.md says cannot be skipped.
    const code = signal === "SIGINT" ? 130 : 143;
    // `finally`, not `then`: a container that fails to stop must still exit,
    // rather than leave the process hanging with no exit code at all.
    void stopContainer().finally(() => process.exit(code));
  });
}

export async function setup(project: TestProject): Promise<void> {
  console.log("Starting the shared PostgreSQL container for tests...");

  startup = new PostgreSqlContainer("postgres:17-alpine")
    .withDatabase("tedrisat_test")
    .withUsername("testuser")
    .withPassword("testpass")
    .withExposedPorts(5432)
    .start();

  const container = await startup;

  project.provide("postgres", {
    host: container.getHost(),
    port: container.getMappedPort(5432),
    username: container.getUsername(),
    password: container.getPassword(),
    adminDatabase: container.getDatabase(),
  });

  console.log(
    `Shared PostgreSQL container started at ${container.getConnectionUri()}`
  );

  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  project.provide("keycloak", {
    kid: "medaris-test-key",
    publicKey,
    privateKey,
    issuer: TEST_REALM_ISSUER,
    audience: "tedrisat-api",
    jwksUrl: `${TEST_REALM_ISSUER}/protocol/openid-connect/certs`,
  });
}

export async function teardown(): Promise<void> {
  await stopContainer();
}
