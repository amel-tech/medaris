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
 * app and API, with real Keycloak sign-ins: the notes panel of the watch page
 * (MDRS-285), reached from the session's detail page and from the recordings
 * tab, on a YouTube recording, a pasted Bunny link and a live stream; on
 * every session with nothing to watch too, on its detail page under the join
 * card, timed by the session's clock while it is live (MDRS-266); and who
 * never reads them. Accounts: the enrolled talebe (E2E_TALEBE_*), a second
 * person enrolled or not as each test sets (see `second` in the seed), the
 * course's müderris (E2E_MUDERRIS_*) and the başnazım (E2E_SISTEM_ADMIN_*). A
 * test whose account is missing is skipped.
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
/** The session's watch page (MDRS-285). */
const watchPath = (id: string, courseId = fixture.courseId) =>
  `${sessionPath(id, courseId)}/izle`;

/** From the session's detail page to its watch page, by the join card's button (MDRS-285). */
async function openWatchPage(
  page: Page,
  id: string,
  button: "Yayını izle" | "Kaydı izle"
) {
  await page.goto(sessionPath(id));
  // the detail page plays nothing itself and takes no note on a video
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(notesPanel(page)).toHaveCount(0);
  await page.getByRole("main").getByRole("link", { name: button }).click();
  await expect(page).toHaveURL(new RegExp(`/lessons/${id}/izle$`));
}

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

/** The time field's name: the video's moment, or the session's with no video (MDRS-266). */
type TimeLabel = "Videodaki an" | "Celsedeki an";

/** Writes a note through the panel's form; an empty `time` leaves it without one. */
async function addNote(
  panel: Locator,
  body: string,
  time: string,
  timeLabel: TimeLabel = "Videodaki an"
) {
  const form = panel.locator("form");
  await form.getByLabel("Not", { exact: true }).fill(body);
  // Focusing the note takes the YouTube player's position when it has one,
  // or the session's clock while it is live and no video is on screen; the
  // time typed afterwards (or cleared) is the one that is saved.
  await form.getByLabel(timeLabel).fill(time);
  await form.getByRole("button", { name: "Notu ekle" }).click();
  await expect(form.getByLabel("Not", { exact: true })).toHaveValue("");
}

/** With no video on screen the panel is under the join card (MDRS-266). */
async function expectUnderJoinCard(page: Page) {
  await expect(notesPanel(page)).toBeVisible();
  // The detail page's main card (MDRS-289); the panel leads the column under it.
  const join = await page
    .getByRole("main")
    .getByTestId("session-action")
    .boundingBox();
  const notes = await notesPanel(page).boundingBox();
  if (!join || !notes) throw new Error("the main card or the panel has no box");
  expect(notes.y).toBeGreaterThanOrEqual(join.y + join.height);
}

/**
 * Edits the panel's one note on a session with no video to `body` at `time`,
 * then deletes it; the database follows each step (MDRS-266).
 */
