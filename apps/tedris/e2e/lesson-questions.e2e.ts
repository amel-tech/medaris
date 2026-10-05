import { expect, type Page, test } from "@playwright/test";
import {
  api,
  type LessonWritingFixture,
  muderris,
  ready,
  second,
  seedLessonWriting,
  talebe,
} from "./lesson-writing-seed";
import { signIn } from "./sign-in";

/**
 * A talebe's questions to the course staff (MDRS-150) on tedris, against the
 * running app and API with real Keycloak sign-ins: the Sorularım tab of the
 * course page, asking on a session in each state (one on air among them),
 * editing and deleting while it waits, reading the müderris's answer, and who
 * may not ask. The answer is given through the API as the müderris
 * (E2E_MUDERRIS_*); nazar's Sorular page, where the staff answer, has its own
 * spec. Accounts as in `lesson-notes.e2e.ts`; a test whose account is missing
 * is skipped.
 */
let fixture: LessonWritingFixture;
let unenroll: (() => Promise<void>) | undefined;

test.beforeAll(async () => {
  fixture = await seedLessonWriting({ muderris: muderris.sub });
  if (talebe.sub) unenroll = await fixture.enroll(talebe.sub, "ENROLLED");
});

test.afterEach(async () => {
  await fixture?.clearWriting();
});

test.afterAll(async () => {
  await unenroll?.();
  await fixture?.remove();
});

const questionsTab = (courseId = fixture.courseId) =>
  `/tr/courses/${courseId}?tab=sorularim`;

/** The card of the caller's question on this session. */
const card = (page: Page, sessionTitle: string) =>
  page.getByRole("article", { name: `Soru, ${sessionTitle}` });

async function ask(page: Page, sessionLine: string, body: string) {
  const form = page.getByRole("form", { name: "Soru sor" });
  await form.getByRole("combobox", { name: "Celse" }).click();
  await page.getByRole("option", { name: sessionLine }).click();
  await form.getByLabel("Sorun").fill(body);
  await form.getByRole("button", { name: "Soruyu gönder" }).click();
  await expect(form.getByLabel("Sorun")).toHaveValue("");
}

