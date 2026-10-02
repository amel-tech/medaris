import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import {
  courseMuderris,
  courses,
  courseWeeks,
  enrollments,
  lessons,
} from "../../src/database/schema/course.schema";
import { koskManagers, kosks } from "../../src/database/schema/kosk.schema";
import { asSystemAdmin } from "../helpers/system-admin.helper";
import { createTestApp, TEST_USER_ID } from "../helpers/test-app.helper";
import {
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";

const MISSING_UUID = "00000000-0000-0000-0000-000000000000";

const coursePayload = () => ({
  title: "Bina ve İzhar Şerhi",
  subtitle: "Klasik sarf metni",
  category: "Sarf",
  level: "INTERMEDIATE",
  language: "Türkçe / Arapça",
  coverHue: 145,
  durationWeeks: 10,
  status: "PUBLISHED",
  grantsCertificate: true,
  muderris: [
    { name: "Müderris Ahmed Hilmi", title: "Sarf Müderrisi", avatarHue: 145 },
  ],
  resources: [{ name: "Bina ve İzhar", meta: "PDF · 124 sayfa", type: "pdf" }],
  weeks: [
    {
      weekNumber: 2,
      title: "İkinci Bab",
      lessons: [{ title: "Ölçme", type: "QUIZ" }],
    },
    {
      weekNumber: 1,
      title: "Birinci Bab",
      summary: "Müfredat tanıtımı",
      lessons: [
        {
          title: "Açılış",
          type: "VIDEO",
          durationMinutes: 12,
          isPreview: true,
        },
        {
          title: "Şerh",
          type: "VIDEO",
          durationMinutes: 28,
          kaynak: "Bina · s. 4-9",
        },
      ],
    },
  ],
});

const OTHER_USER_ID = "11111111-1111-1111-1111-111111111111";

describe("CourseController (e2e)", () => {
  let app: INestApplication;
  let adminApp: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let koskId: string;

  beforeAll(async () => {
    app = await createTestApp({ authUserId: TEST_USER_ID });
    adminApp = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES);
    const kosk = await request(adminApp.getHttpServer())
      .post("/kosks")
      .set("Authorization", asSystemAdmin(TEST_USER_ID))
      .send({ name: "Süleymaniye Köşkü" })
      .expect(201);
    koskId = kosk.body.id;
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES);
    await app.close();
    await adminApp.close();
  });

  const createCourse = () =>
    request(app.getHttpServer())
      .post(`/kosks/${koskId}/courses`)
      .send(coursePayload());

  describe("POST /kosks/:koskId/courses", () => {
    it("creates a course with its nested weeks, lessons, müderris and resources", () => {
      return createCourse()
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty("id");
          expect(res.body).toHaveProperty("koskId", koskId);
          expect(res.body).toHaveProperty("authorId", TEST_USER_ID);
          expect(res.body.muderris).toHaveLength(1);
          expect(res.body.resources).toHaveLength(1);
          expect(res.body.weeks).toHaveLength(2);
          // weeks come back ordered by weekNumber
          expect(res.body.weeks[0]).toHaveProperty("weekNumber", 1);
          expect(res.body.weeks[1]).toHaveProperty("weekNumber", 2);
          expect(res.body.weeks[0].lessons).toHaveLength(2);
          expect(res.body.weeks[0].lessons[0]).toHaveProperty(
            "isPreview",
            true
          );
          expect(res.body).toHaveProperty("enrollment", null);
        });
    });

    it("returns 404 when the köşk does not exist", () => {
      return request(app.getHttpServer())
        .post(`/kosks/${MISSING_UUID}/courses`)
        .send(coursePayload())
        .expect(404);
    });

    it("rejects an invalid lesson type", () => {
      const payload = coursePayload();
      payload.weeks[0].lessons[0].type = "BOGUS";
      return request(app.getHttpServer())
        .post(`/kosks/${koskId}/courses`)
        .send(payload)
        .expect(400);
    });

    it("rejects a missing title", () => {
      const payload: Record<string, unknown> = coursePayload();
      delete payload.title;
      return request(app.getHttpServer())
        .post(`/kosks/${koskId}/courses`)
        .send(payload)
        .expect(400);
    });
  });

  describe("GET /kosks/:koskId/courses", () => {
    it("returns course summaries with aggregate counts", async () => {
      await createCourse().expect(201);
      return request(app.getHttpServer())
        .get(`/kosks/${koskId}/courses`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveLength(1);
          const c = res.body[0];
          expect(c).toHaveProperty("weekCount", 2);
          expect(c).toHaveProperty("lessonCount", 3);
          expect(c).toHaveProperty("resourceCount", 1);
          expect(c.muderris).toHaveLength(1);
          expect(c).toHaveProperty("enrollment", null);
        });
    });
  });

  describe("GET /courses/:id", () => {
    it("returns 404 for a missing course", () => {
      return request(app.getHttpServer())
        .get(`/courses/${MISSING_UUID}`)
        .expect(404);
    });

    it("returns the full detail with ordered lessons", async () => {
      const created = await createCourse().expect(201);
      return request(app.getHttpServer())
        .get(`/courses/${created.body.id}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.weeks[0].lessons[0]).toHaveProperty(
            "title",
            "Açılış"
          );
          expect(res.body.weeks[0].lessons[1]).toHaveProperty("title", "Şerh");
        });
    });
  });

  describe("enrollment + progress", () => {
    it("enrolls the talebe and tracks progress, completing at 100%", async () => {
      const created = await createCourse().expect(201);
      const id = created.body.id;

      await request(app.getHttpServer())
        .post(`/courses/${id}/enroll`)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty("userId", TEST_USER_ID);
          expect(res.body).toHaveProperty("progress", 0);
          expect(res.body).toHaveProperty("status", "ENROLLED");
        });

      await request(app.getHttpServer())
        .put(`/courses/${id}/progress`)
        .send({ progress: 35 })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty("progress", 35);
          expect(res.body).toHaveProperty("status", "ENROLLED");
        });

      await request(app.getHttpServer())
        .put(`/courses/${id}/progress`)
        .send({ progress: 100 })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty("status", "COMPLETED");
        });

      // detail reflects the current user's enrollment
      return request(app.getHttpServer())
        .get(`/courses/${id}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.enrollment).toHaveProperty("progress", 100);
          expect(res.body.enrollment).toHaveProperty("status", "COMPLETED");
        });
    });

    it("rejects out-of-range progress", async () => {
      const created = await createCourse().expect(201);
      return request(app.getHttpServer())
        .put(`/courses/${created.body.id}/progress`)
        .send({ progress: 150 })
        .expect(400);
    });
  });

  describe("GET /courses/enrolled", () => {
    it("returns the talebe enrolled courses with köşk name and progress", async () => {
      const created = await createCourse().expect(201);
      const id = created.body.id;

      await request(app.getHttpServer())
        .post(`/courses/${id}/enroll`)
        .expect(201);

      await request(app.getHttpServer())
        .put(`/courses/${id}/progress`)
        .send({ progress: 35 })
        .expect(200);

      return request(app.getHttpServer())
        .get("/courses/enrolled")
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveLength(1);
          const c = res.body[0];
          expect(c).toHaveProperty("id", id);
          expect(c).toHaveProperty("koskName", "Süleymaniye Köşkü");
          expect(c).toHaveProperty("weekCount", 2);
          expect(c).toHaveProperty("lessonCount", 3);
          expect(c.muderris).toHaveLength(1);
          expect(c.enrollment).toHaveProperty("progress", 35);
          expect(c.enrollment).toHaveProperty("status", "ENROLLED");
        });
    });

    it("returns an empty list when the talebe is not enrolled in anything", async () => {
      await createCourse().expect(201);
      return request(app.getHttpServer())
        .get("/courses/enrolled")
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual([]);
        });
    });
  });

  describe("PATCH/DELETE /courses/:id", () => {
    it("updates course-level fields", async () => {
      const created = await createCourse().expect(201);
      return request(app.getHttpServer())
        .patch(`/courses/${created.body.id}`)
        .send({ title: "Yeni Başlık", status: "DRAFT" })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty("title", "Yeni Başlık");
          expect(res.body).toHaveProperty("status", "DRAFT");
          // nested data is preserved
          expect(res.body.weeks).toHaveLength(2);
        });
    });

    it("replaces a course including its curriculum", async () => {
      const created = await createCourse().expect(201);
      const id = created.body.id;

      const payload = coursePayload();
      payload.title = "Güncellenmiş Kurs";
      payload.status = "PUBLISHED";
      payload.muderris = [];
      payload.resources = [];
      payload.weeks = [
        {
          weekNumber: 1,
          title: "Tek Hafta",
          lessons: [{ title: "Yeni Ders", type: "VIDEO", durationMinutes: 20 }],
        },
      ];

      return request(app.getHttpServer())
        .put(`/courses/${id}`)
        .send(payload)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty("title", "Güncellenmiş Kurs");
          expect(res.body).toHaveProperty("status", "PUBLISHED");
          // curriculum fully replaced (was 2 weeks / 1 müderris / 1 resource)
          expect(res.body.weeks).toHaveLength(1);
          expect(res.body.weeks[0].lessons).toHaveLength(1);
          expect(res.body.muderris).toHaveLength(0);
          expect(res.body.resources).toHaveLength(0);
        });
    });

    it("preserves ids of retained weeks and lessons on replace", async () => {
      const created = await createCourse().expect(201);
      const id = created.body.id;
      const detail = (
        await request(app.getHttpServer()).get(`/courses/${id}`).expect(200)
      ).body;
      const week1 = detail.weeks[0];
      const lesson1 = week1.lessons[0];

      const payload = {
        title: detail.title,
        weeks: [
          {
            id: week1.id,
            weekNumber: 1,
            title: "Birinci Bab (düzenlendi)",
            lessons: [
              {
                id: lesson1.id,
                title: "Açılış (düzenlendi)",
                type: lesson1.type,
              },
              { title: "Yeni eklenen ders", type: "VIDEO" },
            ],
          },
        ],
        muderris: detail.muderris.map((m: { id: string; name: string }) => ({
          id: m.id,
          name: m.name,
        })),
        resources: detail.resources.map((r: { id: string; name: string }) => ({
          id: r.id,
          name: r.name,
        })),
      };

      const updated = (
        await request(app.getHttpServer())
          .put(`/courses/${id}`)
          .send(payload)
          .expect(200)
      ).body;

      expect(updated.weeks).toHaveLength(1);
      expect(updated.weeks[0].id).toBe(week1.id); // week id preserved
      expect(updated.weeks[0].title).toBe("Birinci Bab (düzenlendi)");
      expect(updated.weeks[0].lessons).toHaveLength(2); // kept + new
      expect(updated.weeks[0].lessons[0].id).toBe(lesson1.id); // lesson id preserved
      expect(updated.weeks[0].lessons[0].title).toBe("Açılış (düzenlendi)");
      expect(updated.muderris[0].id).toBe(detail.muderris[0].id); // müderris id preserved
    });

    it("returns 404 when replacing a missing course", () => {
      return request(app.getHttpServer())
        .put(`/courses/${MISSING_UUID}`)
        .send(coursePayload())
        .expect(404);
    });

    it("round-trips live-session fields through create, read and replace", async () => {
      const scheduledAt = "2026-08-10T18:00:00.000Z";
      const agenda = [
        { time: "21:00", title: "Açılış ve geçen haftanın özeti" },
        { time: "21:15", title: "Metin müzakeresi" },
      ];
      const payload = {
        ...coursePayload(),
        weeks: [
          {
            weekNumber: 1,
            title: "Birinci Bab",
            lessons: [
              {
                title: "Açılış halkası",
                type: "LIVE",
                durationMinutes: 60,
                scheduledAt,
                meetingUrl: "https://meet.google.com/bqx-mfzn-rde",
                agenda,
              },
            ],
          },
        ],
      };

      const created = (
        await request(app.getHttpServer())
          .post(`/kosks/${koskId}/courses`)
          .send(payload)
          .expect(201)
      ).body;
      const lesson = created.weeks[0].lessons[0];
      expect(new Date(lesson.scheduledAt).toISOString()).toBe(scheduledAt);
      expect(lesson.meetingUrl).toBe("https://meet.google.com/bqx-mfzn-rde");
      expect(lesson.agenda).toEqual(agenda);
      expect(lesson.durationMinutes).toBe(60);
      // The deprecated free-text column is never served (MDRS-110).
      expect(lesson).not.toHaveProperty("duration");
      expect(created.timeZone).toBe("Europe/Istanbul");

      // Replace keeps the lesson row (same id) and updates the live fields.
      const newScheduledAt = "2026-08-17T18:00:00.000Z";
      const replaced = (
        await request(app.getHttpServer())
          .put(`/courses/${created.id}`)
          .send({
            title: created.title,
            weeks: [
              {
                id: created.weeks[0].id,
                weekNumber: 1,
                title: "Birinci Bab",
                lessons: [
                  {
                    id: lesson.id,
                    title: lesson.title,
                    type: "LIVE",
                    scheduledAt: newScheduledAt,
                    meetingUrl: "https://zoom.us/j/8842031567",
                    agenda: [{ time: "21:00", title: "Tek adım" }],
                  },
                ],
              },
            ],
          })
          .expect(200)
      ).body;
      const updatedLesson = replaced.weeks[0].lessons[0];
      expect(updatedLesson.id).toBe(lesson.id);
      expect(new Date(updatedLesson.scheduledAt).toISOString()).toBe(
        newScheduledAt
      );
      expect(updatedLesson.meetingUrl).toBe("https://zoom.us/j/8842031567");
      expect(updatedLesson.agenda).toEqual([
        { time: "21:00", title: "Tek adım" },
      ]);
      // PUT is a full replace: a lesson sent without a length has none.
      expect(updatedLesson.durationMinutes).toBeNull();
    });

    it("rejects a malformed meeting URL", () => {
      const payload = {
        ...coursePayload(),
        weeks: [
          {
            weekNumber: 1,
            title: "Birinci Bab",
            lessons: [
              { title: "Canlı ders", type: "LIVE", meetingUrl: "not-a-url" },
            ],
          },
        ],
      };
      return request(app.getHttpServer())
        .post(`/kosks/${koskId}/courses`)
        .send(payload)
        .expect(400);
    });

    it.each([
      "http://meet.google.com/bqx-mfzn-rde",
      "ftp://meet.google.com/bqx-mfzn-rde",
    ])("rejects %s with a 400 naming the meeting URL field (MDRS-111)", async (meetingUrl) => {
      const payload = {
        ...coursePayload(),
        weeks: [
          {
            weekNumber: 1,
            title: "Birinci Bab",
            lessons: [{ title: "Canlı ders", type: "LIVE", meetingUrl }],
          },
        ],
      };
      const res = await request(app.getHttpServer())
        .post(`/kosks/${koskId}/courses`)
        .send(payload)
        .expect(400);
      expect(res.body.context.errors).toEqual([
        expect.objectContaining({
          property: "weeks.0.lessons.0.meetingUrl",
          constraints: { isUrl: "meetingUrl must be an https:// URL" },
        }),
      ]);
    });

    it("stores a course's time zone and edits it, refusing what is not an IANA zone (MDRS-110)", async () => {
      const created = (
        await request(app.getHttpServer())
          .post(`/kosks/${koskId}/courses`)
          .send({ ...coursePayload(), timeZone: "Europe/Berlin" })
          .expect(201)
      ).body;
      expect(created.timeZone).toBe("Europe/Berlin");

      const patched = (
        await request(app.getHttpServer())
          .patch(`/courses/${created.id}`)
          .send({ timeZone: "America/New_York" })
          .expect(200)
      ).body;
      expect(patched.timeZone).toBe("America/New_York");

      // A PUT that leaves the zone out keeps it.
      const replaced = (
        await request(app.getHttpServer())
          .put(`/courses/${created.id}`)
          .send({ title: created.title })
          .expect(200)
      ).body;
      expect(replaced.timeZone).toBe("America/New_York");

      // Stored in canonical IANA form, whatever spelling Intl accepts.
      const canonical = (
        await request(app.getHttpServer())
          .patch(`/courses/${created.id}`)
          .send({ timeZone: "europe/berlin" })
          .expect(200)
      ).body;
      expect(canonical.timeZone).toBe("Europe/Berlin");
      const alias = (
        await request(app.getHttpServer())
          .post(`/kosks/${koskId}/courses`)
          .send({ ...coursePayload(), timeZone: "Turkey" })
          .expect(201)
      ).body;
      expect(alias.timeZone).toBe("Europe/Istanbul");
      await request(app.getHttpServer())
        .put(`/courses/${created.id}`)
        .send({ title: created.title, timeZone: "America/New_York" })
        .expect(200);

      for (const timeZone of ["Mars/Olympus", null, "", "+03:00"]) {
        await request(app.getHttpServer())
          .patch(`/courses/${created.id}`)
          .send({ timeZone })
          .expect(400);
        await request(app.getHttpServer())
          .put(`/courses/${created.id}`)
          .send({ title: created.title, timeZone })
          .expect(400);
      }
    });

    it("takes a lesson's length as whole minutes only (MDRS-110)", async () => {
      const withLesson = (lesson: Record<string, unknown>) => ({
        ...coursePayload(),
        weeks: [
          {
            weekNumber: 1,
            title: "Birinci Bab",
            lessons: [{ title: "Canlı ders", type: "LIVE", ...lesson }],
          },
        ],
      });
      for (const lesson of [
        { durationMinutes: 0 },
        { durationMinutes: 1441 },
        { durationMinutes: 30.5 },
        { durationMinutes: "60 dk" },
        // The free-text field is gone from the contract.
        { duration: "60 dk" },
      ]) {
        await request(app.getHttpServer())
          .post(`/kosks/${koskId}/courses`)
          .send(withLesson(lesson))
          .expect(400);
      }
      const created = (
        await request(app.getHttpServer())
          .post(`/kosks/${koskId}/courses`)
          .send(withLesson({}))
          .expect(201)
      ).body;
      expect(created.weeks[0].lessons[0].durationMinutes).toBeNull();
    });

    it("refuses the köşk owner's DELETE — only SYSTEM_ADMIN deletes (MDRS-124)", async () => {
      const created = await createCourse().expect(201);
      await request(app.getHttpServer())
        .delete(`/courses/${created.body.id}`)
        .expect(403);

      return request(app.getHttpServer())
        .get(`/courses/${created.body.id}`)
        .expect(200);
    });
  });

  describe("enrollment approval", () => {
    const approvalCourse = () => ({
      ...coursePayload(),
      requiresApproval: true,
    });

    it("holds the enrollment as PENDING and supports the approve flow", async () => {
      const created = await request(app.getHttpServer())
        .post(`/kosks/${koskId}/courses`)
        .send(approvalCourse())
        .expect(201);
      expect(created.body).toHaveProperty("requiresApproval", true);
      const id = created.body.id;

      await request(app.getHttpServer())
        .post(`/courses/${id}/enroll`)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty("status", "PENDING");
          expect(res.body).toHaveProperty("studentName", "test");
        });

      // pending enrollments are hidden from the student's enrolled list
      await request(app.getHttpServer())
        .get("/courses/enrolled")
        .expect(200)
        .expect((res) => expect(res.body).toEqual([]));

      // owner sees the request
      await request(app.getHttpServer())
        .get(`/kosks/${koskId}/enrollments/pending`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveLength(1);
          expect(res.body[0]).toHaveProperty("userId", TEST_USER_ID);
          expect(res.body[0]).toHaveProperty("courseTitle", created.body.title);
          expect(res.body[0]).toHaveProperty("status", "PENDING");
        });

      await request(app.getHttpServer())
        .post(`/courses/${id}/enrollments/${TEST_USER_ID}/approve`)
        .expect(201)
        .expect((res) => expect(res.body).toHaveProperty("status", "ENROLLED"));

      await request(app.getHttpServer())
        .get("/courses/enrolled")
        .expect(200)
        .expect((res) => expect(res.body).toHaveLength(1));

      await request(app.getHttpServer())
        .get(`/kosks/${koskId}/enrollments/pending`)
        .expect(200)
        .expect((res) => expect(res.body).toEqual([]));
    });

    it("rejects a pending enrollment by deleting it", async () => {
      const created = await request(app.getHttpServer())
        .post(`/kosks/${koskId}/courses`)
        .send(approvalCourse())
        .expect(201);
      const id = created.body.id;

      await request(app.getHttpServer())
        .post(`/courses/${id}/enroll`)
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/courses/${id}/enrollments/${TEST_USER_ID}`)
        .expect(200)
        .expect((res) => expect(res.text).toBe("true"));

      await request(app.getHttpServer())
        .get(`/kosks/${koskId}/enrollments/pending`)
        .expect(200)
        .expect((res) => expect(res.body).toEqual([]));
    });

    it("enrolls directly when approval is not required", async () => {
      const created = await createCourse().expect(201);
      return request(app.getHttpServer())
        .post(`/courses/${created.body.id}/enroll`)
        .expect(201)
        .expect((res) => expect(res.body).toHaveProperty("status", "ENROLLED"));
    });

    it("does not let a pending talebe self-promote via progress", async () => {
      const created = await request(app.getHttpServer())
        .post(`/kosks/${koskId}/courses`)
        .send(approvalCourse())
        .expect(201);
      const id = created.body.id;

      await request(app.getHttpServer())
        .post(`/courses/${id}/enroll`)
        .expect(201)
        .expect((res) => expect(res.body).toHaveProperty("status", "PENDING"));

      // recording progress on a pending enrollment must be refused
      await request(app.getHttpServer())
        .put(`/courses/${id}/progress`)
        .send({ progress: 50 })
        .expect(404);

      // the enrollment stays pending — not silently approved
      await request(app.getHttpServer())
        .get(`/kosks/${koskId}/enrollments/pending`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveLength(1);
          expect(res.body[0]).toHaveProperty("status", "PENDING");
        });
    });

    it("refuses progress when the talebe is not enrolled", async () => {
      const created = await createCourse().expect(201);
      return request(app.getHttpServer())
        .put(`/courses/${created.body.id}/progress`)
        .send({ progress: 20 })
        .expect(404);
    });

    it("does not reject an already-approved (active) enrollment", async () => {
      const created = await request(app.getHttpServer())
        .post(`/kosks/${koskId}/courses`)
        .send(approvalCourse())
        .expect(201);
      const id = created.body.id;

      await request(app.getHttpServer())
        .post(`/courses/${id}/enroll`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/courses/${id}/enrollments/${TEST_USER_ID}/approve`)
        .expect(201);

      // reject only applies to pending requests
      await request(app.getHttpServer())
        .delete(`/courses/${id}/enrollments/${TEST_USER_ID}`)
        .expect(404);

      // the active enrollment is untouched
      await request(app.getHttpServer())
        .get("/courses/enrolled")
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveLength(1);
          expect(res.body[0]).toHaveProperty("id", id);
        });
    });

    it("forbids listing pending enrollments for a köşk owned by someone else", async () => {
      const [otherKosk] = await databaseService.db
        .insert(kosks)
        .values({ ownerId: OTHER_USER_ID, name: "Başka Köşk" })
        .returning();
      await databaseService.db.insert(koskManagers).values({
        koskId: otherKosk.id,
        userId: OTHER_USER_ID,
        addedBy: OTHER_USER_ID,
      });
      return request(app.getHttpServer())
        .get(`/kosks/${otherKosk.id}/enrollments/pending`)
        .expect(403);
    });
  });

  describe("ownership", () => {
    it("forbids course mutations on a köşk owned by someone else", async () => {
      // köşk + course owned by a different user, inserted directly
      const [otherKosk] = await databaseService.db
        .insert(kosks)
        .values({ ownerId: OTHER_USER_ID, name: "Başka Köşk" })
        .returning();
      await databaseService.db.insert(koskManagers).values({
        koskId: otherKosk.id,
        userId: OTHER_USER_ID,
        addedBy: OTHER_USER_ID,
      });
      const [otherCourse] = await databaseService.db
        .insert(courses)
        .values({
          koskId: otherKosk.id,
          authorId: OTHER_USER_ID,
          title: "Başka Kurs",
        })
        .returning();

      // create under someone else's köşk
      await request(app.getHttpServer())
        .post(`/kosks/${otherKosk.id}/courses`)
        .send(coursePayload())
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/courses/${otherCourse.id}`)
        .send({ title: "Ele geçirildi" })
        .expect(403);

      await request(app.getHttpServer())
        .put(`/courses/${otherCourse.id}`)
        .send(coursePayload())
        .expect(403);

      await request(app.getHttpServer())
        .delete(`/courses/${otherCourse.id}`)
        .expect(403);
    });

    /**
     * MDRS-43 AC-6, the müderris scenario. It resolves to a NEGATIVE in our
     * schema, and the divergence is worth pinning rather than papering over:
     *
     *   - plan §4.1, transcribed into `MATRIX.course`, gives MUDERRIS `EDIT`,
     *     so `@Authz(SCOPES.EDIT)` on `PATCH /courses/:id` lets a müderris
     *     through the guard;
     *   - `CourseService.assertCourseOwner` then narrows to the parent köşk's
     *     owner, and a müderris who does not own the köşk is refused there.
     *
     * The guard is the outer fence and the service is the inner one, so the
     * effective rule is the stricter of the two and nothing is open that was
     * closed before. What this test records is that the two layers do not yet
     * agree — closing that gap means either widening the service to the matrix
     * or narrowing the matrix, and both are product decisions outside this
     * task. Note also HOW the müderris has to be made: `course_muderris.userId`
     * is nullable, the create DTO never sets it, and there is no assignment
     * endpoint — so MUDERRIS is unreachable through the API today and a direct
     * insert is the only way to reach the row at all.
     */
    it("refuses a müderris who does not own the köşk, though the matrix grants EDIT", async () => {
      const [otherKosk] = await databaseService.db
        .insert(kosks)
        .values({ ownerId: OTHER_USER_ID, name: "Müderris Köşkü" })
        .returning();
      await databaseService.db.insert(koskManagers).values({
        koskId: otherKosk.id,
        userId: OTHER_USER_ID,
        addedBy: OTHER_USER_ID,
      });
      const [course] = await databaseService.db
        .insert(courses)
        .values({
          koskId: otherKosk.id,
          authorId: OTHER_USER_ID,
          title: "Sarf Dersi",
          status: CourseStatus.PUBLISHED,
        })
        .returning();
      await databaseService.db.insert(courseMuderris).values({
        courseId: course.id,
        userId: TEST_USER_ID,
        name: "Müderris Ahmed Hilmi",
      });

      await request(app.getHttpServer())
        .patch(`/courses/${course.id}`)
        .send({ title: "Müderris düzeltti" })
        .expect(403);

      // and the title really did not move
      await request(app.getHttpServer())
        .get(`/courses/${course.id}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.title).toBe("Sarf Dersi");
        });
    });

    it("hides DRAFT courses from non-owners", async () => {
      const [otherKosk] = await databaseService.db
        .insert(kosks)
        .values({ ownerId: OTHER_USER_ID, name: "Başka Köşk" })
        .returning();
      await databaseService.db.insert(koskManagers).values({
        koskId: otherKosk.id,
        userId: OTHER_USER_ID,
        addedBy: OTHER_USER_ID,
      });
      const [draft] = await databaseService.db
        .insert(courses)
        .values({
          koskId: otherKosk.id,
          authorId: OTHER_USER_ID,
          title: "Taslak Kurs",
          status: CourseStatus.DRAFT,
        })
        .returning();
      const [published] = await databaseService.db
        .insert(courses)
        .values({
          koskId: otherKosk.id,
          authorId: OTHER_USER_ID,
          title: "Yayınlanmış Kurs",
          status: CourseStatus.PUBLISHED,
        })
        .returning();

      // detail of a DRAFT course is surfaced as not-found to a non-owner
      await request(app.getHttpServer())
        .get(`/courses/${draft.id}`)
        .expect(404);

      // a PUBLISHED course in the same köşk is still visible
      await request(app.getHttpServer())
        .get(`/courses/${published.id}`)
        .expect(200);

      // summaries omit the DRAFT for a non-owner
      await request(app.getHttpServer())
        .get(`/kosks/${otherKosk.id}/courses`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveLength(1);
          expect(res.body[0]).toHaveProperty("id", published.id);
        });
    });
  });

  describe("syllabus edits keep lesson ids (MDRS-95)", () => {
    type Lesson = { id: string; title: string; type: string; weekId: string };
    type Week = {
      id: string;
      weekNumber: number;
      title: string;
      lessons: Lesson[];
    };
    type Detail = { id: string; title: string; version: number; weeks: Week[] };

    const getDetail = async (id: string): Promise<Detail> =>
      (await request(app.getHttpServer()).get(`/courses/${id}`).expect(200))
        .body;

    /** The PUT body nizam would send for `detail`, with `weeks` as given. */
    const replaceBody = (detail: Detail, weeks: Week[]) => ({
      title: detail.title,
      version: detail.version,
      weeks: weeks.map((w) => ({
        id: w.id,
        weekNumber: w.weekNumber,
        title: w.title,
        lessons: w.lessons.map((l) => ({
          id: l.id,
          title: l.title,
          type: l.type,
        })),
      })),
    });

    const lessonRow = async (id: string) =>
      (
        await databaseService.db
          .select()
          .from(lessons)
          .where(eq(lessons.id, id))
      )[0];

    /** Detail with weeks[0] = week 1 (Açılış, Şerh), weeks[1] = week 2 (Ölçme). */
    const createAndLoad = async (): Promise<Detail> => {
      const created = await createCourse().expect(201);
      return getDetail(created.body.id);
    };

    it("moving a lesson from week 1 to week 2 through PUT keeps its id", async () => {
      const detail = await createAndLoad();
      const [week1, week2] = detail.weeks;
      const moved = week1.lessons[1];

      const updated = (
        await request(app.getHttpServer())
          .put(`/courses/${detail.id}`)
          .send(
            replaceBody(detail, [
              { ...week1, lessons: [week1.lessons[0]] },
              { ...week2, lessons: [...week2.lessons, moved] },
            ])
          )
          .expect(200)
      ).body as Detail;

      expect(updated.version).toBe(detail.version + 1);
      expect(updated.weeks[0].lessons.map((l) => l.id)).toEqual([
        week1.lessons[0].id,
      ]);
      expect(updated.weeks[1].lessons.map((l) => l.id)).toEqual([
        week2.lessons[0].id,
        moved.id,
      ]);
      expect(updated.weeks[1].lessons[1].weekId).toBe(week2.id);
    });

    it("keeps lesson ids when their week is dropped and re-added without an id", async () => {
      const detail = await createAndLoad();
      const [week1, week2] = detail.weeks;

      const body = replaceBody(detail, [week1, week2]);
      // week 2 arrives as a brand-new week carrying its old lesson
      delete (body.weeks[1] as { id?: string }).id;

      const updated = (
        await request(app.getHttpServer())
          .put(`/courses/${detail.id}`)
          .send(body)
          .expect(200)
      ).body as Detail;

      expect(updated.weeks).toHaveLength(2);
      expect(updated.weeks[1].id).not.toBe(week2.id);
      expect(updated.weeks[1].lessons[0].id).toBe(week2.lessons[0].id);

      // the dropped week is archived, not deleted
      const [oldWeek] = await databaseService.db
        .select()
        .from(courseWeeks)
        .where(eq(courseWeeks.id, week2.id));
      expect(oldWeek.archivedAt).not.toBeNull();
    });

    it("archives a lesson missing from the PUT payload instead of deleting it", async () => {
      const detail = await createAndLoad();
      const [week1, week2] = detail.weeks;
      const dropped = week1.lessons[1];

      const updated = (
        await request(app.getHttpServer())
          .put(`/courses/${detail.id}`)
          .send(
            replaceBody(detail, [
              { ...week1, lessons: [week1.lessons[0]] },
              week2,
            ])
          )
          .expect(200)
      ).body as Detail;

      expect(updated.weeks[0].lessons.map((l) => l.id)).toEqual([
        week1.lessons[0].id,
      ]);
      const row = await lessonRow(dropped.id);
      expect(row).toBeDefined();
      expect(row.archivedAt).not.toBeNull();

      // hidden from the summary counts as well
      await request(app.getHttpServer())
        .get(`/kosks/${koskId}/courses`)
        .expect(200)
        .expect((res) => {
          expect(res.body[0]).toHaveProperty("lessonCount", 2);
        });
    });

    it("PATCH /lessons/:id with a new weekId keeps its id", async () => {
      const detail = await createAndLoad();
      const [week1, week2] = detail.weeks;
      const moved = week1.lessons[0];

      const res = await request(app.getHttpServer())
        .patch(`/lessons/${moved.id}`)
        .send({ version: detail.version, weekId: week2.id })
        .expect(200);
      expect(res.body).toHaveProperty("id", moved.id);
      expect(res.body).toHaveProperty("weekId", week2.id);
      expect(res.body).toHaveProperty("courseVersion", detail.version + 1);
      // appended after the lesson already in week 2
      expect(res.body).toHaveProperty("orderIndex", 1);

      const after = await getDetail(detail.id);
      expect(after.weeks[0].lessons.map((l) => l.id)).toEqual([
        week1.lessons[1].id,
      ]);
      expect(after.weeks[1].lessons.map((l) => l.id)).toEqual([
        week2.lessons[0].id,
        moved.id,
      ]);
    });

    it("PATCH /lessons/:id refuses a week of another course", async () => {
      const detail = await createAndLoad();
      const other = await createAndLoad();
      await request(app.getHttpServer())
        .patch(`/lessons/${detail.weeks[0].lessons[0].id}`)
        .send({ version: detail.version, weekId: other.weeks[0].id })
        .expect(404);
    });

    it("PATCH /lessons/:id with a stale version returns 409 and changes nothing", async () => {
      const detail = await createAndLoad();
      const lesson = detail.weeks[0].lessons[0];

      await request(app.getHttpServer())
        .patch(`/lessons/${lesson.id}`)
        .send({ version: detail.version, title: "Birinci düzenleme" })
        .expect(200);
      const res = await request(app.getHttpServer())
        .patch(`/lessons/${lesson.id}`)
        .send({ version: detail.version, title: "Bayat düzenleme" })
        .expect(409);
      expect(res.body).toHaveProperty("code", "COURSE_VERSION_CONFLICT");

      expect((await lessonRow(lesson.id)).title).toBe("Birinci düzenleme");
    });

    it("PATCH /lessons/:id refuses a meeting link that is not https (MDRS-111)", async () => {
      const detail = await createAndLoad();
      const lesson = detail.weeks[0].lessons[0];
      const res = await request(app.getHttpServer())
        .patch(`/lessons/${lesson.id}`)
        .send({
          version: detail.version,
          meetingUrl: "http://zoom.us/j/8842031567",
        })
        .expect(400);
      expect(res.body.context.errors[0]).toHaveProperty(
        "property",
        "meetingUrl"
      );
      expect((await lessonRow(lesson.id)).meetingUrl).toBeNull();
    });

    it("PATCH /lessons/:id answers 400, not 500, to null on a required field", async () => {
      const detail = await createAndLoad();
      const lesson = detail.weeks[0].lessons[0];
      for (const field of [
        "title",
        "type",
        "isPreview",
        "weekId",
        "orderIndex",
      ]) {
        await request(app.getHttpServer())
          .patch(`/lessons/${lesson.id}`)
          .send({ version: detail.version, [field]: null })
          .expect(400);
      }
      expect((await lessonRow(lesson.id)).title).toBe(lesson.title);
    });

    it("two PUTs from the same stale snapshot: the second is 409 and keeps the first one's lessons", async () => {
      const detail = await createAndLoad();
      const [week1, week2] = detail.weeks;

      // editor A adds a session to week 2
      const first = (
        await request(app.getHttpServer())
          .put(`/courses/${detail.id}`)
          .send({
            ...replaceBody(detail, [week1, week2]),
            weeks: replaceBody(detail, [week1, week2]).weeks.map((w, i) =>
              i === 1
                ? {
                    ...w,
                    lessons: [
                      ...w.lessons,
                      { id: undefined, title: "A'nın dersi", type: "LIVE" },
                    ],
                  }
                : w
            ),
          })
          .expect(200)
      ).body as Detail;
      const created = first.weeks[1].lessons.find(
        (l) => l.title === "A'nın dersi"
      );
      expect(created).toBeDefined();

      // editor B saves the form it loaded before A's save
      const res = await request(app.getHttpServer())
        .put(`/courses/${detail.id}`)
        .send({
          ...replaceBody(detail, [week1, week2]),
          title: "B'nin başlığı",
        })
        .expect(409);
      expect(res.body).toHaveProperty("code", "COURSE_VERSION_CONFLICT");

      const after = await getDetail(detail.id);
      expect(after.title).toBe(detail.title);
      expect(after.version).toBe(first.version);
      expect(after.weeks[1].lessons.map((l) => l.id)).toContain(created?.id);
      expect((await lessonRow(created?.id as string)).archivedAt).toBeNull();
    });

    it("a PUT loaded before a session-level write is refused", async () => {
      const detail = await createAndLoad();
      const week2 = detail.weeks[1];

      const added = await request(app.getHttpServer())
        .post(`/courses/${detail.id}/weeks/${week2.id}/lessons`)
        .send({ title: "Yeni oturum", type: "LIVE" })
        .expect(201);
      expect(added.body).toHaveProperty("weekId", week2.id);
      expect(added.body).toHaveProperty("orderIndex", 1);
      expect(added.body).toHaveProperty("courseVersion", detail.version + 1);

      await request(app.getHttpServer())
        .put(`/courses/${detail.id}`)
        .send(replaceBody(detail, detail.weeks))
        .expect(409);
      expect((await lessonRow(added.body.id)).archivedAt).toBeNull();
    });

    it("DELETE /lessons/:id archives the lesson", async () => {
      const detail = await createAndLoad();
      const lesson = detail.weeks[0].lessons[0];

      const res = await request(app.getHttpServer())
        .delete(`/lessons/${lesson.id}`)
        .expect(200);
      expect(res.body).toHaveProperty("courseVersion", detail.version + 1);

      const after = await getDetail(detail.id);
      expect(after.weeks[0].lessons.map((l) => l.id)).not.toContain(lesson.id);
      expect((await lessonRow(lesson.id)).archivedAt).not.toBeNull();

      // an archived lesson can no longer be edited or archived again
      await request(app.getHttpServer())
        .delete(`/lessons/${lesson.id}`)
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/lessons/${lesson.id}`)
        .send({ version: after.version, title: "Geri dönmez" })
        .expect(404);
    });

    it("returns 404 for a malformed or unknown lesson id", async () => {
      await request(app.getHttpServer())
        .patch("/lessons/not-a-uuid")
        .send({ version: 0 })
        .expect(404);
      await request(app.getHttpServer())
        .delete(`/lessons/${MISSING_UUID}`)
        .expect(404);
    });

    it("answers 403 from all three endpoints to a caller without EDIT on the course", async () => {
      const [otherKosk] = await databaseService.db
        .insert(kosks)
        .values({ ownerId: OTHER_USER_ID, name: "Başka Köşk" })
        .returning();
      await databaseService.db.insert(koskManagers).values({
        koskId: otherKosk.id,
        userId: OTHER_USER_ID,
        addedBy: OTHER_USER_ID,
      });
      const [otherCourse] = await databaseService.db
        .insert(courses)
        .values({
          koskId: otherKosk.id,
          authorId: OTHER_USER_ID,
          title: "Başka Kurs",
          status: CourseStatus.PUBLISHED,
        })
        .returning();
      const [week] = await databaseService.db
        .insert(courseWeeks)
        .values({ courseId: otherCourse.id, weekNumber: 1, title: "Hafta" })
        .returning();
      const [lesson] = await databaseService.db
        .insert(lessons)
        .values({ weekId: week.id, title: "Ders", type: "LIVE" })
        .returning();

      const expectAllForbidden = async () => {
        await request(app.getHttpServer())
          .post(`/courses/${otherCourse.id}/weeks/${week.id}/lessons`)
          .send({ title: "Sızma", type: "LIVE" })
          .expect(403);
        await request(app.getHttpServer())
          .patch(`/lessons/${lesson.id}`)
          .send({ version: 0, title: "Sızma" })
          .expect(403);
        await request(app.getHttpServer())
          .delete(`/lessons/${lesson.id}`)
          .expect(403);
      };

      // no relationship to the course at all
      await expectAllForbidden();

      // an enrolled talebe may view the course but not edit it
      await databaseService.db
        .insert(enrollments)
        .values({ userId: TEST_USER_ID, courseId: otherCourse.id });
      await expectAllForbidden();

      const row = await lessonRow(lesson.id);
      expect(row.title).toBe("Ders");
      expect(row.archivedAt).toBeNull();
      const weekLessons = await databaseService.db
        .select()
        .from(lessons)
        .where(eq(lessons.weekId, week.id));
      expect(weekLessons).toHaveLength(1);
    });
  });
});