async function editThenDelete(
  page: Page,
  lessonId: string,
  body: string,
  time: string,
  seconds: number | null
) {
  const panel = notesPanel(page);
  const items = panel.getByRole("listitem");
  await expect(items).toHaveCount(1);
  await panel.getByRole("button", { name: /^Notu düzenle, / }).click();
  const editing = items.filter({
    has: page.getByRole("button", { name: "Kaydet" }),
  });
  await editing.getByLabel("Not", { exact: true }).fill(body);
  await editing.getByLabel("Celsedeki an").fill(time);
  await editing.getByRole("button", { name: "Kaydet" }).click();
  await expect(panel.getByRole("button", { name: "Kaydet" })).toHaveCount(0);
  await expect(items).toContainText(body);
  expect(await fixture.notesOf(talebe.sub as string, lessonId)).toMatchObject([
    { body, offset_seconds: seconds },
  ]);

  await panel
    .getByRole("button", {
      name: `Notu sil, ${time === "" ? "Zamansız" : time}`,
    })
    .click();
  await expect(panel.getByText("Silinsin mi?")).toBeVisible();
  await panel.getByRole("button", { name: "Sil", exact: true }).click();
  await expect(items).toHaveCount(0);
  expect(await fixture.notesOf(talebe.sub as string, lessonId)).toEqual([]);
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

  test("on a YouTube recording's watch page, reached by Kaydı izle: adds a note with a time and one without, edits, deletes, and finds them after a reload", async ({
    page,
  }) => {
    const s = fixture.sessions.youtube;
    await openWatchPage(page, s.id, "Kaydı izle");
    // the frame carries YouTube's player API for the panel
    await expect(page.locator("#watch-frame")).toHaveAttribute(
      "src",
      "https://www.youtube.com/embed/9bZkp7q19f0?enablejsapi=1"
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
    await page.goto(watchPath(fixture.sessions.youtube.id));
    const panel = notesPanel(page);
    const current = panel.getByRole("button", { name: "Şimdiki an" });
    await expect(current).toBeVisible({ timeout: 30_000 });
    const time = panel.locator("form").getByLabel("Videodaki an");
    // the time sits beside "Şimdiki an"; what it takes is its description
    await expect(time).toHaveAccessibleDescription(
      "Oynatıcıdaki an yazılır; değiştirebilir ya da boş bırakabilirsin."
    );
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

  test("on the recordings tab: a row opens its session's watch page, whose panel takes the session's note (MDRS-285)", async ({
    page,
  }) => {
    await blockBunny(page);
    const { youtube, bunny } = fixture.sessions;
    await page.goto(`/tr/courses/${fixture.courseId}?tab=kayitlar`);
    await expect(
      page.getByRole("tab", { name: /Ders kayıtları/ })
    ).toHaveAttribute("aria-selected", "true");
    // the tab has no player and no panel of its own any more
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(notesPanel(page)).toHaveCount(0);

    await page
      .getByRole("link", { name: `Kaydı izle: ${youtube.recordingTitle}` })
      .click();
    await expect(page).toHaveURL(new RegExp(`/lessons/${youtube.id}/izle$`));
    await addNote(notesPanel(page), "Kayıttan: mâzînin on dört sîgası", "3:20");
    await expect(notesPanel(page).getByRole("listitem")).toContainText("3:20");

    await page.reload();
    await expect(notesPanel(page).getByRole("listitem")).toContainText(
      "Kayıttan: mâzînin on dört sîgası"
    );
    expect(await fixture.notesOf(talebe.sub as string, bunny.id)).toHaveLength(
      0
    );
  });

  for (const [label, size] of [
    ["a desktop window", { width: 1440, height: 900 }],
    ["a narrower desktop window", { width: 1180, height: 800 }],
  ] as const) {
    test(`on the watch page on ${label}: the video is the largest thing, the notes beside it, no join card, nothing wider than the screen (MDRS-285)`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await page.goto(watchPath(fixture.sessions.youtube.id));
      const panel = notesPanel(page);
      await expect(
        panel.getByText("Bu celse için henüz notun yok.")
      ).toBeVisible();
      const frame = page.locator("#watch-frame");
      const player = await frame.boundingBox();
      const notes = await panel.boundingBox();
      const questions = await page
        .getByRole("region", { name: "Soru sor" })
        .boundingBox();
      if (!player || !notes || !questions)
        throw new Error("the player or a panel has no box");
      // the video's column, then the side column of about 380 px
      expect(notes.x).toBeGreaterThanOrEqual(player.x + player.width);
      expect(questions.y).toBeLessThan(notes.y);
      expect(player.width).toBeGreaterThan(notes.width);
      expect(player.width * player.height).toBeGreaterThan(
        notes.width * notes.height
      );
      expect(player.width / player.height).toBeCloseTo(16 / 9, 1);
      await expect(page.getByTestId("session-action")).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: /Toplantıya katıl/ })
      ).toHaveCount(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth)
      ).toBeLessThanOrEqual(size.width);
    });
  }

  test("on the watch page on a phone: the video first, then the title, then two tabs for the questions and the notes (MDRS-285)", async ({
    page,
  }) => {
    const size = { width: 390, height: 844 };
    await page.setViewportSize(size);
    const s = fixture.sessions.youtube;
    await page.goto(watchPath(s.id));
    const player = await page.locator("#watch-frame").boundingBox();
    const title = await page
      .getByRole("heading", { level: 1, name: new RegExp(s.title) })
      .boundingBox();
    if (!player || !title)
      throw new Error("the player or the title has no box");
    expect(title.y).toBeGreaterThanOrEqual(player.y + player.height);
    expect(player.width).toBeGreaterThan(size.width - 2);

    const questionsTab = page.getByRole("button", { name: "Soru sor" });
    const notesTab = page.getByRole("button", { name: "Notlarım" });
    await expect(questionsTab).toHaveAttribute("aria-pressed", "true");
    await expect(notesPanel(page)).toBeHidden();
    await notesTab.click();
    await expect(notesTab).toHaveAttribute("aria-pressed", "true");
    await expect(notesPanel(page)).toBeVisible();
    await expect(page.getByRole("region", { name: "Soru sor" })).toBeHidden();
    await expect(page.getByTestId("session-action")).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(size.width);
  });

  test("on the course page, switching to the recordings tab and back leaves the tab row where it was clicked", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/tr/courses/${fixture.courseId}`);
    await page.evaluate(() => document.fonts.ready);
    const row = page.getByRole("tablist");
    const top = async () => (await row.boundingBox())?.y ?? Number.NaN;
    const before = await top();
    await page.getByRole("tab", { name: /Ders kayıtları/ }).click();
    await expect(
      page.getByRole("heading", { name: "Bütün ders kayıtları" })
    ).toBeVisible();
    expect(Math.abs((await top()) - before)).toBeLessThanOrEqual(1);
    await page.getByRole("tab", { name: /Müfredat/ }).click();
    expect(Math.abs((await top()) - before)).toBeLessThanOrEqual(1);
  });

  test("on a pasted Bunny link: the time is typed, there is no position to take, and the note keeps it", async ({
    page,
  }) => {
    await blockBunny(page);
    const s = fixture.sessions.bunny;
    await openWatchPage(page, s.id, "Kaydı izle");
    const panel = notesPanel(page);
    await expect(
      panel.getByText("İsteğe bağlı: oynatıcıdaki süreyi yaz.")
    ).toBeVisible();
    await expect(
      panel.locator("form").getByLabel("Videodaki an")
    ).toHaveAccessibleDescription("İsteğe bağlı: oynatıcıdaki süreyi yaz.");
    await expect(panel.getByRole("button", { name: "Şimdiki an" })).toHaveCount(
      0
    );
    await addNote(panel, "Muzâride hurûf-i mudâraa: eyn", "12:34");
    await expect(panel.getByRole("listitem")).toContainText("12:34");
    // a typed time is a label here: there is no player to move
    await expect(
      panel.getByRole("button", { name: "Videoyu 12:34 anına götür" })
    ).toHaveCount(0);

    // the same note, reached from the recordings tab's row
    await page.goto(`/tr/courses/${fixture.courseId}?tab=kayitlar`);
    await page
      .getByRole("link", { name: `Kaydı izle: ${s.recordingTitle}` })
      .click();
    await expect(page).toHaveURL(new RegExp(`/lessons/${s.id}/izle$`));
    await expect(notesPanel(page).getByRole("listitem")).toContainText(
      "Muzâride hurûf-i mudâraa: eyn"
    );
    expect(await fixture.notesOf(talebe.sub as string, s.id)).toMatchObject([
      { offset_seconds: 754 },
    ]);
  });

  test("on a pasted Bunny link: the watch page frames Bunny's player on the link tedrisat signed", async ({
    page,
  }) => {
    test.skip(
      !BUNNY_LIBRARY,
      "tedrisat runs without the dev Bunny library (E2E_BUNNY_LIBRARY_ID)"
    );
    await blockBunny(page);
    const s = fixture.sessions.bunny;
    await page.goto(watchPath(s.id));
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

  test("while a session is on air with a live stream: the detail page keeps the meeting link and leads to the watch page, whose panel is beside the stream and takes a note (MDRS-285)", async ({
    page,
  }) => {
    const s = fixture.sessions.live;
    await page.goto(sessionPath(s.id));
    const main = page.getByRole("main");
    await expect(main.getByText("Şu an canlı").first()).toBeVisible();
    await expect(
      main.getByRole("link", { name: /Toplantıya katıl/ })
    ).toHaveAttribute("href", "https://zoom.us/j/741852963");
    await openWatchPage(page, s.id, "Yayını izle");
    await expect(page.locator("#watch-frame")).toHaveAttribute(
      "src",
      "https://www.youtube.com/embed/jNQXAC9IVRw?enablejsapi=1"
    );
    // the live chat beside it, and no way into the meeting here
    await expect(page.getByTitle("Canlı sohbet")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Toplantıya katıl/ })
    ).toHaveCount(0);
    expect(await page.content()).not.toContain("zoom.us");
    await addNote(notesPanel(page), "Canlı derste: nehy lâ ile", "14:05");
    await expect(notesPanel(page).getByRole("listitem")).toContainText("14:05");
    expect(await fixture.notesOf(talebe.sub as string, s.id)).toMatchObject([
      { offset_seconds: 845, body: "Canlı derste: nehy lâ ile" },
    ]);
  });

  test("on a session on air with only a meeting link: the panel is under the join card, the time is the clock's since the start, and the note is taken, edited and deleted (MDRS-266)", async ({
    page,
  }) => {
    const s = fixture.sessions.liveLinkOnly;
    await page.goto(sessionPath(s.id));
    const main = page.getByRole("main");
    await expect(main.getByText("Şu an canlı").first()).toBeVisible();
    await expect(
      main.getByRole("link", { name: /Toplantıya katıl/ })
    ).toHaveAttribute("href", "https://zoom.us/j/741852963");
    await expectUnderJoinCard(page);
    await expect(page.locator("iframe")).toHaveCount(0);
    // nothing to watch: no way to a watch page (MDRS-285)
    await expect(main.getByRole("link", { name: /izle$/ })).toHaveCount(0);

    const panel = notesPanel(page);
    const form = panel.locator("form");
    const time = form.getByLabel("Celsedeki an");
    await expect(time).toHaveAccessibleDescription(
      "Celsenin başından beri geçen süre yazılır; değiştirebilir ya da boş bırakabilirsin."
    );
    // the session began 5 minutes before the seed ran, and lasts 60
    const sinceStart = /^([5-9]|[1-5]\d):\d{2}$/;
    await form.getByLabel("Not", { exact: true }).focus();
    await expect(time).toHaveValue(sinceStart);
    await time.fill("");
    await panel.getByRole("button", { name: "Şimdiki an" }).click();
    await expect(time).toHaveValue(sinceStart);

    // saved as it stands, then corrected and deleted
    await form
      .getByLabel("Not", { exact: true })
      .fill("Zoom derste: nehy lâ ile");
    await form.getByRole("button", { name: "Notu ekle" }).click();
    await expect(form.getByLabel("Not", { exact: true })).toHaveValue("");
    const [taken] = await fixture.notesOf(talebe.sub as string, s.id);
    expect(taken.offset_seconds).toBeGreaterThanOrEqual(300);
    expect(taken.offset_seconds).toBeLessThan(3600);
    await editThenDelete(
      page,
      s.id,
      "Zoom derste: nehy lâ ile, kayıt iki dakika geç başladı",
      "2:10",
      130
    );
  });

  test("on a session with only a meeting link still to come, and on one over with no recording: the panel is under the join card, the time is typed or left empty, and the note is taken, edited and deleted (MDRS-266)", async ({
    page,
  }) => {
    const { upcoming, endedBare } = fixture.sessions;
    await page.goto(sessionPath(upcoming.id));
    await expect(
      page.getByRole("heading", { level: 1, name: upcoming.title })
    ).toBeVisible();
    await expectUnderJoinCard(page);
    let panel = notesPanel(page);
    await expect(
      panel.getByText("Bu celse için henüz notun yok.")
    ).toBeVisible();
    const time = panel.locator("form").getByLabel("Celsedeki an");
    await expect(time).toHaveAccessibleDescription(
      "İsteğe bağlı: celsenin başından beri geçen süreyi yaz."
    );
    await expect(panel.getByRole("button", { name: "Şimdiki an" })).toHaveCount(
      0
    );
    await panel.locator("form").getByLabel("Not", { exact: true }).focus();
    await expect(time).toHaveValue("");
    await addNote(panel, "Hazırlık: ism-i fâil", "", "Celsedeki an");
    await expect(panel.getByRole("listitem")).toContainText("Zamansız");
    expect(
      await fixture.notesOf(talebe.sub as string, upcoming.id)
    ).toMatchObject([{ offset_seconds: null }]);
    await editThenDelete(
      page,
      upcoming.id,
      "Hazırlık: ism-i fâil ve ism-i mef‘ûl",
      "0:45",
      45
    );

    await page.goto(sessionPath(endedBare.id));
    await expect(
      page
        .getByText("Bu celsede henüz ders kaydı yok.")
        .filter({ visible: true })
    ).toBeVisible();
    await expectUnderJoinCard(page);
    panel = notesPanel(page);
    await expect(panel.getByRole("button", { name: "Şimdiki an" })).toHaveCount(
      0
    );
    await addNote(panel, "Emr-i hâzırda hazf", "12:34", "Celsedeki an");
    await expect(panel.getByRole("listitem")).toContainText("12:34");
    expect(
      await fixture.notesOf(talebe.sub as string, endedBare.id)
    ).toMatchObject([{ offset_seconds: 754 }]);
    await editThenDelete(
      page,
      endedBare.id,
      "Emr-i hâzırda hazf ve bina",
      "",
      null
    );
  });

  test("on an in-person session on air: the card says so, the panel is under it, and the time is the clock's since the start (MDRS-266)", async ({
    page,
  }) => {
    const s = fixture.sessions.inPerson;
    await page.goto(sessionPath(s.id));
    const main = page.getByRole("main");
    await expect(main.getByText("Şu an canlı").first()).toBeVisible();
    await expect(
      main.getByText(
        "Bu celse yüz yüze yapılır. Kaydı eklenirse burada yayımlanır."
      )
    ).toBeVisible();
    await expect(
      main.getByRole("link", { name: /Toplantıya katıl/ })
    ).toHaveCount(0);
    await expectUnderJoinCard(page);

    const form = notesPanel(page).locator("form");
    await form.getByLabel("Not", { exact: true }).focus();
    // the session began 20 minutes before the seed ran, and lasts 60
    await expect(form.getByLabel("Celsedeki an")).toHaveValue(
      /^[2-5]\d:\d{2}$/
    );
    await form
      .getByLabel("Not", { exact: true })
      .fill("Yüz yüze derste: emr-i gâib");
    await form.getByRole("button", { name: "Notu ekle" }).click();
    await expect(form.getByLabel("Not", { exact: true })).toHaveValue("");
    const [taken] = await fixture.notesOf(talebe.sub as string, s.id);
    expect(taken.offset_seconds).toBeGreaterThanOrEqual(1200);
    expect(taken.offset_seconds).toBeLessThan(3600);
    await editThenDelete(
      page,
      s.id,
      "Yüz yüze derste: emr-i gâib ve lâm-ı emr",
      "21:00",
      1260
    );
  });

  test("no panel on a cancelled session (MDRS-266)", async ({ page }) => {
    const s = fixture.sessions.cancelled;
    await page.goto(sessionPath(s.id));
    await expect(
      page.getByRole("heading", { level: 1, name: s.title })
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByText("Bu celse iptal edildi")
    ).toBeVisible();
    await expect(notesPanel(page)).toHaveCount(0);
  });

  test("a passive course: no panel on the session page or the recordings tab, no watch page, and the API closes the notes", async ({
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
      // its watch page sends them back to the detail page's locked card
      await page.goto(watchPath(sessionId, courseId));
      await expect(page).toHaveURL(
        new RegExp(`${sessionPath(sessionId, courseId)}$`)
      );
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
// changes nothing. Found by this spec on 5 October (MDRS-265); it is marked
// as an expected failure until the page says what happened to the course, and
// Playwright reports it the day it starts to pass.
test("an enrolled talebe of a passive course is not asked to apply for it on a session page", async ({
  page,
}) => {
  test.skip(!ready(talebe), "no Keycloak talebe in the environment");
  test.fail(
    true,
    "MDRS-265: lessonLockReason answers apply for an enrolled talebe"
  );
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
    await theirs.goto(watchPath(s.id));
    await expect(
      notesPanel(theirs).getByText("Bu celse için henüz notun yok.")
    ).toBeVisible();
    expect(await theirs.content()).not.toContain(secret);
    await theirs.context().close();

    // the müderris and the başnazım are not talebe here: no panel at all,
    // beside the video or on the detail page
    for (const who of [muderris, basnazim]) {
      const page = await pageAs(browser, who);
      await page.goto(watchPath(s.id));
      await expect(
        page.getByRole("heading", { level: 1, name: new RegExp(s.title) })
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
      // the watch page sends them to the detail page's locked card (MDRS-285)
      await page.goto(watchPath(s.id));
      await expect(page).toHaveURL(new RegExp(`${sessionPath(s.id)}$`));
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
