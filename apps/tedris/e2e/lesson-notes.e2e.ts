import {
  type Browser,
  expect,
  type Locator,
  type Page,
  test,
} from "@playwright/test";
import {
  api,
  basnazim,
  type LessonWritingFixture,
  muderris,
  ready,
  second,
  seedLessonWriting,
  talebe,
} from "./lesson-writing-seed";
import { type E2eAccount, signIn } from "./sign-in";

/**
 * A talebe's private notes on a session's video (MDRS-150) against the running
 * app and API, with real Keycloak sign-ins: the notes panel of the session page
 * and of the recordings tab, on a YouTube recording, a pasted Bunny link and a
 * live stream, and who never reads them. Accounts: the enrolled talebe
 * (E2E_TALEBE_*), a second person enrolled or not as each test sets (see
 * `second` in the seed), the course's müderris (E2E_MUDERRIS_*) and the
 * başnazım (E2E_SISTEM_ADMIN_*). A test whose account is missing is skipped.
 * The API calls as another person take the direct grant of `sign-in.ts`.
 *
 * Every request to Bunny's hosts is aborted: the video id is made up. The
 * Bunny frame itself is drawn only when tedrisat runs with the dev library's
 * id and a token key, so that test also needs E2E_BUNNY_LIBRARY_ID (769667).
 * YouTube is not stubbed: the position test loads YouTube's player API from
 * youtube.com, as the page does.
 */
const BUNNY_LIBRARY = process.env.E2E_BUNNY_LIBRARY_ID;

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

const sessionPath = (id: string, courseId = fixture.courseId) =>
  `/tr/courses/${courseId}/lessons/${id}`;

/** No request leaves for Bunny: the video id is made up. */
const blockBunny = (page: Page) =>
  page.route(
    (url) =>
      url.hostname.endsWith("mediadelivery.net") ||
      url.hostname.endsWith("bunnycdn.com") ||
      url.hostname.endsWith("b-cdn.net"),
    (route) => route.abort()
  );

const notesPanel = (page: Page) =>
  page.getByRole("region", { name: "Notlarım" });

/** Writes a note through the panel's form; an empty `time` leaves it without one. */
async function addNote(panel: Locator, body: string, time: string) {
  const form = panel.locator("form");
  await form.getByLabel("Not", { exact: true }).fill(body);
  // Focusing the note takes the YouTube player's position when it has one;
  // the time typed afterwards (or cleared) is the one that is saved.
  await form.getByLabel("Videodaki an").fill(time);
  await form.getByRole("button", { name: "Notu ekle" }).click();
  await expect(form.getByLabel("Not", { exact: true })).toHaveValue("");
}

async function pageAs(browser: Browser, who: E2eAccount) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, who);
  return page;
}

