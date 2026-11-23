import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { madrasahs } from "../../src/database/schema/madrasah.schema";
import { madrasahZerothOptions } from "../../src/database/schema/online-exam.schema";
import { ASSIGNED_ROLES } from "../../src/database/schema/role-assignment.schema";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-299: a medrese's zeroth question on Medrese ayarları, one per medrese
 * and asked before every exam of its courses (the owner, 22 Nov 2026). Read
 * and saved with `madrasah.settings_edit`, which the başmüderris holds.
 */
const ADMIN_ID = "d4990000-0000-4000-8000-000000000001";
const HEAD_ID = "d4990000-0000-4000-8000-000000000002";
const OTHER_HEAD_ID = "d4990000-0000-4000-8000-000000000003";
const STRANGER_ID = "d4990000-0000-4000-8000-000000000004";
const UNKNOWN_ID = "d4990000-0000-4000-8000-00000000ffff";

describe("a medrese's zeroth question (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let madrasahId: string;
  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const auth = (sub: string) => bearerFor({ sub, claims: {} });
  const path = (id = madrasahId) => `/madrasahs/${id}/exam-zeroth-question`;
  const get = (sub = HEAD_ID, id = madrasahId) =>
    http().get(path(id)).set("Authorization", auth(sub));
  const put = (body: object, sub = HEAD_ID, id = madrasahId) =>
    http().put(path(id)).set("Authorization", auth(sub)).send(body);
  const audits = () =>
    db()
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, "madrasah.zeroth_question.update"),
          eq(auditLog.entityId, madrasahId)
        )
      );

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "madrasahs", "audit_log");
    const [madrasah, other] = await db()
      .insert(madrasahs)
      .values([
        { handle: "suleymaniye", name: "Süleymaniye", createdBy: ADMIN_ID },
        { handle: "fatih", name: "Fatih", createdBy: ADMIN_ID },
      ])
      .returning();
    madrasahId = madrasah.id;
    await assignRole(db(), {
      userId: HEAD_ID,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: madrasahId,
      grantedBy: ADMIN_ID,
    });
    await assignRole(db(), {
      userId: OTHER_HEAD_ID,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: other.id,
      grantedBy: ADMIN_ID,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("reads empty until the first save, and is the medrese's nazırs' alone", async () => {
    expect((await get().expect(200)).body).toEqual({
      text: "",
      options: [],
      updatedAt: null,
    });
    for (const sub of [STRANGER_ID, OTHER_HEAD_ID]) {
      await get(sub).expect(403);
      await put({ text: "Soru", options: ["Evet", "Hayır"] }, sub).expect(403);
    }
    expect((await get(HEAD_ID, UNKNOWN_ID).expect(404)).body.code).toBe(
      "MADRASAH_NOT_FOUND"
    );
    await get(HEAD_ID, "not-a-uuid").expect(404);
  });

  it("saves the question, replaces its options and writes one audit row per change", async () => {
    const first = await put({
      text: "Bu hadisi sınavda gözetecek misin?",
      options: ["Evet", "Hayır", "Emin değilim"],
    }).expect(200);
    expect(first.body).toMatchObject({
      text: "Bu hadisi sınavda gözetecek misin?",
      options: ["Evet", "Hayır", "Emin değilim"],
    });
    expect(first.body.updatedAt).toEqual(expect.any(String));

    await put({
      text: "Bu hadisi sınavda gözetecek misin?",
      options: ["Hayır", "Evet"],
    }).expect(200);
    expect((await get().expect(200)).body.options).toEqual(["Hayır", "Evet"]);
    expect(
      await db()
        .select()
        .from(madrasahZerothOptions)
        .where(eq(madrasahZerothOptions.madrasahId, madrasahId))
    ).toHaveLength(2);

    // The same again changes nothing and writes nothing.
    await put({
      text: "Bu hadisi sınavda gözetecek misin?",
      options: ["Hayır", "Evet"],
    }).expect(200);
    const rows = await audits();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.actorId)).toEqual([HEAD_ID, HEAD_ID]);
    expect(rows.map((r) => r.details)).toEqual(
      expect.arrayContaining([
        {
          before: null,
          after: {
            text: "Bu hadisi sınavda gözetecek misin?",
            options: ["Evet", "Hayır", "Emin değilim"],
          },
        },
      ])
    );
  });

  it("refuses a question without two different options", async () => {
    for (const body of [
      { text: "", options: ["Evet", "Hayır"] },
      { text: "Soru", options: ["Evet"] },
      { text: "Soru", options: ["Evet", "Evet"] },
    ]) {
      expect((await put(body).expect(400)).body.code).toBe("VALIDATION_ERROR");
    }
    expect(await audits()).toHaveLength(0);
  });

  it("goes with its medrese", async () => {
    await put({ text: "Soru", options: ["Evet", "Hayır"] }).expect(200);
    await db().delete(madrasahs).where(eq(madrasahs.id, madrasahId));
    expect(
      await db()
        .select()
        .from(madrasahZerothOptions)
        .where(eq(madrasahZerothOptions.madrasahId, madrasahId))
    ).toEqual([]);
  });
});
