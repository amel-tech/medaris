import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { courses, enrollments } from "../../src/database/schema/course.schema";
import { decks } from "../../src/database/schema/flashcard-deck.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { madrasahs } from "../../src/database/schema/madrasah.schema";
import { ASSIGNED_ROLES } from "../../src/database/schema/role-assignment.schema";
import { users } from "../../src/database/schema/user.schema";
import {
  recordStatements,
  summariseStatements,
} from "../helpers/statement-counter";
import { createTestApp } from "../helpers/test-app.helper";
import { assignRole } from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-46, the first deliverable: how many statements one request costs, on a
 * fixed dataset, before anything is cached. The numbers this prints are the
 * "before" of the issue's first acceptance criterion; the cache work and the
 * issues that change the loader's inputs (MDRS-47) run this spec again for the
 * "after", so it asserts that a measurement is trustworthy and prints it, and
 * does not pin a count: a count pinned here would turn every later change to a
 * list query into a red test that says nothing about authorization.
 *
 * The table is one `console.log` at the end of the file.
 *
 *   cd apps/tedrisat && ./node_modules/.bin/vitest run test/e2e/authz-query-count.e2e.spec.ts
 */
const NAZIM_ID = "46000000-0000-4000-8000-000000000001";
const HEAD_ID = "46000000-0000-4000-8000-000000000002";
const TALEBE_ID = "46000000-0000-4000-8000-000000000003";
const OUTSIDER_ID = "46000000-0000-4000-8000-000000000004";
const AUTHOR_ID = "46000000-0000-4000-8000-000000000005";

const COURSES_IN_KOSK = 30;
const ENROLLED_IN = 10;
const RUNS = 50;

interface Scenario {
  name: string;
  caller: string;
  /** Built once the dataset exists, so a route can name a row's id. */
  path: () => string;
}

interface Measured {
  name: string;
  firstRequest: number;
  /** What the first request sent that the steady ones did not, in words. */
  firstExtra: string;
  statements: number;
  summary: string;
  medianMs: number;
  p95Ms: number;
}

const percentile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];

/** The statements of `first` that `steady` does not account for, summarised. */
function surplus(first: string[], steady: string[]): string {
  const left = [...steady];
  const extra: string[] = [];
  for (const text of first) {
    const at = left.indexOf(text);
    if (at === -1) {
      extra.push(text);
    } else {
      left.splice(at, 1);
    }
  }
  return summariseStatements(extra);
}