test.describe("the enrolled talebe", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!ready(talebe), "no Keycloak talebe in the environment");
    await signIn(page, talebe);
  });

  test("on a YouTube recording's session page: adds a note with a time and one without, edits, deletes, and finds them after a reload", async ({
    page,
  }) => {
    const s = fixture.sessions.youtube;
    await page.goto(sessionPath(s.id));
    // the frame carries YouTube's player API for the panel
    await expect(page.locator("#recording-frame")).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/9bZkp7q19f0?enablejsapi=1"
    );
    const panel = notesPanel(page);
    await expect(panel.getByText("Yalnızca sen görürsün.")).toBeVisible();
    await expect(
      panel.getByText("Bu celse için henüz notun yok.")
    ).toBeVisible();

    // a time the panel cannot read is refused, and nothing is written
    const form = panel.locator("form");
    await form.getByLabel("Not", { exact: true }).fill("geçersiz zaman");
    await form.getByLabel("Videodaki an").fill("1:75");
    await form.getByRole("button", { name: "Notu ekle" }).click();
    await expect(
      panel.getByText("Zamanı 12:34 ya da 1:02:03 biçiminde yaz.")
    ).toBeVisible();
    expect(await fixture.notesOf(talebe.sub as string, s.id)).toEqual([]);

    await addNote(panel, "Mâzî fiilde **fe‘ale** kalıbı", "1:05");
    await addNote(panel, "Sonra sorulacak: bâb-ı sânî", "");
    const items = panel.getByRole("listitem");
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText("1:05");
    await expect(items.nth(0).locator("strong")).toHaveText("fe‘ale");
    await expect(items.nth(1)).toContainText("Zamansız");
    expect(
      (await fixture.notesOf(talebe.sub as string, s.id)).map(
        (n) => n.offset_seconds
      )
    ).toEqual([65, null]);

    await panel.getByRole("button", { name: "Notu düzenle, 1:05" }).click();
    const editing = items.filter({
      has: page.getByRole("button", { name: "Kaydet" }),
    });
    await editing
      .getByLabel("Not", { exact: true })
      .fill("Mâzî fiilde fe‘ale ve fe‘ile kalıpları");
    await editing.getByLabel("Videodaki an").fill("2:10");
    await editing.getByRole("button", { name: "Kaydet" }).click();
    await expect(panel.getByRole("button", { name: "Kaydet" })).toHaveCount(0);
    await expect(items.nth(0)).toContainText("2:10");
    await expect(items.nth(0)).toContainText("fe‘ile");

    await panel.getByRole("button", { name: "Notu sil, Zamansız" }).click();
    await expect(panel.getByText("Silinsin mi?")).toBeVisible();
    await panel.getByRole("button", { name: "Sil", exact: true }).click();
    await expect(items).toHaveCount(1);

    await page.reload();
    await expect(notesPanel(page).getByRole("listitem")).toHaveCount(1);
    await expect(notesPanel(page).getByRole("listitem")).toContainText(
      "Mâzî fiilde fe‘ale ve fe‘ile kalıpları"
    );
    await expect(notesPanel(page).getByText("Zamansız")).toHaveCount(0);
    expect(await fixture.notesOf(talebe.sub as string, s.id)).toMatchObject([
      { offset_seconds: 130, body: "Mâzî fiilde fe‘ale ve fe‘ile kalıpları" },
    ]);
  });

  test("on a YouTube recording, the time is the player's: the panel reads its position and a note's time moves it there", async ({
    page,
  }) => {
    // YouTube's own player API, loaded from youtube.com by the page
    await page.goto(sessionPath(fixture.sessions.youtube.id));
    const panel = notesPanel(page);
    const current = panel.getByRole("button", { name: "Şimdiki an" });
    await expect(current).toBeVisible({ timeout: 30_000 });
    await expect(
      panel.getByText(
        "Oynatıcıdaki an yazılır; değiştirebilir ya da boş bırakabilirsin."
      )
    ).toBeVisible();
    const time = panel.locator("form").getByLabel("Videodaki an");
    // the moment the talebe starts writing is the note's moment
    await panel.locator("form").getByLabel("Not", { exact: true }).focus();
    await expect(time).toHaveValue("0:00");

    await addNote(panel, "Bâb-ı evvel: nasara-yensuru", "1:05");
    await panel
      .getByRole("button", { name: "Videoyu 1:05 anına götür" })
      .click();
    await expect(async () => {
      await current.click();
      expect(await time.inputValue()).toMatch(/^1:0\d$/);
    }).toPass({ timeout: 15_000 });
  });

  test("on the recordings tab: the panel follows the recording in the player, and its note is the session's", async ({
    page,
  }) => {
    await blockBunny(page);
    const { youtube, bunny } = fixture.sessions;
    await page.goto(`/tr/courses/${fixture.courseId}?tab=kayitlar`);
    await expect(
      page.getByRole("tab", { name: /Ders kayıtları/ })
    ).toHaveAttribute("aria-selected", "true");
    // the newest recording is in the player first
    await expect(
      page.getByRole("heading", { level: 2, name: bunny.recordingTitle })
    ).toBeVisible();
    await expect(notesPanel(page)).toBeVisible();

    await page
      .getByRole("button", { name: `Oynat: ${youtube.recordingTitle}` })
      .click();
    await expect(
      page.getByRole("heading", { level: 2, name: youtube.recordingTitle })
    ).toBeVisible();
    await addNote(notesPanel(page), "Kayıttan: mâzînin on dört sîgası", "3:20");
    await expect(notesPanel(page).getByRole("listitem")).toContainText("3:20");

    await page.goto(sessionPath(youtube.id));
    await expect(notesPanel(page).getByRole("listitem")).toContainText(
      "Kayıttan: mâzînin on dört sîgası"
    );
    expect(await fixture.notesOf(talebe.sub as string, bunny.id)).toHaveLength(
      0
    );
  });

  test("on a pasted Bunny link: the time is typed, there is no position to take, and the note keeps it", async ({
    page,
  }) => {
    await blockBunny(page);
    const s = fixture.sessions.bunny;
    await page.goto(sessionPath(s.id));
    const panel = notesPanel(page);
    await expect(
      panel.getByText("Örneğin 12:34. Boş bırakabilirsin.")
    ).toBeVisible();
    await expect(panel.getByRole("button", { name: "Şimdiki an" })).toHaveCount(
      0
    );
    await addNote(panel, "Muzâride hurûf-i mudâraa: eyn", "12:34");
    await expect(panel.getByRole("listitem")).toContainText("12:34");
    // a typed time is a label here: there is no player to move
    await expect(
      panel.getByRole("button", { name: "Videoyu 12:34 anına götür" })
    ).toHaveCount(0);

    await page.goto(`/tr/courses/${fixture.courseId}?tab=kayitlar`);
    await expect(
      page.getByRole("heading", { level: 2, name: s.recordingTitle })
    ).toBeVisible();
    await expect(notesPanel(page).getByRole("listitem")).toContainText(
      "Muzâride hurûf-i mudâraa: eyn"
    );
    expect(await fixture.notesOf(talebe.sub as string, s.id)).toMatchObject([
      { offset_seconds: 754 },
    ]);
  });

  test("on a pasted Bunny link: the session page frames Bunny's player on the link tedrisat signed", async ({
    page,
  }) => {
    test.skip(
      !BUNNY_LIBRARY,
      "tedrisat runs without the dev Bunny library (E2E_BUNNY_LIBRARY_ID)"
    );
    await blockBunny(page);
    const s = fixture.sessions.bunny;
    await page.goto(sessionPath(s.id));
    const frame = page.locator(
      `iframe[title="Ders kaydı oynatıcısı: ${s.recordingTitle}"]`
    );
    await expect(frame).toHaveAttribute(
      "src",
      new RegExp(
        `^https://player\\.mediadelivery\\.net/embed/${BUNNY_LIBRARY}/${s.videoId}\\?token=[0-9a-f]{64}&expires=\\d+$`
      )
    );
    await expect(notesPanel(page)).toBeVisible();
  });

  test("while a session is on air with a live stream: the panel is beside the stream and takes a note", async ({
    page,
  }) => {
    const s = fixture.sessions.live;
    await page.goto(sessionPath(s.id));
    const main = page.getByRole("main");
    await expect(main.getByText("Şu an canlı").first()).toBeVisible();
    await expect(page.locator("#live-stream-frame")).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/jNQXAC9IVRw?enablejsapi=1"
    );
    await addNote(notesPanel(page), "Canlı derste: nehy lâ ile", "14:05");
    await expect(notesPanel(page).getByRole("listitem")).toContainText("14:05");
    expect(await fixture.notesOf(talebe.sub as string, s.id)).toMatchObject([
      { offset_seconds: 845, body: "Canlı derste: nehy lâ ile" },
    ]);
  });

  test("notes go with a video: no panel on a session on air with only a meeting link, one over with no recording, or one still to come", async ({
    page,
  }) => {
    const { liveLinkOnly, endedBare, upcoming } = fixture.sessions;
    await page.goto(sessionPath(liveLinkOnly.id));
    const main = page.getByRole("main");
    await expect(main.getByText("Şu an canlı").first()).toBeVisible();
    await expect(
      main.getByRole("link", { name: /Celseye katıl/ })
    ).toHaveAttribute("href", "https://zoom.us/j/741852963");
    await expect(notesPanel(page)).toHaveCount(0);

    await page.goto(sessionPath(endedBare.id));
    await expect(
      page
        .getByText("Bu celsede henüz ders kaydı yok.")
        .filter({ visible: true })
    ).toBeVisible();
    await expect(notesPanel(page)).toHaveCount(0);

    await page.goto(sessionPath(upcoming.id));
    await expect(
      page.getByRole("heading", { level: 1, name: upcoming.title })
    ).toBeVisible();
    await expect(notesPanel(page)).toHaveCount(0);
  });

  test("a passive course: no panel on the session page or the recordings tab, and the API closes the notes", async ({
    page,
  }) => {
    const undo = await fixture.enroll(
      talebe.sub as string,
      "ENROLLED",
      "passive"
    );
    try {
      const { courseId, sessionId } = fixture.passive;
      await page.goto(sessionPath(sessionId, courseId));
      await expect(
        page.getByRole("heading", { level: 1, name: "Emsile-i muhtelife" })
      ).toBeVisible();
      await expect(notesPanel(page)).toHaveCount(0);
      await expect(page.locator("iframe")).toHaveCount(0);

      await page.goto(`/tr/courses/${courseId}?tab=kayitlar`);
      await expect(
        page.getByRole("tab", { name: /Ders kayıtları/ })
      ).toHaveAttribute("aria-selected", "true");
      await expect(notesPanel(page)).toHaveCount(0);

      const write = await api(talebe, "POST", `/lessons/${sessionId}/notes`, {
        body: "pasif derste not",
        offsetSeconds: null,
      });
      expect([write.status, write.code]).toEqual([
        403,
        "LESSON_NOTE_FORBIDDEN",
      ]);
      const read = await api(talebe, "GET", `/lessons/${sessionId}/notes`);
      expect([read.status, read.code]).toEqual([403, "LESSON_NOTE_FORBIDDEN"]);
      expect(
        await fixture.notesOf(talebe.sub as string, sessionId)
      ).toHaveLength(0);
    } finally {
      await undo();
    }
  });
});

