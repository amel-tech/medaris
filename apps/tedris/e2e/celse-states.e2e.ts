import { expect, type Page, test } from "@playwright/test";
import { type CelseStatesFixture, seedCelseStates } from "./celse-states-seed";

/**
 * Designs tedris/16 (session on air), 17 (session over, with its recording),
 * 19 (no access, B8) and 24 (recordings tab), against the running app and API
 * (MDRS-162). Since MDRS-285 the stream and the recording play on the
 * session's watch page, which its detail page and the recordings tab lead to. The lesson routes sit behind the auth middleware, so each spec
 * signs in through Keycloak: the enrolled talebe with E2E_TALEBE_EMAIL,
 * E2E_TALEBE_PASSWORD and E2E_TALEBE_SUB, and a second account who is not
 * enrolled with E2E_OTHER_EMAIL, E2E_OTHER_PASSWORD and E2E_OTHER_SUB. A spec
 * whose account is missing is skipped.
 */
let fixture: CelseStatesFixture;
const talebe = {
  email: process.env.E2E_TALEBE_EMAIL,
  password: process.env.E2E_TALEBE_PASSWORD,
  sub: process.env.E2E_TALEBE_SUB,
};
const other = {
  email: process.env.E2E_OTHER_EMAIL,
  password: process.env.E2E_OTHER_PASSWORD,
  sub: process.env.E2E_OTHER_SUB,
};
let removeEnrollment: (() => Promise<void>) | undefined;

test.beforeAll(async () => {
  fixture = await seedCelseStates();
  if (talebe.sub)
    removeEnrollment = await fixture.enroll(talebe.sub, "ENROLLED");
});

test.afterAll(async () => {
  await removeEnrollment?.();
  await fixture?.remove();
});

const signIn = async (
  page: Page,
  who: { email?: string; password?: string }
) => {
  await page.goto("/auth/signin");
  await page.locator("#username").fill(who.email as string);
  await page.locator("#password").fill(who.password as string);
  await page.locator("button[type=submit]").click();
  await page.waitForURL(/localhost:\d+/);
};

const sessionPath = (id: string) =>
  `/courses/${fixture.courseId}/lessons/${id}`;
const coursePath = () => `/courses/${fixture.courseId}`;
const watchPath = (id: string) => `${sessionPath(id)}/izle`;

test.describe("an enrolled talebe", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !(talebe.email && talebe.password && talebe.sub),
      "no Keycloak talebe in the environment"
    );
    await signIn(page, talebe);
  });

  test("tedris/16: a session on air says so, opens the meeting in a new tab, and leads to the stream on its watch page (MDRS-285)", async ({
    page,
  }) => {
    const s = fixture.sessions.live;
    await page.goto(sessionPath(s.id));
    const main = page.getByRole("main");
    await expect(main.getByText("Şu an canlı").first()).toBeVisible();
    await expect(main.getByText(/dakikadır sürüyor/)).toBeVisible();
    const join = main.getByRole("link", { name: /Toplantıya katıl/ });
    await expect(join).toHaveAttribute("href", fixture.meetingUrl);
    await expect(join).toHaveAttribute("target", "_blank");
    await expect(
      main.getByText(
        "Konuşmak ve soru sormak için toplantıya katıl; yalnız izleyeceksen yayını aç."
      )
    ).toBeVisible();
    // the detail page frames nothing itself
    await expect(page.locator("iframe")).toHaveCount(0);

    await main.getByRole("link", { name: "Yayını izle" }).click();
    await expect(page).toHaveURL(new RegExp(`/lessons/${s.id}/izle$`));
    // the stream's frame; the live chat has a frame of its own beside it
    await expect(page.locator("#watch-frame")).toHaveAttribute(
      "src",
      new RegExp(`youtube-nocookie\\.com/embed/${fixture.streamId}`)
    );
    await expect(page.getByTitle("Canlı sohbet")).toBeVisible();
    // the meeting link is on the detail page only (owner's decision 6)
    await expect(
      page.getByRole("link", { name: /Toplantıya katıl/ })
    ).toHaveCount(0);
    expect(await page.content()).not.toContain(fixture.meetingUrl);
    await page.getByRole("link", { name: "Celse ayrıntıları" }).click();
    await expect(page).toHaveURL(new RegExp(`/lessons/${s.id}$`));
  });

  test("tedris/16: the Müfredat row of the session on air is this celse's, and live (MDRS-289)", async ({
    page,
  }) => {
    await page.goto(sessionPath(fixture.sessions.live.id));
    await page.getByRole("button", { name: /^Müfredat: / }).click();
    const row = page
      .getByRole("listbox", { name: "Müfredat" })
      .getByRole("option", { selected: true });
    await expect(row.getByText(/Bu celse/)).toBeVisible();
    await expect(row.getByText(/Şu an canlı/)).toBeVisible();
    await page.goto(coursePath());
    await expect(
      page.getByText("Sıradaki · Şu an canlı").first()
    ).toBeVisible();
  });

  test("tedris/17: a session that is over leads to its recording on the watch page (MDRS-285)", async ({
    page,
  }) => {
    const s = fixture.sessions.ended;
    await page.goto(sessionPath(s.id));
    const main = page.getByRole("main");
    await expect(main.getByText("Sona erdi").first()).toBeVisible();
    await expect(page.locator("iframe")).toHaveCount(0);
    await main.getByRole("link", { name: "Kaydı izle" }).click();
    await expect(page).toHaveURL(new RegExp(`/lessons/${s.id}/izle$`));
    await expect(
      page.getByRole("heading", { name: s.recordingTitle })
    ).toBeVisible();
    await expect(page.locator("iframe:visible").first()).toHaveAttribute(
      "src",
      /^https:\/\/(www\.)?youtube-nocookie\.com\/embed\/9bZkp7q19f0/
    );
  });

  test("tedris/17: a recording still being prepared has no player, no watch page, and links to the tab", async ({
    page,
  }) => {
    const s = fixture.sessions.processing;
    await page.goto(sessionPath(s.id));
    const main = page.getByRole("main");
    await expect(main).toBeVisible();
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(main.getByRole("link", { name: "Kaydı izle" })).toHaveCount(0);
    // its watch page has nothing to play and sends the talebe back
    await page.goto(watchPath(s.id));
    await expect(page).toHaveURL(new RegExp(`${sessionPath(s.id)}$`));
    await page
      .getByRole("main")
      .getByRole("link", { name: /Ders kayıtlarına git/ })
      .click();
    await expect(page).toHaveURL(/tab=kayitlar/);
  });

  test("tedris/24: the tab lists the recordings by week, the one being prepared offering nothing, and a row opens its watch page (MDRS-285)", async ({
    page,
  }) => {
    await page.goto(`${coursePath()}?tab=kayitlar`);
    await expect(
      page.getByRole("tab", { name: /Ders kayıtları/ })
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("heading", { name: "Bütün ders kayıtları" })
    ).toBeVisible();
    await expect(
      page.getByText(fixture.sessions.ended.recordingTitle).first()
    ).toBeVisible();
    await expect(page.getByText("Hazırlanıyor").first()).toBeVisible();
    // no player in the tab any more
    await expect(page.locator("iframe")).toHaveCount(0);
    const { sample } = fixture.sessions;
    await page
      .getByRole("link", { name: `Kaydı izle: ${sample.recordingTitle}` })
      .click();
    await expect(page).toHaveURL(new RegExp(`/lessons/${sample.id}/izle$`));
    await expect(page.locator("iframe:visible").first()).toHaveAttribute(
      "src",
      /^https:\/\/(www\.)?youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/
    );
  });
});

