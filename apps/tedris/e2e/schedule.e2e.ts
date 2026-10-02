import { expect, type Page, test } from "@playwright/test";
import { pgClient } from "./pg-client";
import { type ScheduleFixture, seedSchedule } from "./schedule-seed";

/**
 * Designs tedris/21 (Programım), 22 (Takvime ekle), 23 (Takvim aboneliği) and
 * 44 (the signed-in phone menu), against the running app and API. Every spec
 * signs in through Keycloak as `e2e-talebe` — E2E_TALEBE_EMAIL,
 * E2E_TALEBE_PASSWORD and E2E_TALEBE_SUB — and is skipped when they are unset.
 */
let fixture: ScheduleFixture;
const talebe = {
  email: process.env.E2E_TALEBE_EMAIL,
  password: process.env.E2E_TALEBE_PASSWORD,
  sub: process.env.E2E_TALEBE_SUB,
};
const removals: Array<() => Promise<void>> = [];

test.beforeAll(async () => {
  if (!(talebe.email && talebe.password && talebe.sub)) return;
  fixture = await seedSchedule();
  removals.push(await fixture.enroll(talebe.sub, "a"));
  removals.push(await fixture.enroll(talebe.sub, "b"));
  removals.push(await fixture.enroll(talebe.sub, "pending"));
});

test.afterAll(async () => {
  for (const remove of removals) await remove();
  await fixture?.remove();
  if (talebe.sub) {
    const db = await pgClient();
    await db.query("delete from calendar_feed_tokens where user_id = $1", [
      talebe.sub,
    ]);
    await db.end();
  }
});

test.beforeEach(async ({ page }) => {
  test.skip(
    !(talebe.email && talebe.password && talebe.sub),
    "no Keycloak talebe in the environment"
  );
  await signIn(page);
});

const signIn = async (page: Page) => {
  await page.goto("/tr/auth/signin");
  await page.locator("#username").fill(talebe.email as string);
  await page.locator("#password").fill(talebe.password as string);
  await page.locator("button[type=submit]").click();
  await page.waitForURL(/localhost:4000/);
};

/** The day group a session sits in, found by the session's title. */
const group = (page: Page, title: string) =>
  page.locator("section.mds-card", { has: page.getByText(title) });

/** Text that is on screen: Next keeps the page it navigated away from, hidden, in the DOM. */
const shown = (page: Page, text: string) =>
  page.getByText(text).filter({ visible: true });

/** One session's row, found by its title: other sessions of the shared database may share its day. */
const row = (page: Page, title: string) =>
  page.locator("li", { has: page.getByRole("link", { name: title }) });