// The session page draws a locked session for an enrolled talebe whose
// content a passive scope closed as for a stranger: `lessonLockReason` answers
// "apply", and the application it sends is taken (201, still ENROLLED) and
// changes nothing. Found by this spec on 5 October; it fails until the page
// says what happened to the course.
test("an enrolled talebe of a passive course is not asked to apply for it on a session page", async ({
  page,
}) => {
  test.skip(!ready(talebe), "no Keycloak talebe in the environment");
  const undo = await fixture.enroll(
    talebe.sub as string,
    "ENROLLED",
    "passive"
  );
  try {
    await signIn(page, talebe);
    const { courseId, sessionId } = fixture.passive;
    await page.goto(sessionPath(sessionId, courseId));
    await expect(
      page.getByRole("heading", { level: 1, name: "Emsile-i muhtelife" })
    ).toBeVisible();
    // the course page itself tells them they are in it ("Devam ediyor")
    await expect(
      page.getByRole("button", { name: "Kayıt başvurusu yap" })
    ).toHaveCount(0);
    await expect(
      page
        .getByText(/Derse kaydolduğunda görebilirsin/)
        .filter({ visible: true })
    ).toHaveCount(0);
  } finally {
    await undo();
  }
});

test("nobody else reads a talebe's notes: a second enrolled talebe, the müderris and the başnazım see none, and the API answers 404", async ({
  browser,
}) => {
  test.skip(
    !ready(talebe, second, muderris, basnazim),
    "the talebe, a second account, the müderris and the başnazım are needed"
  );
  const s = fixture.sessions.youtube;
  const secret = "Kimse görmesin: istiğrak meselesi";
  const created = await api(talebe, "POST", `/lessons/${s.id}/notes`, {
    body: secret,
    offsetSeconds: 42,
  });
  expect(created.status).toBe(201);
  const noteId = (created.data as { id: string }).id;
  const undo = await fixture.enroll(second.sub as string, "ENROLLED");
  try {
    // Another talebe is told the note is not there. The müderris and the
    // başnazım write no notes at all, so an edit is refused before any note is
    // looked up: the same answer for this note as for one that does not exist.
    const missing = "a0000000-0000-4000-8000-0000000000ff";
    for (const [who, editAnswer] of [
      [second, [404, "LESSON_NOTE_NOT_FOUND"]],
      [muderris, [403, "LESSON_NOTE_FORBIDDEN"]],
      [basnazim, [403, "LESSON_NOTE_FORBIDDEN"]],
    ] as const) {
      const list = await api(who, "GET", `/lessons/${s.id}/notes`);
      expect(list.status).toBe(200);
      expect(JSON.stringify(list.data)).not.toContain(secret);
      for (const id of [noteId, missing]) {
        const edit = await api(who, "PATCH", `/lessons/${s.id}/notes/${id}`, {
          body: "değiştirildi",
        });
        expect([edit.status, edit.code]).toEqual(editAnswer);
        const gone = await api(who, "DELETE", `/lessons/${s.id}/notes/${id}`);
        expect([gone.status, gone.code]).toEqual([
          404,
          "LESSON_NOTE_NOT_FOUND",
        ]);
      }
    }
    expect(await fixture.notesOf(talebe.sub as string, s.id)).toMatchObject([
      { id: noteId, body: secret, offset_seconds: 42 },
    ]);

    // the second talebe has a panel of their own, empty
    const theirs = await pageAs(browser, second);
    await theirs.goto(sessionPath(s.id));
    await expect(
      notesPanel(theirs).getByText("Bu celse için henüz notun yok.")
    ).toBeVisible();
    expect(await theirs.content()).not.toContain(secret);
    await theirs.context().close();

    // the müderris and the başnazım are not talebe here: no panel at all
    for (const who of [muderris, basnazim]) {
      const page = await pageAs(browser, who);
      await page.goto(sessionPath(s.id));
      await expect(
        page.getByRole("heading", { level: 1, name: s.title })
      ).toBeVisible();
      await expect(notesPanel(page)).toHaveCount(0);
      expect(await page.content()).not.toContain(secret);
      await page.context().close();
    }
  } finally {
    await undo();
  }
});

test("a talebe who is not enrolled, waits for approval or was taken out has no panel, and the API takes no note from them", async ({
  page,
}) => {
  test.skip(!ready(second), "no second Keycloak account in the environment");
  const s = fixture.sessions.youtube;
  await signIn(page, second);
  for (const status of [null, "PENDING", "REVOKED"] as const) {
    const undo = status
      ? await fixture.enroll(second.sub as string, status)
      : undefined;
    try {
      await page.goto(sessionPath(s.id));
      await expect(
        page.getByRole("heading", { level: 1, name: s.title })
      ).toBeVisible();
      await expect(notesPanel(page)).toHaveCount(0);
      await expect(page.locator("iframe")).toHaveCount(0);
      const write = await api(second, "POST", `/lessons/${s.id}/notes`, {
        body: `${status ?? "kayıtsız"} not`,
        offsetSeconds: 1,
      });
      expect([status, write.status, write.code]).toEqual([
        status,
        403,
        "LESSON_NOTE_FORBIDDEN",
      ]);
    } finally {
      await undo?.();
    }
  }
  expect(await fixture.notesOf(second.sub as string, s.id)).toHaveLength(0);
});
