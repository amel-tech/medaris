import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "../helpers/test-app.helper";

describe("AppController (e2e)", () => {
  let app: INestApplication;

  // `beforeAll`, not `beforeEach`: none of these tests mutate state, and only
  // `afterAll` closes the app — under `beforeEach` every test but the last left
  // an unclosed Nest instance, and its pg pool, behind. MDRS-32 took this suite
  // from 2 tests to 8, which would have made that leak eight-fold.
  beforeAll(async () => {
    app = await createTestApp();
  });

  it("/ (GET)", () => {
    return request(app.getHttpServer())
      .get("/")
      .expect(200)
      .expect("Tedrisat Hizmetinden Selamun Aleyküm!");
  });

  it("/health (GET)", () => {
    return request(app.getHttpServer())
      .get("/health")
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty("service", "tedrisat");
        expect(res.body).toHaveProperty("status", "ok");
        expect(res.body).toHaveProperty("version");
        expect(res.body).toHaveProperty("environment");
      });
  });

  // MDRS-32 removed the scaffolding surface: the example CRUD module and the
  // two debug routes on this controller. These assertions are the regression
  // guard — a re-registered ExampleModule or a restored /throw-error would
  // otherwise be invisible to the suite.
  describe("routes removed in MDRS-32", () => {
    const removed = [
      "/examples",
      "/examples/1",
      "/throw-error",
      "/secure",
    ] as const;

    for (const path of removed) {
      it(`${path} (GET) is not routed`, () => {
        return request(app.getHttpServer()).get(path).expect(404);
      });
    }

    it("/examples (POST) is not routed", () => {
      return request(app.getHttpServer())
        .post("/examples")
        .send({ name: "should not exist" })
        .expect(404);
    });

    it("/examples/:id (DELETE) is not routed", () => {
      return request(app.getHttpServer()).delete("/examples/1").expect(404);
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
