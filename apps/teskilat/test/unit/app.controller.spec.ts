import { LoggerModule } from "@medaris/common";
import { ConfigModule } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { AppController } from "../../src/app.controller";
import { AppService } from "../../src/app.service";
import { configuration } from "../../src/config";

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
        "Teşkilat Hizmetinden Selamun Aleyküm!"
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

      const health = (await createController()).getHealth();

      expect(health.environment).toBe("production");
    });

    it("reports development when NODE_ENV is unset", async () => {
      delete process.env.NODE_ENV;

      const health = (await createController()).getHealth();

      expect(health.environment).toBe("development");
    });

    it("takes the service name from SERVICE_NAME", async () => {
      process.env.SERVICE_NAME = "teskilat-service";

      const health = (await createController()).getHealth();

      expect(health.service).toBe("teskilat-service");
    });

    it("falls back to the package name when SERVICE_NAME is unset", async () => {
      delete process.env.SERVICE_NAME;

      const health = (await createController()).getHealth();

      expect(health.service).toBe("@medaris/teskilat");
    });
  });
});
