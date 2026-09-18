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

declare module "vitest" {
  export interface ProvidedContext {
    postgres: TestPostgresConnection;
  }
}

let container: StartedPostgreSqlContainer | null = null;

/**
 * Stops the container if it is still up. Idempotent, so the signal handlers and
 * `teardown` below can both call it.
 */
async function stopContainer(): Promise<void> {
  if (!container) {
    return;
  }

  const stopping = container;
  container = null;

  console.log("Stopping the shared PostgreSQL container...");
  await stopping.stop();
}

/**
 * Ctrl-C during a run. Vitest is not guaranteed to reach `teardown` on a
 * signal, and these handlers live here rather than in the helper because the
 * main process is now the only one holding the container. Testcontainers' Ryuk
 * reaper is the backstop if the process dies without running either.
 *
 * `once`, so a second Ctrl-C reaches the default handler instead of starting a
 * second stop on a container that is already going away.
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

  container = await new PostgreSqlContainer("postgres:17-alpine")
    .withDatabase("tedrisat_test")
    .withUsername("testuser")
    .withPassword("testpass")
    .withExposedPorts(5432)
    .start();

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
}

export async function teardown(): Promise<void> {
  await stopContainer();
}
