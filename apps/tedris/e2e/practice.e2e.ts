import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import type pg from "pg";
import { type CelseStatesFixture, seedCelseStates } from "./celse-states-seed";
import { pgClient } from "./pg-client";

/**
 * Çalışma Soruları on tedris (MDRS-248, Faz 3), against the running app and
 * API with the enrolled talebe signed in through Keycloak (E2E_TALEBE_EMAIL,
 * E2E_TALEBE_PASSWORD, E2E_TALEBE_SUB). A published set of two questions on
 * the celse-states course: the course page links to it, the list offers
 * "Başla", one answer and "Bitir" end on the result with one correct and one
 * blank. Then a note on a question (soru notları): written and sent to the
 * hoca from the solving screen, answered by the hoca, and read under
 * "Notlarım". Skipped without the account.
 */
let fixture: CelseStatesFixture;
let client: pg.Client;
let removeEnrollment: (() => Promise<void>) | undefined;
const talebe = {
  email: process.env.E2E_TALEBE_EMAIL,
  password: process.env.E2E_TALEBE_PASSWORD,
  sub: process.env.E2E_TALEBE_SUB,
};
const setId = randomUUID();
const topicId = randomUUID();
const questions = [
  { id: randomUUID(), text: "Nasara hangi babdandır?", right: "Birinci bab" },
  { id: randomUUID(), text: "Daraba hangi babdandır?", right: "İkinci bab" },
];
const setTitle = "Emsile çalışması";

test.beforeAll(async () => {
  if (!talebe.sub) return;
  fixture = await seedCelseStates();
  removeEnrollment = await fixture.enroll(talebe.sub, "ENROLLED");
  client = await pgClient();
  await client.query(
    `insert into online_exams(id, course_id, title, kind, duration_minutes, published_at, created_by)
     values ($1, $2, $3, 'PRACTICE', null, now(), $4)`,
    [setId, fixture.courseId, setTitle, randomUUID()]
  );
  await client.query(
    `insert into course_exam_topics(id, course_id, number, name, name_key)
     values ($1, $2, 1, 'Bablar', 'bablar')`,
    [topicId, fixture.courseId]
  );
  for (const [i, q] of questions.entries()) {
    await client.query(
      `insert into exam_questions(id, exam_id, position, text, answer_mode, talebe_notes)
       values ($1, $2, $3, $4, 'SINGLE', true)`,
      [q.id, setId, i, q.text]
    );
    await client.query(
      `insert into exam_options(question_id, position, text, correct) values
       ($1, 0, 'Birinci bab', $2), ($1, 1, 'İkinci bab', $3)`,
      [q.id, q.right === "Birinci bab", q.right === "İkinci bab"]
    );
    await client.query(
      "insert into exam_question_topics(question_id, topic_id) values ($1, $2)",
      [q.id, topicId]
    );
  }
});

test.afterAll(async () => {
  if (client) {
    const ids = questions.map((q) => q.id);
    await client.query("delete from question_notes where exam_id = $1", [
      setId,
    ]);
    await client.query(
      "delete from practice_answers where attempt_id in (select id from practice_attempts where set_id = $1)",
      [setId]
    );
    await client.query("delete from practice_attempts where set_id = $1", [
      setId,
    ]);
    await client.query(
      "delete from exam_question_topics where question_id = any($1)",
      [ids]
    );
    await client.query("delete from exam_options where question_id = any($1)", [
      ids,
    ]);
    await client.query("delete from exam_questions where exam_id = $1", [
      setId,
    ]);
    await client.query("delete from online_exams where id = $1", [setId]);
    await client.query("delete from course_exam_topics where id = $1", [
      topicId,
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

test("the course page links to Çalışma Soruları", async ({ page }) => {
  await page.goto(`/courses/${fixture.courseId}`);
  await page.getByTestId("course-practice-link").click();
  await expect(page).toHaveURL(/\/calisma-sorulari#ders-/);
  await expect(
    page.getByTestId("practice-set").filter({ hasText: setTitle })
  ).toBeVisible();
});

test("Başla, one answer, Bitir: the result with the correct options", async ({
  page,
}) => {
  await page.goto("/calisma-sorulari");
  const card = page.getByTestId("practice-set").filter({ hasText: setTitle });
  await card.getByRole("link", { name: `${setTitle}: başla` }).click();
  const question = page.getByTestId("practice-question");
  await expect(question).toBeVisible();
  // The questions come in an order of the attempt's own: answer the one shown.
  const text = (await question.locator("h2").textContent())?.trim();
  const q = questions.find((it) => it.text === text);
  await question.getByRole("radio", { name: q?.right }).click();
  await expect(page.getByText("Cevabın kaydedildi.")).toBeVisible();

  // A reload goes on at the same question, with the choice.
  await page.reload();
  await expect(question.locator("h2")).toHaveText(text ?? "");
  await expect(question.getByRole("radio", { name: q?.right })).toBeChecked();

  await question.getByRole("button", { name: "Bitir" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(
    "1 soruyu boş bıraktın. Bitirmek istiyor musun?"
  );
  await dialog.getByRole("button", { name: "Bitir" }).click();

  await expect(page).toHaveURL(/\/calisma-sorulari\/deneme\//);
  await expect(page.getByTestId("practice-result")).toContainText("%50");
  await expect(page.getByTestId("practice-correct")).toHaveText("1");
  await expect(page.getByTestId("practice-blank")).toHaveText("1");
  await expect(page.getByText("Doğru şık")).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Tekrar çöz" })).toBeVisible();
});

test("a note on a question: written, sent, answered, read under Notlarım (soru notları)", async ({
  page,
}) => {
  // Straight to the set: an attempt is started or the open one taken back,
  // whatever the tests before left.
  await page.goto(`/calisma-sorulari/${setId}`);
  const question = page.getByTestId("practice-question");
  await expect(question).toBeVisible();
  const text = (await question.locator("h2").textContent())?.trim();
  const q = questions.find((it) => it.text === text);
  expect(q, "the question shown is one of the seeded ones").toBeDefined();

  const icon = question.getByTestId("question-note-button");
  await icon.click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("textbox")).toBeFocused();
  await panel.getByRole("textbox").fill("Bu fiilin babını nasıl bulurum?");
  await panel.getByText("Hocaya gönder").click();
  await panel.getByRole("button", { name: "Kaydet" }).click();
  await expect(panel).toContainText("Notun kaydedildi.");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(icon).toBeFocused();

  // The hoca answers (nazar's screen is not this app's).
  await client.query(
    `update question_notes set teacher_reply = $1, replied_by = $2, replied_at = now()
     where question_id = $3`,
    ["Mâzi ile muzârinin aynel fiillerine bak.", randomUUID(), q?.id]
  );

  await page.goto("/calisma-sorulari");
  await page
    .locator(`#ders-${fixture.courseId}`)
    .getByTestId("practice-notes-link")
    .click();
  await expect(page).toHaveURL(/\/calisma-sorulari\/notlar\?ders=/);
  const item = page.getByTestId("notes-item").filter({ hasText: text ?? "" });
  await expect(item).toContainText("Bu fiilin babını nasıl bulurum?");
  await expect(item).toContainText("Hocaya gönderildi");
  await expect(item).toContainText("Hocanın cevabı:");
  await expect(item).toContainText("Mâzi ile muzârinin aynel fiillerine bak.");
  await expect(item).toContainText("Yeni cevap");
});