test.describe("Programım (tedris/21)", () => {
  test("lists the enrolled courses' sessions grouped by day, soonest first", async ({
    page,
  }) => {
    const t = fixture.titles;
    const response = await page.goto("/tr/schedule");
    expect(response?.status()).toBe(200);
    const main = page.getByRole("main");
    await expect(
      main.getByRole("heading", { level: 1, name: "Programım" })
    ).toBeVisible();
    await expect(
      main.getByText(
        "Kayıtlı olduğun derslerin önümüzdeki yedi gündeki celseleri."
      )
    ).toBeVisible();
    await expect(main.getByText("Saatler İstanbul saatiyle.")).toBeVisible();
    await expect(
      main.getByRole("link", { name: "Saat dilimini değiştir" })
    ).toBeVisible();
    await expect(
      main.getByRole("link", { name: "Takvim aboneliği" })
    ).toBeVisible();

    // Day 2, day 3 (two courses), day 4.
    await expect(group(page, t.a1).getByText("Öbür gün")).toBeVisible();
    await expect(group(page, t.a2).getByText("3 gün sonra")).toBeVisible();
    await expect(group(page, t.a3).getByText("4 gün sonra")).toBeVisible();
    // A2 (20:00) comes before B1 (21:00), in the same group.
    const day3 = group(page, t.a2);
    await expect(day3.getByText(t.b1)).toBeVisible();
    const titles = (await day3.locator("ul a").allTextContents()).filter(
      (title) => title === t.a2 || title === t.b1
    );
    expect(titles).toEqual([t.a2, t.b1]);

    const a1 = row(page, t.a1);
    await expect(a1.getByText("21:00")).toBeVisible();
    await expect(a1.getByText("60 dk")).toBeVisible();
    await expect(a1.getByText(fixture.courseTitles.a)).toBeVisible();
    await expect(a1.getByText("Hafta 5")).toBeVisible();
    await expect(a1.getByText("Planlandı")).toBeVisible();
    await expect(
      a1.getByText("Toplantı bağlantısı henüz eklenmedi.")
    ).toBeVisible();
    await expect(row(page, t.b1).locator(".mds-platform-chip")).toHaveText(
      "Zoom"
    );
  });

  test("lists a cancelled session as İptal edildi with its note, and leaves out a pending and a foreign course", async ({
    page,
  }) => {
    const t = fixture.titles;
    await page.goto("/tr/schedule");
    const cancelled = row(page, t.a2);
    await expect(cancelled.getByText("İptal edildi")).toBeVisible();
    await expect(cancelled.getByText("Bu celse iptal edildi.")).toBeVisible();
    await expect(cancelled.getByText("Planlandı")).toHaveCount(0);
    await expect(
      cancelled.getByRole("button", { name: /Takvime ekle/ })
    ).toHaveCount(0);
    await expect(page.getByText(t.pending)).toHaveCount(0);
    await expect(page.getByText(t.other)).toHaveCount(0);
  });

  test("'Sonraki yedi günü göster' moves the window, and the row opens the session", async ({
    page,
  }) => {
    const t = fixture.titles;
    await page.goto("/tr/schedule");
    await expect(shown(page, t.b2)).toHaveCount(0);
    await page.getByRole("link", { name: "Sonraki yedi günü göster" }).click();
    await expect(page).toHaveURL(/\/tr\/schedule\?from=\d{4}-\d{2}-\d{2}/);
    await expect(shown(page, t.b2)).toBeVisible();
    await expect(shown(page, t.a1)).toHaveCount(0);
    await page.getByRole("link", { name: "Bugüne dön" }).click();
    await expect(shown(page, t.a1)).toBeVisible();

    await page.getByRole("link", { name: t.a1 }).click();
    await expect(page).toHaveURL(
      new RegExp(`/courses/${fixture.courseIds.a}/lessons/${fixture.ids.a1}`)
    );
    await expect(
      page.getByRole("heading", { level: 1, name: t.a1 })
    ).toBeVisible();
  });

  test("a bad ?from= falls back to today", async ({ page }) => {
    await page.goto("/tr/schedule?from=bugün");
    await expect(shown(page, fixture.titles.a1)).toBeVisible();
  });
});

test.describe("Takvime ekle (tedris/22)", () => {
  test("opens three rows and a note, and closes with Esc", async ({ page }) => {
    await page.goto("/tr/schedule");
    await page
      .getByRole("button", { name: `Takvime ekle: ${fixture.titles.a1}` })
      .click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem")).toHaveText([
      "Google Takvim (yeni sekmede açılır)",
      "Apple Takvim (.ics)",
      "Tüm derslerime abone ol",
    ]);
    await expect(
      menu.getByText(
        "Takvim kaydı bu celse sayfasına bağlanır; toplantı bağlantısı takvime yazılmaz."
      )
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  });

  test("Google opens a pre-filled event in a new tab, with the session page and no meeting link", async ({
    page,
  }) => {
    await page.goto("/tr/schedule");
    await page
      .getByRole("button", { name: `Takvime ekle: ${fixture.titles.b1}` })
      .click();
    // Google would answer a signed-out browser with its landing page, so the
    // call is captured, not followed.
    await page.evaluate(() => {
      (window as unknown as { opened: string[][] }).opened = [];
      window.open = (...args: unknown[]) => {
        (window as unknown as { opened: string[][] }).opened.push(
          args as string[]
        );
        return null;
      };
    });
    await page
      .getByRole("menuitem", { name: "Google Takvim (yeni sekmede açılır)" })
      .click();
    const [href, target, features] = await page.evaluate(
      () => (window as unknown as { opened: string[][] }).opened[0]
    );
    expect(target).toBe("_blank");
    expect(features).toContain("noopener");
    const url = new URL(href);
    expect(url.hostname).toBe("calendar.google.com");
    expect(url.searchParams.get("text")).toBe(
      `${fixture.courseTitles.b} — ${fixture.titles.b1}`
    );
    expect(url.searchParams.get("dates")).toMatch(
      /^\d{8}T\d{6}Z\/\d{8}T\d{6}Z$/
    );
    expect(url.searchParams.get("details")).toContain(
      `/courses/${fixture.courseIds.b}/lessons/${fixture.ids.b1}`
    );
    expect(url.toString()).not.toContain("zoom.us");
  });

  test("the .ics file holds one event with a stable UID and no meeting link", async ({
    page,
  }) => {
    await page.goto("/tr/schedule");
    await page
      .getByRole("button", { name: `Takvime ekle: ${fixture.titles.b1}` })
      .click();
    const download = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "Apple Takvim (.ics)" }).click();
    const file = await download;
    const path = await file.path();
    const ics = (await import("node:fs")).readFileSync(path as string, "utf8");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain(`UID:lesson-${fixture.ids.b1}@medaris.app`);
    expect(ics).not.toContain("zoom.us");
    expect(ics).not.toContain("STATUS:CANCELLED");
  });

  test("'Tüm derslerime abone ol' goes to the subscription", async ({
    page,
  }) => {
    await page.goto("/tr/schedule");
    await page
      .getByRole("button", { name: `Takvime ekle: ${fixture.titles.a1}` })
      .click();
    await page
      .getByRole("menuitem", { name: "Tüm derslerime abone ol" })
      .click();
    await expect(page).toHaveURL(/\/tr\/account\/calendar/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Takvim aboneliği" })
    ).toBeVisible();
  });

  test("the session page's menu has the same rows, and none on a cancelled session", async ({
    page,
  }) => {
    await page.goto(
      `/tr/courses/${fixture.courseIds.a}/lessons/${fixture.ids.a1}`
    );
    await page.getByRole("button", { name: "Takvime ekle" }).click();
    await expect(page.getByRole("menuitem")).toHaveText([
      "Google Takvim (yeni sekmede açılır)",
      "Apple Takvim (.ics)",
      "Tüm derslerime abone ol",
    ]);
    await page.keyboard.press("Escape");
    await page.goto(
      `/tr/courses/${fixture.courseIds.a}/lessons/${fixture.ids.a2}`
    );
    await expect(
      page.getByRole("heading", { level: 1, name: fixture.titles.a2 })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Takvime ekle" })
    ).toHaveCount(0);
  });
});

