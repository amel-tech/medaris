import { randomUUID } from "node:crypto";
import pg from "pg";
import { account, canSignIn, directGrant, expect, test } from "./accounts";
import { type EvaluationFixture, seedEvaluation } from "./evaluation-seed";

/**
 * "Ara sınav" (MDRS-248) against the running app and API with real Keycloak
 * sign-ins. The müderris (E2E_MUDERRIS_*) plans an exam on "Celse planla"
 * with "Sınav", enters scores on Değerlendirme (a score above "tam puan" is
 * refused, Enter saves and moves down) and opens the results; the talebe
 * (E2E_TALEBE_*) reads no score before that and their own after. Seeded on
 * top of the Değerlendirme fixture: one held exam in a week of its own.
 */
const MUDERRIS = account("MUDERRIS");
const DERS_NAZIR = account("DERS_NAZIR");
const TALEBE = account("TALEBE");
const API = process.env.E2E_TEDRISAT_URL ?? "http://localhost:3001";
const desktop = { width: 1440, height: 900 };

let fixture: EvaluationFixture | undefined;
let client: pg.Client | undefined;
const exam = {
  weekId: randomUUID(),
  lessonId: randomUUID(),
  title: "Ara sınav",
};

test.beforeAll(async () => {
  if (!MUDERRIS.sub || !DERS_NAZIR.sub || !TALEBE.sub) return;
  fixture = await seedEvaluation({
    muderris: MUDERRIS.sub,
    dersNazir: DERS_NAZIR.sub,
    talebe: TALEBE.sub,
  });
  client = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL });
  await client.connect();
  await client.query(
    "insert into course_weeks(id, course_id, week_number, title) values ($1, $2, 2, 'Sınav')",
    [exam.weekId, fixture.courseId]
  );
  await client.query(
    "insert into lessons(id, week_id, title, type, order_index, scheduled_at) values ($1, $2, $3, 'LIVE', 0, now() - interval '2 hours')",
    [exam.lessonId, exam.weekId, exam.title]
  );
  await client.query("insert into lesson_exams(lesson_id) values ($1)", [
    exam.lessonId,
  ]);
});

test.afterAll(async () => {
  if (client && fixture) {
    const lessons = `select l.id from lessons l join course_weeks w on w.id = l.week_id where w.course_id = $1`;
    await client.query(
      `delete from exam_results where exam_id in (select id from lesson_exams where lesson_id in (${lessons}))`,
      [fixture.courseId]
    );
    await client.query(
      `delete from lesson_exams where lesson_id in (${lessons})`,
      [fixture.courseId]
    );
    await client.query(
      "delete from lessons where week_id in (select id from course_weeks where course_id = $1 and week_number <> 1)",
      [fixture.courseId]
    );
    await client.query(
      "delete from course_weeks where course_id = $1 and week_number <> 1",
      [fixture.courseId]
    );
    await client.end();
  }
  await fixture?.remove();
});

const seeded = () =>
  Boolean(fixture) && canSignIn(MUDERRIS) && canSignIn(TALEBE);

const myGrades = async () => {
  const token = (await directGrant(TALEBE)).access_token;
  const res = await fetch(`${API}/courses/${fixture?.courseId}/my-grades`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return (await res.json()) as {
    exams: { lessonId: string; released: boolean; score: number | null }[];
  };
};

const scoreOf = async () =>
  (
    await client?.query(
      "select r.score from exam_results r join lesson_exams x on x.id = r.exam_id where x.lesson_id = $1 and r.user_id = $2",
      [exam.lessonId, TALEBE.sub]
    )
  )?.rows[0]?.score ?? null;

test("the müderris plans an exam with Sınav in the same flow", async ({
  as,
}) => {
  test.skip(!seeded(), "no müderris or talebe account");
  const page = await as("MUDERRIS");
  await page.setViewportSize(desktop);
  await page.goto(`/ders/${fixture?.courseId}/celseler/planla`);
  await page.getByRole("radio", { name: "Sınav" }).click();
  await expect(page.getByTestId("plan-exam")).toBeVisible();
  // One celse: the weekly repeat is not offered for an exam.
  await expect(
    page.getByRole("radio", { name: "Haftalık tekrar" })
  ).toHaveCount(0);
  const day = new Date(Date.now() + 5 * 24 * 3_600_000)
    .toISOString()
    .slice(0, 10);
  await page.locator('input[name="startDate"]').fill(day);
  await page.getByRole("button", { name: "Sınavı planla" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/ders/${fixture?.courseId}/celseler$`)
  );
  await expect
    .poll(
      async () =>
        (
          await client?.query(
            "select count(*)::int as n from lesson_exams x join lessons l on l.id = x.lesson_id join course_weeks w on w.id = l.week_id where w.course_id = $1",
            [fixture?.courseId]
          )
        )?.rows[0].n
    )
    .toBe(2);
});

test("scores are entered on Değerlendirme and stay closed to the talebe until released", async ({
  as,
}) => {
  test.skip(!seeded(), "no müderris or talebe account");
  const page = await as("MUDERRIS");
  await page.setViewportSize(desktop);
  await page.goto(`/ders/${fixture?.courseId}/degerlendirme`);
  await page.getByTestId(`evaluation-open-${exam.lessonId}`).click();
  const row = page.getByTestId(`exam-row-${TALEBE.sub}`);
  const box = row.getByRole("spinbutton");

  await box.fill("120");
  await box.press("Enter");
  await expect(row.getByRole("alert")).toContainText("En çok 100 puan");
  expect(await scoreOf()).toBeNull();

  await box.fill("85");
  await box.press("Enter");
  await expect.poll(scoreOf).toBe(85);
  await expect(page.getByTestId("exam-count")).toHaveText("1/1 girildi");

  const closed = (await myGrades()).exams.find(
    (e) => e.lessonId === exam.lessonId
  );
  expect(closed).toMatchObject({ released: false, score: null });

  await page.getByTestId("exam-release").click();
  await expect(page.getByTestId("exam-released")).toBeVisible();
  await expect
    .poll(async () =>
      (await myGrades()).exams.find((e) => e.lessonId === exam.lessonId)
    )
    .toMatchObject({ released: true, score: 85 });
});
