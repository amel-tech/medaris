import type { Page } from "@playwright/test";
import {
  type Account,
  account,
  canSignIn,
  directGrant,
  expect,
  test,
} from "./accounts";
import { type QuestionsFixture, seedQuestions } from "./questions-seed";

/**
 * Sorular of a course (MDRS-150) against the running app and API with real
 * Keycloak sign-ins: the müderris (E2E_MUDERRIS_*) reads the talebe's
 * questions, waiting ones first, and answers; a ders nazırı (E2E_DERS_NAZIR_*)
 * answers only with `question.answer`, and a passive course closes the page to
 * them again. The questions are the talebe's (E2E_TALEBE_SUB), seeded: tedris's
 * own spec asks them. The API calls take the direct grant of `accounts.ts`.
 */
const MUDERRIS = account("MUDERRIS");
const DERS_NAZIR = account("DERS_NAZIR");
const TALEBE = account("TALEBE");
const API = process.env.E2E_TEDRISAT_URL ?? "http://localhost:3001";
const desktop = { width: 1440, height: 900 };

let fixture: QuestionsFixture | undefined;

test.beforeAll(async () => {
  if (!MUDERRIS.sub || !DERS_NAZIR.sub || !TALEBE.sub) return;
  fixture = await seedQuestions({
    muderris: MUDERRIS.sub,
    dersNazir: DERS_NAZIR.sub,
    talebe: TALEBE.sub,
  });
});

test.afterEach(async () => {
  await fixture?.reopen();
});

test.afterAll(async () => {
  await fixture?.remove();
});

const seeded = (...who: Account[]) =>
  Boolean(fixture) && who.every((w) => canSignIn(w));

/** tedrisat as `who`, with a token of their own. */
async function api(
  who: Account,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; code?: string }> {
  const token = (await directGrant(who)).access_token;
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { status: res.status, code: data?.code ?? data?.error?.code };
}

const sorular = async (page: Page) => {
  await page.setViewportSize(desktop);
  await page.goto(`/ders/${fixture?.courseId}/sorular`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Sorular" })
  ).toBeVisible();
};

const cardOf = (page: Page, body: string) =>
  page.getByRole("article").filter({ hasText: body });

test("the müderris reads the waiting question first, answers it, and the answer is the talebe's to read", async ({
  as,
}) => {
  test.skip(!seeded(MUDERRIS), "no müderris account");
  const { waiting, answered } = fixture as QuestionsFixture;
  const page = await as("MUDERRIS");
  await sorular(page);
  await expect(
    page.locator("aside").getByRole("link", { name: /^Sorular/ })
  ).toHaveAttribute("aria-current", "page");

  const cards = page.getByRole("article");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText(waiting.body);
  await expect(cards.nth(0)).toContainText("Bekliyor");
  await expect(cards.nth(0)).toContainText(`Hafta 1 · ${waiting.session}`);
  await expect(cards.nth(1)).toContainText(answered.answer);
  await expect(cards.nth(1)).toContainText("Cevaplandı");

  const card = cardOf(page, waiting.body);
  await card.getByRole("button", { name: "Cevapla" }).click();
  await expect(card.getByText("Cevap boş olamaz.")).toBeVisible();
  await card
    .getByLabel("Cevabınız")
    .fill("Mâzîde aynü’l-fiil fethalıdır; fe‘ile ve fe‘ule de vardır.");
  await card.getByRole("button", { name: "Cevapla" }).click();
  await expect(card).toContainText("Cevaplandı");
  await expect(
    card.getByRole("button", { name: "Cevabı değiştir" })
  ).toBeVisible();
  expect(await fixture?.questionOf(waiting.id)).toEqual({
    answer: "Mâzîde aynü’l-fiil fethalıdır; fe‘ile ve fe‘ule de vardır.",
    answered_by: MUDERRIS.sub,
  });

  // the talebe's own list carries it (tedris draws it in Sorularım)
  const token = (await directGrant(TALEBE)).access_token;
  const mine = await (
    await fetch(`${API}/courses/${fixture?.courseId}/questions/mine`, {
      headers: { authorization: `Bearer ${token}` },
    })
  ).json();
  expect(JSON.stringify(mine)).toContain("fe‘ule de vardır");

  await page.reload();
  await expect(page.getByText("Bekliyor", { exact: true })).toHaveCount(0);
});

test("a ders nazırı without question.answer is refused the page, and the API refuses the list (403) and the answer (404)", async ({
  as,
}) => {
  test.skip(!seeded(DERS_NAZIR), "no ders nazırı account");
  const { waiting } = fixture as QuestionsFixture;
  const page = await as("DERS_NAZIR");
  await sorular(page);
  await expect(page.getByText("Bu sayfaya izniniz yok")).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cevapla" })).toHaveCount(0);
  expect(await page.content()).not.toContain(waiting.body);

  const list = await api(
    DERS_NAZIR,
    "GET",
    `/courses/${fixture?.courseId}/questions`
  );
  expect([list.status, list.code]).toEqual([403, "AUTHZ_FORBIDDEN"]);
  // a refusal to answer reads as "no such question" (MDRS-150)
  const answer = await api(
    DERS_NAZIR,
    "PUT",
    `/questions/${waiting.id}/answer`,
    { body: "yetkisiz cevap" }
  );
  expect([answer.status, answer.code]).toEqual([
    404,
    "LESSON_QUESTION_NOT_FOUND",
  ]);
  expect(await fixture?.questionOf(waiting.id)).toEqual({
    answer: null,
    answered_by: null,
  });
});

test("given question.answer, the ders nazırı reads the questions and answers one; a passive course takes it away again", async ({
  as,
}) => {
  test.skip(!seeded(DERS_NAZIR), "no ders nazırı account");
  const { waiting } = fixture as QuestionsFixture;
  const revoke = await (fixture as QuestionsFixture).grantAnswer();
  try {
    const page = await as("DERS_NAZIR");
    await sorular(page);
    const card = cardOf(page, waiting.body);
    await expect(card).toContainText("Bekliyor");
    await card.getByLabel("Cevabınız").fill("Ders nazırından: fetha ile.");
    await card.getByRole("button", { name: "Cevapla" }).click();
    await expect(card).toContainText("Cevaplandı");
    expect(await fixture?.questionOf(waiting.id)).toEqual({
      answer: "Ders nazırından: fetha ile.",
      answered_by: DERS_NAZIR.sub,
    });

    // the müderris leaves and nobody is seated: the course is passive
    const reseat = await (fixture as QuestionsFixture).makePassive();
    try {
      await page.reload();
      await expect(
        page.getByRole("heading", { level: 1, name: "Sorular" })
      ).toBeVisible();
      await expect(page.getByText("Bu sayfaya izniniz yok")).toBeVisible();
      await expect(page.getByRole("article")).toHaveCount(0);
      const list = await api(
        DERS_NAZIR,
        "GET",
        `/courses/${fixture?.courseId}/questions`
      );
      expect(list.status).toBe(403);
      const answer = await api(
        DERS_NAZIR,
        "PUT",
        `/questions/${waiting.id}/answer`,
        { body: "pasif derste cevap" }
      );
      expect([answer.status, answer.code]).toEqual([
        404,
        "LESSON_QUESTION_NOT_FOUND",
      ]);
      expect(await fixture?.questionOf(waiting.id)).toMatchObject({
        answer: "Ders nazırından: fetha ile.",
      });
    } finally {
      await reseat();
    }
  } finally {
    await revoke();
  }
});
