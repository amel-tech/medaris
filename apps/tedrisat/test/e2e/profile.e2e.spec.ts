import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { vi } from "vitest";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { courses, enrollments } from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { users } from "../../src/database/schema/user.schema";
import { userProfiles } from "../../src/database/schema/user-profile.schema";
import {
  GENDER_CHANGE_ACTION,
  UserProfileRepository,
} from "../../src/user/user-profile.repository";
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
    // The public profile is hidden by default (MDRS-141); these cases test the
    // routes themselves, so they run with the switch on. The hidden answer has
    // its own spec, public-profile-hidden.e2e.spec.ts.
    process.env.PUBLIC_PROFILE_ENABLED = "true";
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
    delete process.env.PUBLIC_PROFILE_ENABLED;
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

    it("leaves the settings alone when the name write fails: one request, one outcome", async () => {
      await request(server())
        .patch("/me")
        .set(as(ZEYNEP))
        .send({ timeZone: "Europe/Berlin" })
        .expect(200);

      const upsert = vi
        .spyOn(app.get(UserProfileRepository), "upsert")
        .mockRejectedValueOnce(new Error("connection reset"));
      try {
        await request(server())
          .patch("/me")
          .set(as(ZEYNEP))
          .send({
            timeZone: "America/New_York",
            locale: "en",
            givenName: "Zeynep Betül",
          })
          .expect(500);
        expect(upsert).toHaveBeenCalledTimes(1);
      } finally {
        upsert.mockRestore();
      }

      const [row] = await databaseService.db.select().from(users);
      expect(row.timeZone).toBe("Europe/Berlin");
      expect(row.locale).not.toBe("en");
      await request(server())
        .get("/me")
        .set(as(ZEYNEP))
        .expect(200)
        .expect(({ body }) => {
          expect(body.timeZone).toBe("Europe/Berlin");
          expect(body.givenName).toBe("Zeynep");
        });
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

  /**
   * #317: Keycloak is the one source of a person's gender. The token's
   * `gender` claim is the caller's own; `user_profiles.gender` mirrors it for
   * everyone else's view, and the profile API no longer writes it. Each case
   * signs in as a person of its own: `UserSyncService` remembers who it has
   * synced for the life of the app, and would skip a person an earlier case
   * already brought in with the same claims.
   */
  describe("gender from the account (#317)", () => {
    const withGender = (sub: string, gender?: string) =>
      bearerFor({
        sub,
        claims: {
          email: `${sub.slice(0, 8)}@example.com`,
          given_name: "Ayşe",
          family_name: "Hesap",
          ...(gender ? { gender } : {}),
        },
      });
    const mirrorOf = async (sub: string) => {
      const [row] = await databaseService.db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, sub));
      return row ?? null;
    };
    const genderAudits = () =>
      databaseService.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, GENDER_CHANGE_ACTION));
    const PAST = new Date("2026-01-01T00:00:00Z");

    beforeEach(async () => {
      await dbUtils.cleanTables("audit_log");
    });

    it("fills the mirror of a person who had no profile row, without an audit row", async () => {
      const sub = randomUUID();
      await request(server())
        .get("/me")
        .set({ Authorization: withGender(sub, "FEMALE") })
        .expect(200);

      expect((await mirrorOf(sub))?.gender).toBe("FEMALE");
      expect(await genderAudits()).toEqual([]);
    });

    it("overwrites another stored gender, records it, and others read the new one", async () => {
      const sub = randomUUID();
      await databaseService.db.insert(userProfiles).values({
        userId: sub,
        kunye: `Hesap ${sub.slice(0, 8)}`,
        gender: "MALE",
      });

      await request(server())
        .get("/me")
        .set({ Authorization: withGender(sub, "FEMALE") })
        .expect(200);

      expect((await mirrorOf(sub))?.gender).toBe("FEMALE");
      const audits = await genderAudits();
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        actorId: sub,
        entity: "user",
        entityId: sub,
        details: { from: "MALE", to: "FEMALE", source: "account" },
      });

      // Everyone else reads the mirror.
      await request(server())
        .get(`/users/${sub}/public-profile`)
        .set(as(OMER))
        .expect(200)
        .expect(({ body }) => expect(body.gender).toBe("FEMALE"));
    });

    it("writes nothing when the mirror already says what the account says", async () => {
      const sub = randomUUID();
      await databaseService.db
        .insert(userProfiles)
        .values({ userId: sub, gender: "MALE", updatedAt: PAST });

      await request(server())
        .get("/me")
        .set({ Authorization: withGender(sub, "MALE") })
        .expect(200);

      const row = await mirrorOf(sub);
      expect(row?.gender).toBe("MALE");
      expect(row?.updatedAt.toISOString()).toBe(PAST.toISOString());
      expect(await genderAudits()).toEqual([]);
    });

    it("leaves the mirror alone when the token carries no gender, as before #317", async () => {
      const sub = randomUUID();
      await databaseService.db
        .insert(userProfiles)
        .values({ userId: sub, gender: "MALE", updatedAt: PAST });

      await request(server())
        .get("/me")
        .set({ Authorization: withGender(sub) })
        .expect(200);

      const row = await mirrorOf(sub);
      expect(row?.gender).toBe("MALE");
      expect(row?.updatedAt.toISOString()).toBe(PAST.toISOString());
      expect(await genderAudits()).toEqual([]);
    });

    it("gives the caller the account's gender and says the account holds it", async () => {
      const sub = randomUUID();
      await request(server())
        .get("/me/public-profile")
        .set({ Authorization: withGender(sub, "MALE") })
        .expect(200)
        .expect(({ body }) => {
          expect(body.gender).toBe("MALE");
          expect(body.genderManagedByAccount).toBe(true);
        });

      const other = randomUUID();
      await databaseService.db
        .insert(userProfiles)
        .values({ userId: other, gender: "FEMALE" });
      await request(server())
        .get("/me/public-profile")
        .set({ Authorization: withGender(other) })
        .expect(200)
        .expect(({ body }) => {
          expect(body.gender).toBe("FEMALE");
          expect(body.genderManagedByAccount).toBe(false);
        });
    });

    it("refuses a gender change when the token carries a gender, and saves nothing of the request", async () => {
      const sub = randomUUID();
      const bearer = { Authorization: withGender(sub, "FEMALE") };

      await request(server())
        .patch("/me/public-profile")
        .set(bearer)
        .send({ kunye: "Ayşe Hesap", city: "Konya", gender: "MALE" })
        .expect(409)
        .expect(({ body }) =>
          expect(body.code).toBe("GENDER_MANAGED_BY_ACCOUNT")
        );
      await request(server())
        .patch("/me/public-profile")
        .set(bearer)
        .send({ gender: null })
        .expect(409);

      const row = await mirrorOf(sub);
      expect(row?.gender).toBe("FEMALE");
      expect(row?.kunye).toBeNull();
      expect(row?.city).toBeNull();
    });

    it("takes the other fields with the account's own gender, or with none", async () => {
      const sub = randomUUID();
      const bearer = { Authorization: withGender(sub, "FEMALE") };

      await request(server())
        .patch("/me/public-profile")
        .set(bearer)
        .send({ kunye: "Ayşe Hesap", gender: "FEMALE" })
        .expect(200)
        .expect(({ body }) => {
          expect(body.kunye).toBe("Ayşe Hesap");
          expect(body.gender).toBe("FEMALE");
        });
      await request(server())
        .patch("/me/public-profile")
        .set(bearer)
        .send({ city: "Konya" })
        .expect(200);

      expect(await mirrorOf(sub)).toMatchObject({
        kunye: "Ayşe Hesap",
        city: "Konya",
        gender: "FEMALE",
      });
    });

    it("still takes a gender from the profile API when the token carries none", async () => {
      const sub = randomUUID();
      await request(server())
        .patch("/me/public-profile")
        .set({ Authorization: withGender(sub) })
        .send({ kunye: "Ayşe Hesap", gender: "MALE" })
        .expect(200)
        .expect(({ body }) => {
          expect(body.gender).toBe("MALE");
          expect(body.genderManagedByAccount).toBe(false);
        });
      expect((await mirrorOf(sub))?.gender).toBe("MALE");
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
