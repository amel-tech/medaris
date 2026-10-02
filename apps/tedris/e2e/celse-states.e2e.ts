import { expect, type Page, test } from "@playwright/test";
import { type CelseStatesFixture, seedCelseStates } from "./celse-states-seed";

/**
 * Designs tedris/16 (session on air), 17 (session over, with its recording),
 * 19 (no access, B8) and 24 (recordings tab), against the running app and API
 * (MDRS-162). The lesson routes sit behind the auth middleware, so each spec
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
  await page.goto("/tr/auth/signin");
  await page.locator("#username").fill(who.email as string);
  await page.locator("#password").fill(who.password as string);
  await page.locator("button[type=submit]").click();
  await page.waitForURL(/localhost:\d+/);
};

const sessionPath = (id: string) =>
  `/tr/courses/${fixture.courseId}/lessons/${id}`;
const coursePath = () => `/tr/courses/${fixture.courseId}`;

test.describe("an enrolled talebe", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !(talebe.email && talebe.password && talebe.sub),
      "no Keycloak talebe in the environment"
    );
    await signIn(page, talebe);
  });

  test("tedris/16: a session on air says so, frames the stream and opens the meeting in a new tab", async ({
    page,
  }) => {
    await page.goto(sessionPath(fixture.sessions.live.id));
    const main = page.getByRole("main");
    await expect(main.getByText("Şu an canlı").first()).toBeVisible();
    await expect(main.getByText(/dakikadır sürüyor/)).toBeVisible();
    await expect(page.locator("iframe")).toHaveAttribute(
      "src",
      new RegExp(`youtube-nocookie\\.com/embed/${fixture.streamId}`)
    );
    const join = main.getByRole("link", { name: /Celseye katıl/ });
    await expect(join).toHaveAttribute("href", fixture.meetingUrl);
    await expect(join).toHaveAttribute("target", "_blank");
  });

  test("tedris/16: the Müfredat row of the session on air reads Sıradaki · Şu an canlı", async ({
    page,
  }) => {
    await page.goto(sessionPath(fixture.sessions.live.id));
    const programme = page.getByRole("region", { name: "Müfredat" });
    await expect(programme.getByText("Sıradaki · Şu an canlı")).toBeVisible();
    await page.goto(coursePath());
    await expect(
      page.getByText("Sıradaki · Şu an canlı").first()
    ).toBeVisible();
  });

  test("tedris/17: a session that is over plays its recording and links to the tab", async ({
    page,
  }) => {
    const s = fixture.sessions.ended;
    await page.goto(sessionPath(s.id));
    const main = page.getByRole("main");
    await expect(main.getByText("Sona erdi").first()).toBeVisible();
    await expect(
      main.getByRole("heading", { name: s.recordingTitle })
    ).toBeVisible();
    await expect(page.locator("iframe")).toHaveAttribute(
      "src",
      /^https:\/\/(www\.)?youtube-nocookie\.com\/embed\/9bZkp7q19f0/
    );
    await main.getByRole("link", { name: /Ders kayıtlarına git/ }).click();
    await expect(page).toHaveURL(/tab=kayitlar/);
  });

  test("tedris/17: a recording still being prepared has no player", async ({
    page,
  }) => {
    await page.goto(sessionPath(fixture.sessions.processing.id));
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.locator("iframe")).toHaveCount(0);
  });

  test("tedris/24: the tab lists the recordings by week, with the one being prepared offering nothing", async ({
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
    await page
      .getByRole("button", {
        name: `Oynat: ${fixture.sessions.sample.recordingTitle}`,
      })
      .click();
    await expect(page.locator("iframe")).toHaveAttribute(
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
      await expect(page.locator("iframe")).toHaveCount(0);
    }
    await page.goto(sessionPath(fixture.sessions.ended.id));
    await expect(
      page.getByText(/Derse kaydolduğunda görebilirsin/)
    ).toBeVisible();
    await page.getByRole("button", { name: "Kayıt başvurusu yap" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Başvurun alındı")).toBeVisible();
    await dialog.getByRole("button", { name: "Tamam" }).click();
    await expect(
      page.getByRole("button", { name: /Başvurun onay bekliyor/ })
    ).toBeDisabled();
  });

  test("tedris/24: the tab shows only the public recording, and no private link is in the page", async ({
    page,
  }) => {
    const response = await page.goto(`${coursePath()}?tab=kayitlar`);
    const html = (await response?.text()) ?? "";
    expect(html).not.toContain("9bZkp7q19f0");
    await expect(
      page.getByText(fixture.sessions.sample.recordingTitle).first()
    ).toBeVisible();
    await expect(
      page.getByText(fixture.sessions.ended.recordingTitle)
    ).toHaveCount(0);
  });
});
