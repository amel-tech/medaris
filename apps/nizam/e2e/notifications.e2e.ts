import { expect, type Page, test } from "@playwright/test";
import { type BanFixture, seedBans } from "./ban-seed";
import {
  ensureMedarisNazim,
  type NotificationSeed,
  seedNotifications,
} from "./notification-seed";

/**
 * Designs nizam/37 (Bildirimler, köşk nazımı) and nizam/46 (Bildirimler,
 * Medaris yönetimi) against the running app and API, with real Keycloak
 * sign-ins (MDRS-179). A spec whose account is not in the environment
 * (E2E_<ROLE>_EMAIL, _PASSWORD, _SUB) is skipped.
 */
const account = (role: string) => ({
  email: process.env[`E2E_${role}_EMAIL`],
  password: process.env[`E2E_${role}_PASSWORD`],
  sub: process.env[`E2E_${role}_SUB`],
});
const KOSK_NAZIM = account("KOSK_NAZIM");
const MUDERRIS = account("MUDERRIS");
const MEDARIS_NAZIM = account("MEDARIS_NAZIM");

const seedable = Boolean(KOSK_NAZIM.sub && KOSK_NAZIM.password && MUDERRIS.sub);

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

const ban = (over: Record<string, string> = {}) => ({
  actorName: "Ayşe Nur Kılıçarslan",
  talebeName: "Ömer Faruk Demirkaya",
  courseTitle: "Avâmil ve Tasrîf",
  reason: "Celselerde uyarılara rağmen kırıcı mesajlar yazdı.",
  source: "Nûruosmaniye Köşkü",
  ...over,
});

const rows = (page: Page) => page.getByTestId("notification-row");
const bell = (page: Page) =>
  page.locator("header.mds-appbar a[href$='/bildirimler']");
const navItem = (page: Page) =>
  page.locator("aside a.mds-nav-item[href$='/bildirimler']");

let fixture: BanFixture | undefined;
let seed: NotificationSeed | undefined;

test.beforeEach(async () => {
  if (!seedable) return;
  fixture = await seedBans({
    nazim: KOSK_NAZIM.sub as string,
    muderris: MUDERRIS.sub as string,
  });
  // 3 unread (two today, one yesterday), 3 read; the sixth row is a talebe's
  // (Tedris's) type: nizam asks for the types it words only, so that row is
  // neither drawn nor counted, by 'Tümü', the tab counts, the bell or the badge
  seed = await seedNotifications(KOSK_NAZIM.sub as string, [
    {
      type: "COURSE_BAN_PLACED",
      ago: "1 minute",
      koskId: fixture.koskId,
      params: ban({ talebeName: "Faruk Demir" }),
    },
    {
      type: "KOSK_BAN_PLACED",
      ago: "2 minutes",
      koskId: fixture.koskId,
      params: ban({ talebeName: "Ali Yazıcı" }),
    },
    {
      type: "COURSE_BAN_PLACED",
      ago: "3 minutes",
      koskId: fixture.koskId,
      read: true,
      params: ban({ talebeName: "Mehmet Said" }),
    },
    {
      type: "COURSE_BAN_PLACED",
      ago: "26 hours",
      koskId: fixture.koskId,
      params: ban({ talebeName: "Bilal Ahmet" }),
    },
    {
      type: "COURSE_BAN_PLACED",
      ago: "6 days",
      koskId: fixture.koskId,
      read: true,
      params: ban({ talebeName: "Hasan Basri" }),
    },
    { type: "ENROLLMENT_APPROVED", ago: "7 days", read: true, params: {} },
  ]);
});

test.afterEach(async () => {
  await seed?.remove();
  await fixture?.remove();
  seed = undefined;
  fixture = undefined;
});

test("nizam/37 — the list groups the köşk nazımı's notifications by day, newest first, with the sentence of each (criterion 1)", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await page.goto("/tr/bildirimler");

  await expect(
    page.getByRole("heading", { name: "Bildirimler", level: 1 })
  ).toBeVisible();
  await expect(
    page.locator("#main").getByText("Köşkünüzde konan yasaklar.")
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bugün" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dün" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Daha önce" })).toBeVisible();
  // the five ban rows: the seeded talebe-side notification is not nizam's
  await expect(rows(page)).toHaveCount(5);

  const first = rows(page).first();
  await expect(first).toContainText("Yeni ders yasağı");
  await expect(first).toContainText(
    "Ayşe Nur Kılıçarslan, Faruk Demir adlı talebeyi Avâmil ve Tasrîf dersinden yasakladı. Gerekçe: Celselerde uyarılara rağmen kırıcı mesajlar yazdı."
  );
  await expect(first).toContainText("Nûruosmaniye Köşkü");
  await expect(first).toContainText("Yeni");
  await expect(rows(page).nth(1)).toContainText("Yeni köşk yasağı");
  // the title leads to the köşk's Yasaklamalar
  await expect(
    first.getByRole("link", { name: "Yeni ders yasağı" })
  ).toHaveAttribute("href", `/tr/kosks/${fixture?.koskId}/yasaklamalar`);
});

test("nizam/37 — 'Okunmamış' lists only the unread, and the tab counts agree with the rows (criterion 2)", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await page.goto("/tr/bildirimler");

  await expect(page.getByRole("tab", { name: /^Tümü/ })).toContainText("5");
  await expect(page.getByRole("tab", { name: /^Okunmamış/ })).toContainText(
    "3"
  );
  await page.getByRole("tab", { name: /^Okunmamış/ }).click();
  await expect(rows(page)).toHaveCount(3);
  for (const row of await rows(page).all()) {
    await expect(row).toContainText("Yeni");
  }
});

