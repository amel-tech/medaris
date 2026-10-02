import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import { courses, enrollments } from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { users } from "../../src/database/schema/user.schema";
import { createTestApp } from "../helpers/test-app.helper";
import {
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-166: Hesap (names), Herkese açık profil and Köşk açma başvurusu, with the
 * real AuthGuard on minted tokens so the token's own names can be told from the
 * ones a person typed.
 */
const ZEYNEP = "c0000000-0000-4000-8000-000000000001";
const OMER = "c0000000-0000-4000-8000-000000000002";
const NOBODY = "c0000000-0000-4000-8000-0000000000ff";

const claims = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ZEYNEP
        ? {
            email: "zeynep@example.com",
            email_verified: true,
            given_name: "Zeynep",
            family_name: "Token",
          }
        : { email: "omer@example.com", given_name: "Ömer", family_name: "B." },
  });

describe("Profile and köşk application (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;

  const as = (sub: string) => ({ Authorization: claims(sub) });
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(
      "user_profiles",
      "kosk_applications",
      ...COURSE_TREE_TABLES,
      "users"
    );
  });

  afterAll(async () => {
    await dbUtils.cleanTables(
      "user_profiles",
      "kosk_applications",
      ...COURSE_TREE_TABLES,
      "users"
    );
    await app.close();
  });

  describe("PATCH /me names", () => {
    it("keeps the typed names across a token refresh and reads them back", async () => {
      await request(server())
        .patch("/me")
        .set(as(ZEYNEP))
        .send({ givenName: "  Zeynep Betül ", familyName: "Karahanlı" })
        .expect(200)
        .expect(({ body }) => {
          expect(body.givenName).toBe("Zeynep Betül");
          expect(body.familyName).toBe("Karahanlı");
          expect(body.email).toBe("zeynep@example.com");
        });

      // The next request carries the token's names again; the typed ones win.
      await request(server())
        .get("/me")
        .set(as(ZEYNEP))
        .expect(200)
        .expect(({ body }) => {
          expect(body.givenName).toBe("Zeynep Betül");
          expect(body.familyName).toBe("Karahanlı");
        });
      // `users` still holds what the token says.
      const [row] = await databaseService.db.select().from(users);
      expect(row.familyName).toBe("Token");
    });

    it("refuses an empty or blank name", async () => {
      await request(server())
        .patch("/me")
        .set(as(ZEYNEP))
        .send({ givenName: "   " })
        .expect(400);
      await request(server())
        .patch("/me")
        .set(as(ZEYNEP))
        .send({ familyName: "" })
        .expect(400);
    });

    it("still saves a time zone alone", async () => {
      await request(server())
        .patch("/me")
        .set(as(ZEYNEP))
        .send({ timeZone: "Europe/Berlin" })
        .expect(200)
        .expect(({ body }) => {
          expect(body.timeZone).toBe("Europe/Berlin");
          expect(body.givenName).toBe("Zeynep");
        });
    });
  });

  describe("public profile", () => {
    const save = (sub: string, body: Record<string, unknown>) =>
      request(server()).patch("/me/public-profile").set(as(sub)).send(body);

    it("starts empty with every switch off", async () => {
      await request(server())
        .get("/me/public-profile")
        .set(as(ZEYNEP))
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            kunye: null,
            gender: null,
            fullName: "Zeynep Token",
            courses: [],
            visibility: {
              fullName: false,
              city: false,
              about: false,
              courses: false,
            },
          });
        });
    });

    it("shows others only the künye and gender until a switch is turned on", async () => {
      await save(ZEYNEP, {
        kunye: "Zeynep Betül Üsküdârî",
        gender: "FEMALE",
        city: "İstanbul",
        about: "Sarf ve nahiv okuyorum.",
      }).expect(200);

      await request(server())
        .get(`/users/${ZEYNEP}/public-profile`)
        .set(as(OMER))
        .expect(200)
        .expect(({ body }) => {
          expect(body).toEqual({
            id: ZEYNEP,
            kunye: "Zeynep Betül Üsküdârî",
            gender: "FEMALE",
          });
        });

      await save(ZEYNEP, { visibility: { city: true } }).expect(200);
      await request(server())
        .get(`/users/${ZEYNEP}/public-profile`)
        .set(as(OMER))
        .expect(200)
        .expect(({ body }) => {
          expect(body.city).toBe("İstanbul");
          expect(body).not.toHaveProperty("about");
          expect(body).not.toHaveProperty("fullName");
        });

      await save(ZEYNEP, { visibility: { city: false } }).expect(200);
      await request(server())
        .get(`/users/${ZEYNEP}/public-profile`)
        .set(as(OMER))
        .expect(200)
        .expect(({ body }) => expect(body).not.toHaveProperty("city"));
    });

    it("keeps the switches after a reload and the owner still reads hidden fields", async () => {
      await save(ZEYNEP, { kunye: "Zeynep", city: "Bursa" }).expect(200);
      await save(ZEYNEP, { visibility: { about: true } }).expect(200);

      await request(server())
        .get("/me/public-profile")
        .set(as(ZEYNEP))
        .expect(200)
        .expect(({ body }) => {
          expect(body.city).toBe("Bursa");
          expect(body.visibility).toEqual({
            fullName: false,
            city: false,
            about: true,
            courses: false,
          });
        });
    });

    it("lists the caller's published courses only while 'courses' is on", async () => {
      const [kosk] = await databaseService.db
        .insert(kosks)
        .values({ ownerId: OMER, name: "Süleymaniye Köşkü" })
        .returning();
      const [published, draft] = await databaseService.db
        .insert(courses)
        .values([
          {
            koskId: kosk.id,
            authorId: OMER,
            title: "Emsile ve Bina",
            status: "PUBLISHED",
          },
          { koskId: kosk.id, authorId: OMER, title: "Taslak", status: "DRAFT" },
        ])
        .returning();
      await databaseService.db.insert(enrollments).values([
        { userId: ZEYNEP, courseId: published.id, status: "ENROLLED" },
        { userId: ZEYNEP, courseId: draft.id, status: "ENROLLED" },
      ]);
      await save(ZEYNEP, { kunye: "Zeynep" }).expect(200);

      await request(server())
        .get(`/users/${ZEYNEP}/public-profile`)
        .set(as(OMER))
        .expect(200)
        .expect(({ body }) => expect(body).not.toHaveProperty("courses"));

      await save(ZEYNEP, { visibility: { courses: true } }).expect(200);
      await request(server())
        .get(`/users/${ZEYNEP}/public-profile`)
        .set(as(OMER))
        .expect(200)
        .expect(({ body }) => expect(body.courses).toEqual(["Emsile ve Bina"]));
    });

    it("shows the full name only while its switch is on, typed name first", async () => {
      await request(server())
        .patch("/me")
        .set(as(ZEYNEP))
        .send({ givenName: "Zeynep Betül", familyName: "Karahanlı" })
        .expect(200);
      await save(ZEYNEP, {
        kunye: "Zeynep",
        visibility: { fullName: true },
      }).expect(200);

      await request(server())
        .get(`/users/${ZEYNEP}/public-profile`)
        .set(as(OMER))
        .expect(200)
        .expect(({ body }) =>
          expect(body.fullName).toBe("Zeynep Betül Karahanlı")
        );
    });

    it("refuses an empty künye and a künye someone else has, in any case", async () => {
      await save(ZEYNEP, { kunye: "  " }).expect(400);
      await save(ZEYNEP, { kunye: "Zeynep" }).expect(200);
      await save(OMER, { kunye: "zeynep" })
        .expect(409)
        .expect(({ body }) =>
          expect(JSON.stringify(body)).toContain("KUNYE_TAKEN")
        );
      // Keeping one's own künye is not a conflict.
      await save(ZEYNEP, { kunye: "Zeynep", city: "Konya" }).expect(200);
    });

    it("refuses an unknown gender and an unknown switch", async () => {
      await save(ZEYNEP, { gender: "OTHER" }).expect(400);
      await save(ZEYNEP, { visibility: { kunye: false } }).expect(400);
    });

    it("answers 404 for a person with no künye and 401 without a token", async () => {
      await request(server())
        .get(`/users/${NOBODY}/public-profile`)
        .set(as(OMER))
        .expect(404);
      await request(server())
        .get(`/users/${ZEYNEP}/public-profile`)
        .expect(401);
      await request(server())
        .get("/users/not-a-uuid/public-profile")
        .set(as(OMER))
        .expect(400);
    });
  });

  describe("POST /kosk-applications", () => {
    const valid = {
      name: "Davutpaşa Köşkü",
      field: "AQEEDAH_KALAM",
      summary: "Akaid ve kelâm metinlerini şerhleriyle okuyan bir köşk.",
      reason: "Davutpaşa'da yüz yüze yürüyen bir akaid halkamız var.",
      email: "omer@example.com",
    };
    const apply = (sub: string, body: Record<string, unknown>) =>
      request(server()).post("/kosk-applications").set(as(sub)).send(body);

    it("records a PENDING application, phone optional", async () => {
      const res = await apply(OMER, valid).expect(201);
      expect(res.body).toEqual({ id: expect.any(String), status: "PENDING" });

      await apply(OMER, { ...valid, phone: "+90 532 000 00 00" }).expect(201);

      const rows = await databaseService.db.execute(
        "select applicant_id, name, field, phone, status from kosk_applications order by created_at"
      );
      expect(rows.rows).toHaveLength(2);
      expect(rows.rows[0]).toMatchObject({
        applicant_id: OMER,
        name: "Davutpaşa Köşkü",
        field: "AQEEDAH_KALAM",
        phone: null,
        status: "PENDING",
      });
      expect(rows.rows[1].phone).toBe("+90 532 000 00 00");
    });

    it("refuses missing required fields, a bad e-mail, a bad phone and an unknown field", async () => {
      for (const missing of ["name", "field", "summary", "reason", "email"]) {
        const body: Record<string, unknown> = { ...valid };
        delete body[missing];
        await apply(OMER, body).expect(400);
      }
      await apply(OMER, { ...valid, name: "   " }).expect(400);
      await apply(OMER, { ...valid, email: "not-an-email" }).expect(400);
      await apply(OMER, { ...valid, phone: "abc" }).expect(400);
      await apply(OMER, { ...valid, field: "ALCHEMY" }).expect(400);
      const rows = await databaseService.db.execute(
        "select count(*)::int as n from kosk_applications"
      );
      expect(rows.rows[0].n).toBe(0);
    });

    it("accepts all eleven fields and needs a token", async () => {
      for (const field of [
        "ARABIC_LANGUAGE_SCIENCES",
        "RHETORIC",
        "FIQH",
        "USUL_AL_FIQH",
        "HADITH",
        "QURAN_SCIENCES",
        "TAFSIR",
        "AQEEDAH_KALAM",
        "SEERAH",
        "LOGIC",
        "OTHER",
      ]) {
        await apply(OMER, { ...valid, field }).expect(201);
      }
      await request(server())
        .post("/kosk-applications")
        .send(valid)
        .expect(401);
    });
  });
});
