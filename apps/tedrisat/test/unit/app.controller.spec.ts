import { LoggerModule } from "@medaris/common";
import { ConfigModule } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { AppController } from "../../src/app.controller";
import { AppService } from "../../src/app.service";
import { configuration } from "../../src/config";

// RFC 2606 `.invalid` fixtures (MDRS-89): readSecurityEnv demands these outside
// the test runner, and the environment cases below leave the runner's
// NODE_ENV=test behind on purpose.
function setCompleteSecurityEnv() {
  process.env.KEYCLOAK_JWKS_URL =
    "https://keycloak.invalid/realms/amel-tech-dev/protocol/openid-connect/certs";
  process.env.KEYCLOAK_ISSUER = "https://keycloak.invalid/realms/amel-tech-dev";
  process.env.KEYCLOAK_AUDIENCE = "tedrisat-api";
  process.env.DB_PASSWORD = "a-real-password";
}

// The real configuration factory, not a stub: MDRS-129 was a literal that
// ignored it, so the test has to prove the factory's value reaches the body.
async function createController(): Promise<AppController> {
  const app: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [configuration],
      }),
      LoggerModule.forRoot(),
    ],
    controllers: [AppController],
    providers: [AppService],
  }).compile();

  return app.get<AppController>(AppController);
}

// MDRS-32: this module used to import AuthGuardModule and load a stub keycloak
// config. Both existed only for `GET /secure`, the guarded no-op removed with
// the example scaffolding — AppController now has no guarded route.
describe("AppController", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Swagger's production policy reads this too; a stray value from the host
    // shell must not decide whether the production cases can build a config.
    delete process.env.SWAGGER_ENABLED;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("root", () => {
    it('should return "Hello World!"', async () => {
      const appController = await createController();

      expect(appController.getHello()).toBe(
        "Tedrisat Hizmetinden Selamun Aleyküm!"
      );
    });
  });

  describe("health", () => {
    it("should report the service as ok", async () => {
      const health = (await createController()).getHealth();

      expect(health.status).toBe("ok");
      expect(health.version).toBeTruthy();
    });

    // MDRS-129: the environment was the literal "development" whatever the
    // container ran as.
    it("reports production when NODE_ENV=production", async () => {
      process.env.NODE_ENV = "production";
      setCompleteSecurityEnv();

      const health = (await createController()).getHealth();

      expect(health.environment).toBe("production");
    });

    it("reports development when NODE_ENV is unset", async () => {
      delete process.env.NODE_ENV;
      setCompleteSecurityEnv();

      const health = (await createController()).getHealth();

      expect(health.environment).toBe("development");
    });

    it("takes the service name from SERVICE_NAME", async () => {
      process.env.SERVICE_NAME = "tedrisat-service";

      const health = (await createController()).getHealth();

      expect(health.service).toBe("tedrisat-service");
    });

    it("falls back to the package name when SERVICE_NAME is unset", async () => {
      delete process.env.SERVICE_NAME;

      const health = (await createController()).getHealth();

      expect(health.service).toBe("@medaris/tedrisat");
    });
  });
});
