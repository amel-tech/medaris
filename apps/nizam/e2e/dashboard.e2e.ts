import { expect, type Page, test } from "@playwright/test";
import { type DashboardFixture, seedDashboard } from "./dashboard-seed";

/**
 * Designs nizam/01, 02 and 05 (the three home pages) against the running app
 * and API, with real Keycloak sign-ins (MDRS-182). A spec whose account is not
 * in the environment (E2E_<ROLE>_EMAIL, _PASSWORD, _SUB) is skipped. The
 * numbers on the pages are compared with counts taken straight off the
 * database, so a page that shows a stale or invented number fails.
 */
const account = (role: string) => ({
  email: process.env[`E2E_${role}_EMAIL`],
  password: process.env[`E2E_${role}_PASSWORD`],
  sub: process.env[`E2E_${role}_SUB`],
});
const SYSTEM_ADMIN = account("SYSTEM_ADMIN");
const KOSK_NAZIM = account("KOSK_NAZIM");
const MEDARIS_NAZIM = account("MEDARIS_NAZIM");

const seedable = Boolean(process.env.E2E_DATABASE_URL);
const haveChief = Boolean(SYSTEM_ADMIN.password && SYSTEM_ADMIN.sub);
let fixture: DashboardFixture;

test.beforeEach(async () => {
  if (!(seedable && SYSTEM_ADMIN.sub && KOSK_NAZIM.sub)) return;
  fixture = await seedDashboard({
    chief: SYSTEM_ADMIN.sub,
    koskNazim: KOSK_NAZIM.sub,
  });
});

test.afterEach(async () => {
  await fixture?.remove();
});

async function signIn(
  page: Page,
  who: { email?: string; password?: string }
): Promise<void> {
  await page.goto("/tr/auth/signin");
  await page.locator("#username").fill(who.email as string);
  await page.locator("#password").fill(who.password as string);
  await page.locator("button[type=submit]").click();
  await page.waitForURL(/localhost:4001/);
}

const sidebar = (page: Page) => page.locator("aside nav").first();

/** The big number of the Stat card with this label. */
const statValue = async (page: Page, label: string) =>
  Number(
    (
      await page
        .locator("[data-testid=home-counts] .mds-stat")
        .filter({ has: page.locator(".mds-caption", { hasText: label }) })
        .locator(".mds-stat__value")
        .first()
        .innerText()
    ).replace(/\D/g, "")
  );

test("nizam/01 — the başnazım's home page: menu, greeting, numbers and cards agree with the database (criteria 1, 2, 4, 7)", async ({
  page,
}) => {
  test.skip(!(seedable && haveChief && KOSK_NAZIM.sub), "no accounts");
  await signIn(page, SYSTEM_ADMIN);
  await page.goto("/tr");
  // `#main`: while the page streams in, a hidden copy of it sits beside the one on screen
  await expect(page.locator("#main").getByTestId("home-chief")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Ana sayfa" })
  ).toBeVisible();

  // the five sections of the menu
  for (const section of [
    "Genel",
    "Platform",
    "Talepler",
    "Denetim",
    "Ayarlar",
  ]) {
    await expect(
      sidebar(page).locator(".mds-nav-section", { hasText: section })
    ).toHaveCount(1);
  }

  const counts = await fixture.counts();
  // the greeting's n is the sum of the waiting queues (the appeal and permanent-ban models come later: 0)
  const total = counts.koskApplications + counts.deckRequests;
  await expect(
    page.getByTestId("home-greeting").filter({ visible: true })
  ).toContainText(`Karar bekleyen ${total} talep var.`);
  await expect(
    page.getByTestId("home-greeting").filter({ visible: true })
  ).toContainText(/Selâmün aleyküm, .+ Bey\./);

  expect(await statValue(page, "Köşk")).toBe(counts.kosks);
  expect(await statValue(page, "Medrese")).toBe(counts.madrasahs);
  expect(await statValue(page, "Ders")).toBe(counts.courses);
  expect(await statValue(page, "Kayıtlı talebe")).toBe(counts.students);

  // the passive medrese is named in the alert and in its card
  await expect(
    page.getByTestId("home-passive-alert").filter({ visible: true })
  ).toContainText(fixture.passiveMadrasah.name);
  const passive = page
    .getByTestId("home-passive-scope")
    .filter({ hasText: fixture.passiveMadrasah.name });
  await expect(passive).toHaveCount(1);
  await expect(passive).toContainText("Medrese");
  await expect(passive).toContainText("Başmüderris görevden alındı");
  await expect(
    passive.getByRole("link", { name: /Başmüderris ata/ })
  ).toHaveAttribute("href", "/tr/pasif-kapsamlar");

  // the newest rows of each queue
  for (const a of fixture.applications) {
    await expect(
      page.getByTestId("home-application").filter({ hasText: a.name })
    ).toHaveCount(1);
  }
  const deck = page
    .getByTestId("home-deck")
    .filter({ hasText: fixture.deck.title });
  await expect(deck).toContainText("3 ezber kartı");
  const ban = page
    .getByTestId("home-ban")
    .filter({ hasText: fixture.ban.name });
  await expect(ban).toContainText(`Ders yasağı: ${fixture.course.title}`);
  await expect(ban).toContainText(`Gerekçe: ${fixture.ban.reason}`);
});

