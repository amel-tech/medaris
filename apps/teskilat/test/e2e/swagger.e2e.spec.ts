/**
 * MDRS-69 — proof that teskilat serves no Swagger UI under
 * `NODE_ENV=production`, as behaviour rather than as a resolved flag.
 *
 * `swaggerEnabledUnlessProduction` returning `false` is necessary but not sufficient
 * evidence: the requirement is that the module is not mounted, so these tests
 * boot a real Nest application, run the same `mountSwagger` call `main.ts`
 * makes, and assert the HTTP status of the documentation path.
 *
 * `NODE_ENV` is set before `ConfigModule` compiles, because the config factory
 * reads `process.env` once per call and the resolved value is what the module
 * caches.
 */
import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";
import { AppModule } from "../../src/app.module";
import { mountSwagger } from "../../src/swagger";

const DOCS_PATH = "/docs";

/**
 * Boots the application with `env` applied, then mounts.
 *
 * `compileEnv` exists to drive the two layers of the guard apart. The config
 * factory reads `process.env` when the module compiles; `mountSwagger` reads it
 * again when it runs. Passing a different `compileEnv` compiles a
 * `ConfigService` that carries `swagger.enabled: true` and then asks
 * `mountSwagger` to judge a production environment — the exact shape that used
 * to log "never mounts Swagger UI" and mount it anyway.
 */
async function bootWith(
  env: Record<string, string>,
  compileEnv?: Record<string, string>
): Promise<{
  app: INestApplication<App>;
  mounted: boolean;
  warnings: string[];
}> {
  const applyEnv = (values: Record<string, string>) => {
    for (const [key, value] of Object.entries(values)) {
      process.env[key] = value;
    }
  };

  applyEnv(compileEnv ?? env);

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  // Only now does the mount-time environment take effect, so the ConfigService
  // above is already carrying whatever `compileEnv` resolved.
  if (compileEnv) {
    applyEnv(env);
  }

  const app = moduleFixture.createNestApplication<INestApplication<App>>();

  // Mounted before `init()`, matching main.ts's order: there,
  // `NestFactory.create` does not initialise the application — `app.listen()`
  // does — so `mountSwagger` runs first there too. Calling it after
  // `app.init()` here left `/docs` a 404 with the flag on, measured, which
  // would have made every negative assertion below vacuous.
  const warnings: string[] = [];
  const mounted = mountSwagger(app, app.get(ConfigService), {
    warn: (message: string) => warnings.push(message),
  });

  await app.init();

  return { app, mounted, warnings };
}

describe("teskilat Swagger mounting (e2e)", () => {
  const originalEnv = process.env;
  let app: INestApplication<App> | undefined;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // apps/teskilat/Dockerfile pins /docs through SWAGGER_ENDPOINT; naming it
    // here keeps the assertions independent of the host's .env.
    process.env.SWAGGER_ENDPOINT = DOCS_PATH;
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    process.env = originalEnv;
  });

  it("does not mount the UI in production, even with SWAGGER_ENABLED=true", async () => {
    const booted = await bootWith({
      NODE_ENV: "production",
      SWAGGER_ENABLED: "true",
    });
    app = booted.app;

    expect(booted.mounted).toBe(false);
    await request(app.getHttpServer()).get(DOCS_PATH).expect(404);
    await request(app.getHttpServer()).get(`${DOCS_PATH}-json`).expect(404);
  });

  it("warns that it ignored the flag rather than failing silently", async () => {
    const booted = await bootWith({
      NODE_ENV: "production",
      SWAGGER_ENABLED: "true",
    });
    app = booted.app;

    expect(booted.warnings).toHaveLength(1);
    expect(booted.warnings[0]).toContain("SWAGGER_ENABLED=true");
  });

  it("ignores tedrisat's SWAGGER_ALLOW_IN_PRODUCTION opt-in", async () => {
    const booted = await bootWith({
      NODE_ENV: "production",
      SWAGGER_ENABLED: "true",
      SWAGGER_ALLOW_IN_PRODUCTION: "true",
    });
    app = booted.app;

    expect(booted.mounted).toBe(false);
    await request(app.getHttpServer()).get(DOCS_PATH).expect(404);
  });

  it("serves the UI outside production when the flag is set", async () => {
    // The negative assertions above only mean something if the positive one
    // holds: without this, a broken mount would read as a passing guard.
    const booted = await bootWith({
      NODE_ENV: "development",
      SWAGGER_ENABLED: "true",
    });
    app = booted.app;

    expect(booted.mounted).toBe(true);
    expect(booted.warnings).toHaveLength(0);
    await request(app.getHttpServer()).get(DOCS_PATH).expect(200);
  });

  it("does not mount the UI when the flag is off", async () => {
    const booted = await bootWith({
      NODE_ENV: "development",
      SWAGGER_ENABLED: "false",
    });
    app = booted.app;

    expect(booted.mounted).toBe(false);
    expect(booted.warnings).toHaveLength(0);
    await request(app.getHttpServer()).get(DOCS_PATH).expect(404);
  });

  it("refuses even when the cached config says Swagger is enabled", async () => {
    // The bug this closes: the config factory ran under development, so
    // `swagger.enabled` is `true` in the ConfigService, and only the live
    // environment says production. `mountSwagger` used to warn "never mounts
    // Swagger UI" and mount it on the next line.
    const booted = await bootWith(
      { NODE_ENV: "production", SWAGGER_ENABLED: "true" },
      { NODE_ENV: "development", SWAGGER_ENABLED: "true" }
    );
    app = booted.app;

    expect(booted.mounted).toBe(false);
    await request(app.getHttpServer()).get(DOCS_PATH).expect(404);
    await request(app.getHttpServer()).get(`${DOCS_PATH}-json`).expect(404);
    // And it said so, rather than refusing quietly.
    expect(booted.warnings).toHaveLength(1);
  });

  it("refuses when the live environment allows it but the config does not", async () => {
    // The mirror image, so neither layer is load-bearing on its own: the
    // environment `mountSwagger` judges permits Swagger, and the compiled
    // config says off.
    const booted = await bootWith(
      { NODE_ENV: "development", SWAGGER_ENABLED: "true" },
      { NODE_ENV: "development", SWAGGER_ENABLED: "false" }
    );
    app = booted.app;

    expect(booted.mounted).toBe(false);
    await request(app.getHttpServer()).get(DOCS_PATH).expect(404);
  });

  it("still answers the health endpoint with Swagger suppressed", async () => {
    // The guard must not take the service down with it.
    const booted = await bootWith({
      NODE_ENV: "production",
      SWAGGER_ENABLED: "true",
    });
    app = booted.app;

    await request(app.getHttpServer()).get("/health").expect(200);
  });
});