test.describe("the enrolled talebe", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!ready(talebe), "no Keycloak talebe in the environment");
    await signIn(page, talebe);
  });

  test("asks on a session from Sorularım, edits the question and deletes it while it waits", async ({
    page,
  }) => {
    const s = fixture.sessions.youtube;
    await page.goto(questionsTab());
    await expect(page.getByRole("tab", { name: "Sorularım" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(
      page.getByText("Bu derste henüz soru sormadın.")
    ).toBeVisible();

    const form = page.getByRole("form", { name: "Soru sor" });
    await form.getByLabel("Sorun").fill("Celsesiz soru");
    await form.getByRole("button", { name: "Soruyu gönder" }).click();
    await expect(form.getByText("Önce bir celse seç.")).toBeVisible();
    expect(await fixture.questionsOf(talebe.sub as string)).toEqual([]);

    await ask(
      page,
      `Hafta 1 · ${s.title}`,
      "Fe‘ale bâbında mâzînin aynü’l-fiili neden fethalıdır?"
    );
    const asked = card(page, s.title);
    await expect(asked).toContainText("Cevap bekleniyor");
    await expect(asked).toContainText(`Hafta 1 · ${s.title}`);
    expect(await fixture.questionsOf(talebe.sub as string)).toMatchObject([
      { lesson_id: s.id, answer: null },
    ]);

    await page.reload();
    await expect(card(page, s.title)).toContainText("aynü’l-fiili");

    await card(page, s.title)
      .getByRole("button", { name: `Soruyu düzenle, ${s.title}` })
      .click();
    await card(page, s.title)
      .getByLabel("Sorun")
      .fill("Fe‘ale bâbında mâzî ile muzârinin harekeleri neden ayrılır?");
    await card(page, s.title).getByRole("button", { name: "Kaydet" }).click();
    // the form goes once the API has taken the new text
    await expect(card(page, s.title).getByLabel("Sorun")).toHaveCount(0);
    await expect(card(page, s.title)).toContainText("muzârinin harekeleri");
    expect(await fixture.questionsOf(talebe.sub as string)).toMatchObject([
      { body: "Fe‘ale bâbında mâzî ile muzârinin harekeleri neden ayrılır?" },
    ]);

    await card(page, s.title)
      .getByRole("button", { name: `Soruyu sil, ${s.title}` })
      .click();
    await expect(card(page, s.title).getByText("Silinsin mi?")).toBeVisible();
    await card(page, s.title)
      .getByRole("button", { name: "Sil", exact: true })
      .click();
    await expect(card(page, s.title)).toHaveCount(0);
    await expect(
      page.getByText("Bu derste henüz soru sormadın.")
    ).toBeVisible();
    expect(await fixture.questionsOf(talebe.sub as string)).toEqual([]);
  });

  test("while a lesson is on: asks on the session on air, and the form offers every session, over and to come", async ({
    page,
  }) => {
    const { live, liveLinkOnly, upcoming, youtube, bunny, endedBare } =
      fixture.sessions;
    await page.goto(`/tr/courses/${fixture.courseId}/lessons/${live.id}`);
    await expect(
      page.getByRole("main").getByText("Şu an canlı").first()
    ).toBeVisible();

    await page.goto(questionsTab());
    const form = page.getByRole("form", { name: "Soru sor" });
    await form.getByRole("combobox", { name: "Celse" }).click();
    await expect(page.getByRole("option")).toHaveText([
      `Hafta 1 · ${youtube.title}`,
      `Hafta 1 · ${bunny.title}`,
      `Hafta 1 · ${endedBare.title}`,
      `Hafta 2 · ${live.title}`,
      `Hafta 2 · ${liveLinkOnly.title}`,
      `Hafta 2 · ${upcoming.title}`,
    ]);
    await page.keyboard.press("Escape");

    await ask(
      page,
      `Hafta 2 · ${live.title}`,
      "Nehyde lâ-yı nâhiye cezm eder mi?"
    );
    await expect(card(page, live.title)).toContainText("Cevap bekleniyor");
    await ask(
      page,
      `Hafta 2 · ${liveLinkOnly.title}`,
      "Zoom derste sorulamayanı buraya yazıyorum."
    );
    await expect(card(page, liveLinkOnly.title)).toContainText(
      "Cevap bekleniyor"
    );
    await ask(
      page,
      `Hafta 2 · ${upcoming.title}`,
      "Gelecek celse için: ism-i fâil hangi bâbdan?"
    );
    await expect(card(page, upcoming.title)).toContainText("Cevap bekleniyor");
    expect(
      (await fixture.questionsOf(talebe.sub as string)).map((q) => q.lesson_id)
    ).toEqual([live.id, liveLinkOnly.id, upcoming.id]);
  });

  test("reads the müderris's answer, and a question that has one can be deleted but not edited", async ({
    page,
  }) => {
    test.skip(!ready(muderris), "no Keycloak müderris in the environment");
    const s = fixture.sessions.bunny;
    const asked = await api(talebe, "POST", `/lessons/${s.id}/questions`, {
      body: "Muzâride hurûf-i mudâraa kaç tanedir?",
    });
    expect(asked.status).toBe(201);
    const questionId = (asked.data as { id: string }).id;
    const answered = await api(
      muderris,
      "PUT",
      `/questions/${questionId}/answer`,
      { body: "Dört tanedir: **eyn** harfleri." }
    );
    expect(answered.status).toBe(200);

    await page.goto(questionsTab());
    const q = card(page, s.title);
    await expect(q).toContainText("Cevaplandı");
    await expect(q.getByText(/^Cevap(: .+)?$/)).toBeVisible();
    await expect(q.locator("strong")).toHaveText("eyn");
    await expect(
      q.getByRole("button", { name: `Soruyu düzenle, ${s.title}` })
    ).toHaveCount(0);
    await q.getByRole("button", { name: `Soruyu sil, ${s.title}` }).click();
    await expect(q.getByText("Silinsin mi? Cevabı da silinir.")).toBeVisible();
    await q.getByRole("button", { name: "Vazgeç" }).click();

    // what the screen hides, the API refuses
    const edit = await api(talebe, "PATCH", `/questions/${questionId}`, {
      body: "değiştirdim",
    });
    expect([edit.status, edit.code]).toEqual([409, "LESSON_QUESTION_ANSWERED"]);
    expect(await fixture.questionsOf(talebe.sub as string)).toMatchObject([
      {
        body: "Muzâride hurûf-i mudâraa kaç tanedir?",
        answer: "Dört tanedir: **eyn** harfleri.",
      },
    ]);
  });

  test("a passive course: no Sorularım tab, and the API closes asking and the talebe's own list", async ({
    page,
  }) => {
    const undo = await fixture.enroll(
      talebe.sub as string,
      "ENROLLED",
      "passive"
    );
    try {
      const { courseId, sessionId } = fixture.passive;
      await page.goto(questionsTab(courseId));
      await expect(page.getByRole("tab", { name: "Müfredat" })).toHaveAttribute(
        "aria-selected",
        "true"
      );
      await expect(page.getByRole("tab", { name: "Sorularım" })).toHaveCount(0);
      await expect(page.getByRole("form", { name: "Soru sor" })).toHaveCount(0);

      const write = await api(
        talebe,
        "POST",
        `/lessons/${sessionId}/questions`,
        { body: "Pasif derste soru" }
      );
      expect([write.status, write.code]).toEqual([
        403,
        "LESSON_QUESTION_FORBIDDEN",
      ]);
      const mine = await api(
        talebe,
        "GET",
        `/courses/${courseId}/questions/mine`
      );
      expect([mine.status, mine.code]).toEqual([
        403,
        "LESSON_QUESTION_FORBIDDEN",
      ]);
      expect(await fixture.questionsOf(talebe.sub as string)).toEqual([]);
    } finally {
      await undo();
    }
  });
});

test("nobody else reads a talebe's question: a second talebe's Sorularım is empty, and the API answers 404 and 403", async ({
  page,
}) => {
  test.skip(
    !ready(talebe, second, muderris),
    "the talebe, a second account and the müderris are needed"
  );
  const s = fixture.sessions.youtube;
  const body = "Yalnız müderrisime: istiğrak meselesi";
  const asked = await api(talebe, "POST", `/lessons/${s.id}/questions`, {
    body,
  });
  expect(asked.status).toBe(201);
  const questionId = (asked.data as { id: string }).id;
  const undo = await fixture.enroll(second.sub as string, "ENROLLED");
  try {
    const mine = await api(
      second,
      "GET",
      `/courses/${fixture.courseId}/questions/mine`
    );
    expect(mine.status).toBe(200);
    expect(JSON.stringify(mine.data)).not.toContain(body);
    const staffList = await api(
      second,
      "GET",
      `/courses/${fixture.courseId}/questions`
    );
    expect([staffList.status, staffList.code]).toEqual([
      403,
      "AUTHZ_FORBIDDEN",
    ]);
    for (const [method, path, payload] of [
      ["PATCH", `/questions/${questionId}`, { body: "değiştirildi" }],
      ["PUT", `/questions/${questionId}/answer`, { body: "cevap" }],
      ["DELETE", `/questions/${questionId}`, undefined],
    ] as const) {
      const refused = await api(second, method, path, payload);
      expect([method, refused.status, refused.code]).toEqual([
        method,
        404,
        "LESSON_QUESTION_NOT_FOUND",
      ]);
    }
    expect(await fixture.questionsOf(talebe.sub as string)).toMatchObject([
      { id: questionId, body, answer: null },
    ]);
    // the course's staff read it
    const staff = await api(
      muderris,
      "GET",
      `/courses/${fixture.courseId}/questions`
    );
    expect(staff.status).toBe(200);
    expect(JSON.stringify(staff.data)).toContain(body);

    await signIn(page, second);
    await page.goto(questionsTab());
    await expect(
      page.getByText("Bu derste henüz soru sormadın.")
    ).toBeVisible();
    expect(await page.content()).not.toContain(body);
  } finally {
    await undo();
  }
});

test("a talebe who is not enrolled, waits for approval or was taken out has no Sorularım tab, and the API takes no question from them", async ({
  page,
}) => {
  test.skip(!ready(second), "no second Keycloak account in the environment");
  const s = fixture.sessions.live;
  await signIn(page, second);
  for (const status of [null, "PENDING", "REVOKED"] as const) {
    const undo = status
      ? await fixture.enroll(second.sub as string, status)
      : undefined;
    try {
      await page.goto(questionsTab());
      await expect(page.getByRole("tab", { name: "Müfredat" })).toHaveAttribute(
        "aria-selected",
        "true"
      );
      await expect(page.getByRole("tab", { name: "Sorularım" })).toHaveCount(0);
      const write = await api(second, "POST", `/lessons/${s.id}/questions`, {
        body: `${status ?? "kayıtsız"} soru`,
      });
      expect([status, write.status, write.code]).toEqual([
        status,
        403,
        "LESSON_QUESTION_FORBIDDEN",
      ]);
    } finally {
      await undo?.();
    }
  }
  expect(await fixture.questionsOf(second.sub as string)).toEqual([]);
});

test("a talebe taken out of the course still reads their answered question through the API, while the page shows no Sorularım tab", async ({
  page,
}) => {
  test.skip(
    !ready(second, muderris),
    "a second account and the müderris are needed"
  );
  const s = fixture.sessions.youtube;
  const undo = await fixture.enroll(second.sub as string, "ENROLLED");
  try {
    const asked = await api(second, "POST", `/lessons/${s.id}/questions`, {
      body: "Çıkarılmadan önce sordum",
    });
    expect(asked.status).toBe(201);
    const questionId = (asked.data as { id: string }).id;
    await api(muderris, "PUT", `/questions/${questionId}/answer`, {
      body: "Cevabın burada",
    });
    await fixture.enroll(second.sub as string, "REVOKED");

    const mine = await api(
      second,
      "GET",
      `/courses/${fixture.courseId}/questions/mine`
    );
    expect(mine.status).toBe(200);
    expect(JSON.stringify(mine.data)).toContain("Cevabın burada");

    await signIn(page, second);
    await page.goto(questionsTab());
    await expect(
      page.getByText("Bu derse erişimin kaldırıldı.").first()
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "Sorularım" })).toHaveCount(0);
  } finally {
    await undo();
  }
});