test("nizam/01 — 'İncele' opens the application it points at, 'Tümünü gör' the list, and 'Köşk aç' the form (criterion 4)", async ({
  page,
}) => {
  test.skip(!(seedable && haveChief && KOSK_NAZIM.sub), "no accounts");
  await signIn(page, SYSTEM_ADMIN);
  await page.goto("/tr");
  const row = page
    .getByTestId("home-application")
    .filter({ hasText: fixture.applications[1]?.name ?? "" });
  await row.getByRole("link", { name: /İncele/ }).click();
  await expect(page).toHaveURL(/\/tr\/talepler\/kosk-basvurulari\?secili=/);
  await expect(
    page
      .getByTestId("application-item")
      .filter({ hasText: fixture.applications[1]?.name ?? "" })
      .first()
  ).toHaveAttribute("aria-current", "true");

  await page.goto("/tr");
  await page
    .getByTestId("home-applications")
    .getByRole("link", { name: "Tümünü gör" })
    .click();
  await expect(page).toHaveURL(/\/tr\/talepler\/kosk-basvurulari$/);

  await page.goto("/tr");
  await page.getByRole("link", { name: "Köşk aç" }).first().click();
  await expect(page).toHaveURL(/\/tr\/kosks\?ac=1$/);
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("nizam/01 — with nothing passive the warning is not drawn, and the card says so (criterion 3)", async ({
  page,
}) => {
  test.skip(!(seedable && haveChief && KOSK_NAZIM.sub), "no accounts");
  await signIn(page, SYSTEM_ADMIN);
  await page.goto("/tr");
  await expect(page.getByTestId("home-passive-alert")).toHaveCount(1);
  // somebody is given the post again
  await fixture.healPassive();
  await page.reload();
  await expect(page.getByTestId("home-passive-alert")).toHaveCount(0);
  await expect(
    page.getByTestId("home-passive").filter({ visible: true })
  ).toContainText("Yöneticisiz kapsam yok.");
});

test("nizam/02 — the köşk nazımı lands on their köşk's home page with the numbers, the alert and the celse table (criteria 1, 2)", async ({
  page,
}) => {
  test.skip(
    !(seedable && KOSK_NAZIM.password && KOSK_NAZIM.sub),
    "no accounts"
  );
  await signIn(page, KOSK_NAZIM);
  await page.goto("/tr");
  // the first köşk they manage; the shared test seed gives the account one of
  // its own as well, which may come first, so the fixture's köşk is opened by id
  await expect(page).toHaveURL(/\/tr\/kosks\/[0-9a-f-]{36}\/ana-sayfa$/);
  await page.goto(`/tr/kosks/${fixture.kosk.id}/ana-sayfa`);
  await expect(page.locator("#main").getByTestId("home-kosk")).toBeVisible();
  // no PLATFORM section in a köşk nazımı's menu
  await expect(
    sidebar(page).locator(".mds-nav-section", { hasText: "Platform" })
  ).toHaveCount(0);
  await expect(
    sidebar(page).locator(".mds-nav-section", { hasText: "Köşk" })
  ).toHaveCount(1);

  const counts = await fixture.counts();
  expect(await statValue(page, "Kayıtlı talebe")).toBe(counts.studentsIn);
  expect(await statValue(page, "Yaklaşan celse")).toBe(counts.upcomingIn);
  expect(await statValue(page, "Bekleyen başvuru")).toBe(counts.pendingIn);
  expect(await statValue(page, "Ders")).toBe(1);

  await expect(
    page.getByTestId("home-greeting").filter({ visible: true })
  ).toContainText(
    `Önümüzdeki yedi günde ${counts.upcomingIn} celse var; birinin toplantı bağlantısı eksik.`
  );
  await expect(
    page.getByTestId("home-missing-link").filter({ visible: true })
  ).toContainText(fixture.course.title);

  // the celse table: the one with a link is Planlandı on Zoom, the other is flagged
  const rows = page.locator("[data-testid=home-sessions-table] tbody tr");
  await expect(rows).toHaveCount(counts.upcomingIn);
  await expect(rows.filter({ hasText: "Bağlantı eksik" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "Planlandı" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "Zoom" })).toHaveCount(1);
  await expect(
    rows.filter({ hasText: "Bağlantı eksik" }).getByRole("link", {
      name: /Toplantı bağlantısı ekle/,
    })
  ).toHaveAttribute(
    "href",
    `/tr/kosks/${fixture.kosk.id}/courses/${fixture.course.id}/sessions`
  );

  // the other tabs read their own list
  await page.getByRole("tab", { name: /Geçmiş/ }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Yapıldı");
  await page.getByRole("tab", { name: /İptal edilen/ }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("İptal edildi");
  await page.getByRole("tab", { name: /Yaklaşan/ }).click();
  await expect(rows).toHaveCount(counts.upcomingIn);

  // the müderrisler
  await expect(page.getByTestId("home-muderris-row")).toHaveCount(1);
  await expect(page.getByTestId("home-muderris-row").first()).toContainText(
    "1 ders"
  );
});

test("nizam/02 — Onayla answers at once: the row goes, the number falls by one, the seat is taken (criterion 3)", async ({
  page,
}) => {
  test.skip(
    !(seedable && KOSK_NAZIM.password && KOSK_NAZIM.sub),
    "no accounts"
  );
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.kosk.id}/ana-sayfa`);
  const before = await statValue(page, "Bekleyen başvuru");
  const who = fixture.pending[0];
  if (!who) throw new Error("no pending talebe");
  await page
    .getByRole("button", { name: new RegExp(`Onayla: ${who.name}`) })
    .click();
  await expect(
    page.getByRole("button", { name: new RegExp(`Onayla: ${who.name}`) })
  ).toHaveCount(0);
  await expect.poll(() => statValue(page, "Bekleyen başvuru")).toBe(before - 1);
  await expect.poll(() => fixture.enrollmentOf(who.userId)).toBe("ENROLLED");
  // the sidebar's badge follows the server
  await expect(
    sidebar(page).locator("a", { hasText: "Başvurular" })
  ).toContainText(String(before - 1));
});

test("nizam/02 — Reddet asks for a reason that may stay empty; the reason is kept, the row goes (criterion 4)", async ({
  page,
}) => {
  test.skip(
    !(seedable && KOSK_NAZIM.password && KOSK_NAZIM.sub),
    "no accounts"
  );
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.kosk.id}/ana-sayfa`);
  const [first, second] = fixture.pending;
  if (!first || !second) throw new Error("no pending talebe");

  // with a reason
  await page
    .getByRole("button", { name: new RegExp(`Reddet: ${first.name}`) })
    .click();
  // a toast is a dialog too: name the one asked about
  const dialog = page.getByRole("dialog", { name: "Başvuruyu reddet" });
  await expect(dialog).toContainText("Ret gerekçesi (isteğe bağlı)");
  await dialog.getByLabel(/Ret gerekçesi/).fill("Ön koşul sağlanmıyor.");
  await dialog.getByRole("button", { name: "Reddet" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: new RegExp(`Reddet: ${first.name}`) })
  ).toHaveCount(0);
  await expect.poll(() => fixture.enrollmentOf(first.userId)).toBeNull();
  await expect
    .poll(async () => (await fixture.rejectAudits(first.userId))[0]?.reason)
    .toBe("Ön koşul sağlanmıyor.");

  // with none: the button is never held back
  await page
    .getByRole("button", { name: new RegExp(`Reddet: ${second.name}`) })
    .click();
  await expect(dialog.getByRole("button", { name: "Reddet" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Reddet" }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => fixture.enrollmentOf(second.userId)).toBeNull();
  await expect
    .poll(async () => (await fixture.rejectAudits(second.userId)).length)
    .toBe(1);
  expect((await fixture.rejectAudits(second.userId))[0]?.reason).toBeNull();
});

test("nizam/02 — a köşk the nazım does not manage is the 'izniniz yok' screen, and on a phone the menu is a drawer (criteria 6, 7)", async ({
  page,
}) => {
  test.skip(
    !(seedable && KOSK_NAZIM.password && KOSK_NAZIM.sub),
    "no accounts"
  );
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.otherKosk.id}/ana-sayfa`);
  await expect(
    page.getByText("Bu bölüm için izniniz yok").filter({ visible: true })
  ).toBeVisible();
  await expect(page.getByTestId("home-kosk")).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/tr/kosks/${fixture.kosk.id}/ana-sayfa`);
  await expect(
    page.getByTestId("home-kosk").filter({ visible: true })
  ).toBeVisible();
  await expect(page.locator("aside")).toBeHidden();
  // the table is a card list: a row is no table row any more
  const rowDisplay = await page
    .locator("[data-testid=home-sessions-table] tbody tr")
    .first()
    .evaluate((el) => getComputedStyle(el).display);
  expect(rowDisplay).not.toBe("table-row");
  await page.getByRole("button", { name: "Menü" }).click();
  await expect(
    page.getByRole("dialog").getByRole("link", { name: "Ana sayfa" })
  ).toBeVisible();
});

test("nizam/05 — a Medaris nazımı sees only the sections their permissions open, and their own permissions (criteria 1, 2, 3, 4, 6)", async ({
  page,
}) => {
  test.skip(
    !(
      seedable &&
      MEDARIS_NAZIM.password &&
      MEDARIS_NAZIM.sub &&
      KOSK_NAZIM.sub
    ),
    "no accounts"
  );
  await fixture.makeMedarisNazim(MEDARIS_NAZIM.sub as string, [
    "platform.kosk_application_decide",
    "platform.deck_publish",
    "platform.ban_account",
  ]);
  await signIn(page, MEDARIS_NAZIM);
  await page.goto("/tr");
  await expect(page.locator("#main").getByTestId("home-medaris")).toBeVisible();

  const counts = await fixture.counts();
  await expect(
    page.getByTestId("home-greeting").filter({ visible: true })
  ).toContainText(
    `Karar bekleyen ${counts.koskApplications + counts.deckRequests} talep var.`
  );

  // the menu: what is theirs, and not the rest (DOM, not just hidden)
  const menu = sidebar(page);
  for (const label of [
    "Ana sayfa",
    "Köşk başvuruları",
    "Deste yayın istekleri",
    "Kalıcı yasak talepleri",
    "Yasaklamalar",
  ]) {
    await expect(menu.locator("a", { hasText: label })).toHaveCount(1);
  }
  for (const label of [
    "İzin grupları",
    "Denetim kaydı",
    "Platform ayarları",
    "YouTube bağlantısı",
    "Medaris nazımları",
  ]) {
    await expect(menu.locator("a", { hasText: label })).toHaveCount(0);
  }

  // the numbers: no Ders, no Kayıtlı talebe; no Köşk aç without its permission
  await expect(
    page.getByTestId("home-counts").filter({ visible: true })
  ).not.toContainText("Kayıtlı talebe");
  await expect(page.locator('a[href$="/kosks?ac=1"]')).toHaveCount(0);
  await expect(page.getByTestId("home-passive")).toHaveCount(0);

  // "İzinleriniz": the permission and the giver, no end date given
  const grants = page.getByTestId("home-grants").filter({ visible: true });
  await expect(grants).toContainText("Desteyi herkese yayımla");
  await expect(grants).toContainText("Platformdan yasakla, yasağı kaldır");
  await expect(grants.getByTestId("home-grant").first()).toContainText(
    "süresiz"
  );
  await expect(
    page.getByTestId("home-grants-note").filter({ visible: true })
  ).toContainText("İzinleri Medaris başnazımı");

  // a screen that is not theirs
  await page.goto("/tr/izin-gruplari");
  await expect(
    page.getByText("Bu bölüm için izniniz yok").filter({ visible: true })
  ).toBeVisible();

  // the başnazım takes the deck permission away: after a reload it is gone
  await fixture.revokePermission(
    MEDARIS_NAZIM.sub as string,
    "platform.deck_publish"
  );
  await page.goto("/tr");
  await expect(
    sidebar(page).locator("a", { hasText: "Deste yayın istekleri" })
  ).toHaveCount(0);
  await expect(page.getByTestId("home-decks")).toHaveCount(0);
  await expect(
    page.getByTestId("home-grants").filter({ visible: true })
  ).not.toContainText("Desteyi herkese yayımla");
  await expect(
    page.getByTestId("home-greeting").filter({ visible: true })
  ).toContainText(`Karar bekleyen ${counts.koskApplications} talep var.`);
});

test("nizam/05 — Köşk aç is never drawn to a nazım, only to the başnazım (criterion 6)", async ({
  page,
}) => {
  test.skip(
    !(
      seedable &&
      MEDARIS_NAZIM.password &&
      MEDARIS_NAZIM.sub &&
      KOSK_NAZIM.sub
    ),
    "no accounts"
  );
  await fixture.makeMedarisNazim(MEDARIS_NAZIM.sub as string, [
    "platform.kosk_create",
  ]);
  await signIn(page, MEDARIS_NAZIM);
  await page.goto("/tr");
  await expect(page.locator('a[href$="/kosks?ac=1"]')).toHaveCount(0);
});
