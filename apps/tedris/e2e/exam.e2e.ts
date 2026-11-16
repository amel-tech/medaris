import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import type pg from "pg";
import { type CelseStatesFixture, seedCelseStates } from "./celse-states-seed";
import { pgClient } from "./pg-client";

/**
 * "Ara sınav" on tedris (MDRS-248), against the running app and API with the
 * enrolled talebe signed in through Keycloak (E2E_TALEBE_EMAIL,
 * E2E_TALEBE_PASSWORD, E2E_TALEBE_SUB). On the celse-states fixture: an exam
 * three days ahead (its "Sınav" mark and countdown in Müfredat), a released
 * exam with the talebe's 17/20 and a closed one whose score is entered but
 * must not show on "Notlarım". Skipped without the account.
 */
let fixture: CelseStatesFixture;
let client: pg.Client;
let removeEnrollment: (() => Promise<void>) | undefined;
const talebe = {
  email: process.env.E2E_TALEBE_EMAIL,
  password: process.env.E2E_TALEBE_PASSWORD,
  sub: process.env.E2E_TALEBE_SUB,
};
const ahead = { id: randomUUID(), title: "Ara sınav (yaklaşan)" };
const closed = { id: randomUUID(), title: "Ara sınav (kapalı)" };

test.beforeAll(async () => {
  if (!talebe.sub) return;
  fixture = await seedCelseStates();
  removeEnrollment = await fixture.enroll(talebe.sub, "ENROLLED");
  client = await pgClient();
  const week = (
    await client.query("select week_id from lessons where id = $1", [
      fixture.sessions.ended.id,
    ])
  ).rows[0].week_id as string;
  await client.query(
    `insert into lessons(id, week_id, title, type, order_index, scheduled_at, duration_minutes) values
     ($1, $3, $4, 'LIVE', 90, now() + interval '3 days', 60),
     ($2, $3, $5, 'LIVE', 91, now() - interval '5 hours', 60)`,
    [ahead.id, closed.id, week, ahead.title, closed.title]
  );
  const exams = (
    await client.query(
      `insert into lesson_exams(lesson_id, max_score, results_released_at) values
       ($1, 100, null), ($2, 20, now()), ($3, 100, null) returning id, lesson_id`,
      [ahead.id, fixture.sessions.ended.id, closed.id]
    )
  ).rows as { id: string; lesson_id: string }[];
  const examOf = (lessonId: string) =>
    exams.find((x) => x.lesson_id === lessonId)?.id;
  await client.query(
    `insert into exam_results(exam_id, user_id, score, graded_by) values
     ($1, $3, 17, $3), ($2, $3, 64, $3)`,
    [examOf(fixture.sessions.ended.id), examOf(closed.id), talebe.sub]
  );
});

test.afterAll(async () => {
  if (client) {
    const ids = [ahead.id, closed.id, fixture.sessions.ended.id];
    await client.query(
      "delete from exam_results where exam_id in (select id from lesson_exams where lesson_id = any($1))",
      [ids]
    );
    await client.query("delete from lesson_exams where lesson_id = any($1)", [
      ids,
    ]);
    await client.end();
  }
  await removeEnrollment?.();
  await fixture?.remove();
});

const signIn = async (page: Page) => {
  await page.goto("/auth/signin");
  await page.locator("#username").fill(talebe.email as string);
  await page.locator("#password").fill(talebe.password as string);
  await page.locator("button[type=submit]").click();
  await page.waitForURL(/localhost:\d+/);
};

test.beforeEach(async ({ page }) => {
  test.skip(
    !(talebe.email && talebe.password && talebe.sub),
    "no Keycloak talebe in the environment"
  );
  await signIn(page);
});

test("Müfredat marks the exam ahead with Sınav and the days left", async ({
  page,
}) => {
  await page.goto(`/courses/${fixture.courseId}`);
  const badges = page.getByTestId("exam-badge");
  await expect(badges.filter({ hasText: "3 gün kaldı" })).toHaveCount(1);
});

test("Notlarım shows a released score and keeps a closed one hidden", async ({
  page,
}) => {
  await page.goto(`/courses/${fixture.courseId}`);
  await page.getByRole("tab", { name: "Notlarım" }).click();
  const rows = page.getByTestId("grade-exam");
  await expect(
    rows.filter({ hasText: fixture.sessions.ended.title })
  ).toContainText("17/20");
  const hidden = rows.filter({ hasText: closed.title });
  await expect(hidden).toContainText("Sonuç henüz açıklanmadı");
  await expect(hidden).not.toContainText("64");
});