describe("What an authorization decision costs per request (MDRS-46, measurement)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let koskId: string;
  let madrasahId: string;
  let enrolledCourseId: string;
  let privateDeckId: string;
  let publicDeckId: string;
  const measured: Measured[] = [];
  let throttleLimitBefore: string | undefined;

  const db = () => databaseService.db;
  const get = (caller: string, path: string) =>
    request(app.getHttpServer())
      .get(path)
      .set("Authorization", bearerFor({ sub: caller }));

  beforeAll(async () => {
    // 50 runs of one route is far past the shared 100-a-minute budget once
    // three callers share a route; the throttler is not what is measured.
    throttleLimitBefore = process.env.THROTTLE_LIMIT;
    process.env.THROTTLE_LIMIT = "1000000";
    app = await createTestApp();
    databaseService = app.get(DatabaseService);

    await db()
      .insert(users)
      .values(
        [NAZIM_ID, HEAD_ID, TALEBE_ID, OUTSIDER_ID, AUTHOR_ID].map((id) => ({
          id,
        }))
      );
    const [madrasah] = await db()
      .insert(madrasahs)
      .values({
        handle: "suleymaniye",
        name: "Süleymaniye",
        createdBy: HEAD_ID,
      })
      .returning();
    madrasahId = madrasah.id;
    const [kosk] = await db()
      .insert(kosks)
      .values({ ownerId: NAZIM_ID, name: "Nûruosmaniye Köşkü" })
      .returning();
    koskId = kosk.id;

    // Thirty published courses of one köşk, all of them its medrese's: the
    // list routes return a full shelf, and a course decision walks the
    // longest chain (course, medrese, köşk, platform).
    const rows = await db()
      .insert(courses)
      .values(
        Array.from({ length: COURSES_IN_KOSK }, (_, i) => ({
          koskId,
          authorId: NAZIM_ID,
          title: `Ders ${String(i + 1).padStart(2, "0")}`,
          madrasahId,
          status: CourseStatus.PUBLISHED,
        }))
      )
      .returning();
    enrolledCourseId = rows[0].id;
    await db()
      .insert(enrollments)
      .values(
        rows.slice(0, ENROLLED_IN).map((course) => ({
          userId: TALEBE_ID,
          courseId: course.id,
          status: EnrollmentStatus.ENROLLED,
        }))
      );

    await assignRole(db(), {
      userId: NAZIM_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskId,
    });
    await assignRole(db(), {
      userId: HEAD_ID,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: madrasahId,
    });

    const [privateDeck, publicDeck] = await db()
      .insert(decks)
      .values([
        { authorId: AUTHOR_ID, title: "Kendi destem" },
        { authorId: AUTHOR_ID, title: "Herkese açık deste", isPublic: true },
      ])
      .returning();
    privateDeckId = privateDeck.id;
    publicDeckId = publicDeck.id;
  });

  afterAll(async () => {
    if (throttleLimitBefore === undefined) {
      delete process.env.THROTTLE_LIMIT;
    } else {
      process.env.THROTTLE_LIMIT = throttleLimitBefore;
    }
    await app.close();

    const rows = measured.map(
      (m) =>
        `| ${m.name} | ${m.firstRequest} | ${m.statements} | ${m.medianMs.toFixed(1)} | ${m.p95Ms.toFixed(1)} |`
    );
    console.log(
      [
        `Statements per request, ${RUNS} runs each after one first request (${COURSES_IN_KOSK} courses in the köşk, ${ENROLLED_IN} of them enrolled by the talebe)`,
        "| request | first | per request | median ms | p95 ms |",
        "| --- | --- | --- | --- | --- |",
        ...rows,
        "",
        ...measured.map((m) => `${m.name}: ${m.summary}`),
        "",
        ...measured
          .filter((m) => m.firstExtra)
          .map((m) => `${m.name}, first request only: ${m.firstExtra}`),
      ].join("\n")
    );
  });

  describe("the counter itself", () => {
    it("counts a statement once, whether it goes through the pool or a transaction, and nothing outside the window", async () => {
      // Pins what the helper's doc claims, against a real connection: a pool
      // query is ONE statement (Pool.query delegates to Client.query), a
      // transaction is begin + its statements + commit, and statements sent
      // before or after the window are not in it.
      await db().execute("select 1");
      const pooled = await recordStatements(() => db().execute("select 1"));
      expect(pooled.statements).toEqual(["select 1"]);

      const transaction = await recordStatements(() =>
        db().transaction(async (tx) => {
          await tx.execute("select 1");
          await tx.execute("select 2");
        })
      );
      expect(transaction.statements).toEqual([
        "begin",
        "select 1",
        "select 2",
        "commit",
      ]);

      await db().execute("select 3");
      expect(pooled.statements).toHaveLength(1);
    });

    it("sees nothing for a request that never reaches the database, so a count is the route's and not the harness's", async () => {
      const { result, statements } = await recordStatements(() =>
        request(app.getHttpServer()).get("/").set("Accept", "text/plain")
      );
      expect(result.status).toBeLessThan(500);
      expect(statements).toEqual([]);
    });
  });

  const scenarios: Scenario[] = [
    {
      name: "GET /kosks/:koskId/courses, enrolled talebe",
      caller: TALEBE_ID,
      path: () => `/kosks/${koskId}/courses`,
    },
    {
      name: "GET /kosks/:koskId/courses, köşk nazımı",
      caller: NAZIM_ID,
      path: () => `/kosks/${koskId}/courses`,
    },
    {
      name: "GET /kosks/:koskId/courses, signed-in outsider",
      caller: OUTSIDER_ID,
      path: () => `/kosks/${koskId}/courses`,
    },
    {
      name: "GET /madrasahs/:id/courses, başmüderris",
      caller: HEAD_ID,
      path: () => `/madrasahs/${madrasahId}/courses`,
    },
    {
      name: "GET /courses/:id, enrolled talebe (two decisions)",
      caller: TALEBE_ID,
      path: () => `/courses/${enrolledCourseId}`,
    },
    {
      name: "GET /courses/:id, signed-in outsider (two decisions)",
      caller: OUTSIDER_ID,
      path: () => `/courses/${enrolledCourseId}`,
    },
    {
      name: "GET /courses/:id, köşk nazımı (two decisions)",
      caller: NAZIM_ID,
      path: () => `/courses/${enrolledCourseId}`,
    },
    {
      name: "GET /flashcard/decks/:id, the author's private deck",
      caller: AUTHOR_ID,
      path: () => `/flashcard/decks/${privateDeckId}`,
    },
    {
      name: "GET /flashcard/decks/:id, a public deck, signed-in outsider",
      caller: OUTSIDER_ID,
      path: () => `/flashcard/decks/${publicDeckId}`,
    },
  ];

  describe.each(scenarios)("$name", (scenario) => {
    it(`answers 200 and costs the same number of statements on each of ${RUNS} runs`, async () => {
      // The first request of a caller also pays what a later one does not
      // (the user row's sync, a cold plan cache); it is reported apart and
      // the runs that follow are the steady cost.
      const first = await recordStatements(() =>
        get(scenario.caller, scenario.path())
      );
      expect(first.result.status).toBe(200);

      const counts: number[] = [];
      const durations: number[] = [];
      let summary = "";
      let steady: string[] = [];
      for (let run = 0; run < RUNS; run++) {
        const started = performance.now();
        const { result, statements } = await recordStatements(() =>
          get(scenario.caller, scenario.path())
        );
        durations.push(performance.now() - started);
        // A refusal costs a different number of statements than an answer;
        // measuring one would be measuring another route.
        expect(result.status).toBe(200);
        counts.push(statements.length);
        if (run === 0) {
          summary = summariseStatements(statements);
          steady = statements;
        }
      }

      expect(counts[0]).toBeGreaterThan(0);
      expect(new Set(counts).size).toBe(1);

      const sorted = [...durations].sort((a, b) => a - b);
      measured.push({
        name: scenario.name,
        firstRequest: first.statements.length,
        firstExtra: surplus(first.statements, steady),
        statements: counts[0],
        summary,
        medianMs: percentile(sorted, 0.5),
        p95Ms: percentile(sorted, 0.95),
      });
    });
  });
});