test.describe("Takvim aboneliği (tedris/23)", () => {
  test.beforeEach(async () => {
    const db = await pgClient();
    await db.query("delete from calendar_feed_tokens where user_id = $1", [
      talebe.sub,
    ]);
    await db.end();
  });

  const feedPath = (url: string) => new URL(url).pathname;

  test("creates the link once, serves the feed, hides the link on reload and revokes the old one on renewal", async ({
    page,
    request,
  }) => {
    const t = fixture.titles;
    await page.goto("/tr/account/calendar");
    await expect(
      page.getByRole("heading", { level: 1, name: "Takvim aboneliği" })
    ).toBeVisible();
    await expect(
      page.getByText("Henüz bir takvim bağlantın yok.")
    ).toBeVisible();
    await expect(page.getByText("Takvimine nasıl eklenir")).toBeVisible();
    await expect(page.getByText("Bu takvimde neler var")).toBeVisible();
    await expect(page.getByText("Bağlantın sana özel")).toBeVisible();
    await expect(
      page.getByText("Google değişiklikleri geç gösterebilir")
    ).toBeVisible();

    await page.getByRole("button", { name: "Bağlantı oluştur" }).click();
    await expect(page.getByText("Bağlantını şimdi kopyala")).toBeVisible();
    const google = page.locator("#calendar-google");
    const apple = page.locator("#calendar-apple");
    const url = await google.inputValue();
    expect(url).toMatch(/\/calendar\/[A-Za-z0-9_-]{43}\.ics$/);
    expect(await apple.inputValue()).toMatch(/^webcal:\/\//);
    await expect(google).toHaveAttribute("dir", "ltr");
    await expect(google).toHaveAttribute("readonly", "");
    await expect(
      page.getByRole("link", { name: "Apple Takvim’de aç" })
    ).toHaveAttribute("href", /^webcal:\/\//);
    await expect(page.getByText(/Oluşturuldu:/)).toBeVisible();

    // The feed, through tedris-web's own route, as a calendar app would read it.
    const feed = await request.get(feedPath(url));
    expect(feed.status()).toBe(200);
    expect(feed.headers()["content-type"]).toContain("text/calendar");
    const ics = await feed.text();
    expect(ics).toContain(`UID:lesson-${fixture.ids.a1}@medaris.app`);
    expect(ics).toContain(`UID:lesson-${fixture.ids.b1}@medaris.app`);
    expect(ics).toContain(`UID:lesson-${fixture.ids.b2}@medaris.app`);
    expect(ics).not.toContain(t.pending);
    expect(ics).not.toContain(t.other);
    expect(ics).not.toContain("zoom.us");
    // The cancelled session is in the feed, marked.
    const cancelled = new RegExp(
      `UID:lesson-${fixture.ids.a2}@medaris.app[\\s\\S]*?STATUS:CANCELLED[\\s\\S]*?END:VEVENT`
    );
    expect(ics.replace(/\r\n /g, "")).toMatch(cancelled);

    // Reloading cannot show it again.
    await page.reload();
    await expect(page.getByText("Bağlantını şimdi kopyala")).toHaveCount(0);
    await expect(page.locator("#calendar-google")).toHaveValue(/^•+$/);
    expect((await page.content()).includes(feedPath(url))).toBe(false);

    // Renewing asks first; the old URL stops working and the new one works.
    await page.getByRole("button", { name: "Bağlantıyı yenile" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByText("Bağlantı yenilensin mi?")).toBeVisible();
    await dialog.getByRole("button", { name: "Vazgeç" }).click();
    expect((await request.get(feedPath(url))).status()).toBe(200);
    await page.getByRole("button", { name: "Bağlantıyı yenile" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Yenile" })
      .click();
    await expect(page.getByText("Bağlantını şimdi kopyala")).toBeVisible();
    const renewed = await page.locator("#calendar-google").inputValue();
    expect(renewed).not.toBe(url);
    expect((await request.get(feedPath(url))).status()).toBe(404);
    expect((await request.get(feedPath(renewed))).status()).toBe(200);
  });

  test("'Kopyala' puts the address on the clipboard", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/tr/account/calendar");
    await page.getByRole("button", { name: "Bağlantı oluştur" }).click();
    const google = await page.locator("#calendar-google").inputValue();
    const apple = await page.locator("#calendar-apple").inputValue();
    await page
      .getByRole("button", { name: "Google Takvim bağlantısını kopyala" })
      .click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      google
    );
    await expect(page.getByText("Bağlantı kopyalandı")).toBeVisible();
    await page
      .getByRole("button", { name: "Apple Takvim bağlantısını kopyala" })
      .click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      apple
    );
  });

  test("the old address redirects here", async ({ page }) => {
    await page.goto("/tr/learning/calendar");
    await expect(page).toHaveURL(/\/tr\/account\/calendar/);
  });
});

test.describe("the signed-in phone menu (tedris/44)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  const open = async (page: Page) => {
    await page.goto("/tr/home");
    await page.getByRole("button", { name: "Menü" }).click();
    return page.getByRole("dialog", { name: "Ana menü" });
  };

  test("opens a sheet with the logo, five pages and the person, focus on the close button, and no 'Çıkış yap'", async ({
    page,
  }) => {
    const sheet = await open(page);
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Kapat" })).toBeFocused();
    const nav = sheet.getByRole("navigation", { name: "Ana menü" });
    await expect(nav.getByRole("link")).toHaveText([
      "Ana sayfa",
      "Keşfet",
      "Derslerim",
      "Programım",
      "Desteler",
    ]);
    await expect(nav.getByRole("link", { name: "Ana sayfa" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(sheet.getByText("Çıkış yap")).toHaveCount(0);
    const person = sheet.locator("a.mds-nav-user");
    await expect(person).toHaveAttribute("href", /\/tr\/account$/);
    await expect(person.locator(".mds-nav-user__role")).toHaveText("Talebe");
  });

  test("a menu item goes to its page and closes the sheet", async ({
    page,
  }) => {
    const sheet = await open(page);
    await sheet.getByRole("link", { name: "Programım" }).click();
    await expect(page).toHaveURL(/\/tr\/schedule/);
    await expect(page.getByRole("dialog", { name: "Ana menü" })).toHaveCount(0);
    await expect(
      page.getByRole("heading", { level: 1, name: "Programım" })
    ).toBeVisible();
    await expect(page.locator("[data-legacy-header]")).toBeHidden();
  });

  test("closes when the window widens to 768 px", async ({ page }) => {
    const sheet = await open(page);
    await expect(sheet).toBeVisible();
    await page.setViewportSize({ width: 1024, height: 900 });
    await expect(sheet).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Menü" })).toBeHidden();
  });

  test("Ana sayfa shows the next session as a card with its page and the calendar", async ({
    page,
  }) => {
    await page.goto("/tr/home");
    const main = page.getByRole("main");
    await expect(
      main.getByRole("heading", { name: /Selâmün aleyküm/ })
    ).toBeVisible();
    await expect(main.getByText(/Sıradaki celsen:/)).toBeVisible();
    const card = main.locator(".mds-card", { hasText: "Sıradaki celse" });
    await expect(card).toBeVisible();
    await expect(
      card.getByRole("link", { name: "Celse sayfası" })
    ).toHaveAttribute("href", /\/courses\/[0-9a-f-]+\/lessons\/[0-9a-f-]+/);
    await expect(
      card.getByRole("button", { name: "Takvime ekle" })
    ).toBeVisible();
    await expect(main.getByRole("link", { name: /Programım/ })).toBeVisible();
  });
});