test.describe("a caller who may not read the course", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !(other.email && other.password && other.sub),
      "no second Keycloak account in the environment"
    );
    await signIn(page, other);
  });

  test("tedris/19: the locked session names no link, no stream and no recording, and apply opens the window of tedris/07", async ({
    page,
  }) => {
    for (const s of [
      fixture.sessions.live,
      fixture.sessions.ended,
      fixture.sessions.processing,
    ]) {
      const response = await page.goto(sessionPath(s.id));
      const html = (await response?.text()) ?? "";
      expect(html).not.toContain(fixture.meetingUrl);
      expect(html).not.toContain(fixture.streamId);
      expect(html).not.toContain("9bZkp7q19f0");
      expect(html).not.toMatch(/href="[^"]*\/izle"/);
      await expect(page.locator("iframe")).toHaveCount(0);
      // the watch page keeps the detail page's gating (MDRS-285)
      await page.goto(watchPath(s.id));
      await expect(page).toHaveURL(new RegExp(`${sessionPath(s.id)}$`));
      await expect(page.locator("iframe")).toHaveCount(0);
    }
    await page.goto(sessionPath(fixture.sessions.ended.id));
    await expect(
      page
        .getByText(/Derse kaydolduğunda görebilirsin/)
        .filter({ visible: true })
    ).toBeVisible();
    await page.getByRole("button", { name: "Kayıt başvurusu yap" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Başvurun alındı")).toBeVisible();
    await dialog.getByRole("button", { name: "Tamam" }).click();
    // the card now says so instead of a button gone grey
    await expect(
      page.getByText("Başvurun onaylanınca bu celseye katılabilirsin.")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Kayıt başvurusu yap" })
    ).toHaveCount(0);
  });

  test("tedris/24: the tab shows only the public recording, opening it at its host, and no private link is in the page", async ({
    page,
  }) => {
    const response = await page.goto(`${coursePath()}?tab=kayitlar`);
    const html = (await response?.text()) ?? "";
    expect(html).not.toContain("9bZkp7q19f0");
    const { sample } = fixture.sessions;
    await expect(page.getByText(sample.recordingTitle).first()).toBeVisible();
    await expect(
      page.getByText(fixture.sessions.ended.recordingTitle)
    ).toHaveCount(0);
    // the watch page would send this caller to the locked card (MDRS-285)
    const open = page.getByRole("link", {
      name: `Ders kaydını aç: ${sample.recordingTitle} (yeni sekmede açılır)`,
    });
    await expect(open).toHaveAttribute("href", "https://youtu.be/dQw4w9WgXcQ");
    await expect(open).toHaveAttribute("target", "_blank");
    await expect(page.locator('a[href$="/izle"]')).toHaveCount(0);
  });
});
