import { LoggerModule } from "@medaris/common";
import { ConfigModule } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { AppController } from "../../src/app.controller";
import { AppService } from "../../src/app.service";

// MDRS-32: this module used to import AuthGuardModule and load a stub keycloak
// config. Both existed only for `GET /secure`, the guarded no-op removed with
// the example scaffolding — AppController now has no guarded route.
describe("AppController", () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        LoggerModule.forRoot(),
      ],
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe("root", () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe(
        "Tedrisat Hizmetinden Selamun Aleyküm!"
      );
    });
  });

  describe("health", () => {
    it("should report the service as ok", () => {
      const health = appController.getHealth();

      expect(health.service).toBe("tedrisat");
      expect(health.status).toBe("ok");
      expect(health.version).toBeTruthy();
    });
  });
});