test("nizam/37 — 'Okundu say' makes one row read and lowers every counter: tab, menu badge and the bell's name (criterion 3)", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await page.goto("/tr/bildirimler");

  await expect(bell(page)).toHaveAttribute(
    "aria-label",
    "Bildirimler, 3 okunmamış"
  );
  await expect(navItem(page)).toContainText("3");

  const first = rows(page).first();
  await first.getByRole("button", { name: /^Okundu say/ }).click();
  await expect(first.getByText("Yeni", { exact: true })).toHaveCount(0);
  await expect(first.getByRole("button", { name: /^Okundu say/ })).toHaveCount(
    0
  );
  await expect(page.getByRole("tab", { name: /^Okunmamış/ })).toContainText(
    "2"
  );
  await expect(bell(page)).toHaveAttribute(
    "aria-label",
    "Bildirimler, 2 okunmamış"
  );
  await expect(navItem(page)).toContainText("2");
  // and it is kept: a reload still has two unread
  await page.reload();
  await expect(page.getByRole("tab", { name: /^Okunmamış/ })).toContainText(
    "2"
  );
  const stored = await seed?.rows();
  expect(stored?.filter((r) => r.unread)).toHaveLength(2);
});

test("nizam/37 — 'Tümünü okundu say' reads everything: no 'Yeni', zero unread, the bell says only 'Bildirimler' (criterion 4)", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await page.goto("/tr/bildirimler");

  await page.getByRole("button", { name: "Tümünü okundu say" }).click();
  await expect(page.getByRole("tab", { name: /^Okunmamış/ })).toContainText(
    "0"
  );
  await expect(
    page.getByRole("button", { name: "Tümünü okundu say" })
  ).toBeDisabled();
  await expect(bell(page)).toHaveAttribute("aria-label", "Bildirimler");
  await expect(rows(page).getByText("Yeni", { exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: /^Okunmamış/ }).click();
  await expect(
    page.getByText("Okunmamış bildirim yok").filter({ visible: true })
  ).toBeVisible();
  expect((await seed?.rows())?.every((r) => !r.unread)).toBe(true);
});

test("nizam/37 — the 'Yasaklar' chip keeps the ban rows and leaves out other kinds; with 'Okunmamış' the two narrow together (criterion 5)", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await page.goto("/tr/bildirimler");

  await expect(rows(page)).toHaveCount(5);
  await page.getByRole("button", { name: "Yasaklar", exact: true }).click();
  // every type nizam words is a ban type, so the chip keeps all five
  await expect(rows(page)).toHaveCount(5);
  for (const row of await rows(page).all()) {
    await expect(row).toHaveAttribute("data-type", /BAN_PLACED$/);
  }
  await page.getByRole("tab", { name: /^Okunmamış/ }).click();
  await expect(rows(page)).toHaveCount(3);
  // back to every kind
  await page.getByRole("button", { name: "Tümü", exact: true }).click();
  await expect(rows(page)).toHaveCount(3);
  await page.getByRole("tab", { name: /^Tümü/ }).click();
  await expect(rows(page)).toHaveCount(5);
});

test("nizam/37 — a signed-out visitor is sent to sign in", async ({ page }) => {
  test.skip(!seedable, "no köşk nazım account");
  await page.goto("/tr/bildirimler");
  await expect(page).toHaveURL(/auth\/signin|realms\//);
});

test("nizam/46 — a ban placed by the köşk nazımı reaches the Medaris nazımı's list with the real sentence, and the köşk nazımı gets none of their own (criterion 6)", async ({
  page,
  browser,
}) => {
  test.skip(
    !seedable || !MEDARIS_NAZIM.sub || !MEDARIS_NAZIM.password,
    "no Medaris nazımı account"
  );
  const medaris = await ensureMedarisNazim(MEDARIS_NAZIM.sub as string);
  try {
    await signIn(page, KOSK_NAZIM);
    await page.goto(
      `/tr/kosks/${fixture?.koskId}/courses/${fixture?.course.id}/students`
    );
    await page.getByRole("tab", { name: /^Kayıtlı/ }).click();
    await page
      .getByRole("button", { name: `Yasakla: ${fixture?.talebe.name}` })
      .click();
    const dialog = page.getByRole("dialog", { name: "Talebeyi yasakla" });
    await dialog.getByRole("textbox").fill("Celsede başka talebelere hakaret.");
    await dialog.getByRole("button", { name: "Yasakla", exact: true }).click();
    await expect(
      page.getByText("Yasak kaydedildi").filter({ visible: true })
    ).toBeVisible();

    const other = await browser.newContext();
    const medarisPage = await other.newPage();
    await signIn(medarisPage, MEDARIS_NAZIM);
    await medarisPage.goto("/tr/bildirimler");
    await expect(
      medarisPage.locator("#main").getByText("Köşklerde konan yasaklar.")
    ).toBeVisible();
    await expect(rows(medarisPage)).toHaveCount(1);
    const row = rows(medarisPage).first();
    await expect(row).toContainText("Yeni ders yasağı");
    await expect(row).toContainText(fixture?.talebe.name as string);
    await expect(row).toContainText(fixture?.course.title as string);
    await expect(row).toContainText("Celsede başka talebelere hakaret.");
    await expect(row).toContainText(fixture?.koskName as string);
    await expect(row).toContainText("Yeni");
    await other.close();

    // the one who placed it is not told of their own act: still the seeded five
    await page.goto("/tr/bildirimler");
    await expect(rows(page)).toHaveCount(5);
  } finally {
    await medaris.remove();
  }
});
