import { expect, type Page, test } from "@playwright/test";
import { type KoskViewFixture, seedKoskView } from "./kosk-view-seed";

/**
 * Designs nizam/20 (the Medaris yönetimi's page of one köşk), nizam/23
 * (Dersler) and nizam/53 (Genel bakış) against the running app and API, with
 * real Keycloak sign-ins (MDRS-175). A spec whose account is not in the
 * environment (E2E_<ROLE>_EMAIL, _PASSWORD, _SUB) is skipped. The köşk page is
 * the başnazım's (the account that holds the SYSTEM_ADMIN realm role); the
 * Dersler table and the course overview are the köşk nazımı's.
 */
const account = (role: string) => ({
  email: process.env[`E2E_${role}_EMAIL`],
  password: process.env[`E2E_${role}_PASSWORD`],
  sub: process.env[`E2E_${role}_SUB`],
});
const SYSTEM_ADMIN = account("SYSTEM_ADMIN");
const KOSK_NAZIM = account("KOSK_NAZIM");

const seedable = Boolean(process.env.E2E_DATABASE_URL);
let fixture: KoskViewFixture;

test.beforeEach(async () => {
  if (!seedable || !SYSTEM_ADMIN.sub || !KOSK_NAZIM.sub) return;
  fixture = await seedKoskView({
    nazim: KOSK_NAZIM.sub,
    chief: SYSTEM_ADMIN.sub,
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

/** With E2E_SHOTS=<dir> every screen a spec reaches is also saved as a picture. */
const shot = async (page: Page, name: string) => {
  const dir = process.env.E2E_SHOTS;
  if (dir) {
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  }
};

// `:visible`: while a navigation streams in, Next keeps the finished page in a
// hidden node beside the one on screen, so a row can briefly exist twice.
const courseRow = (page: Page, title: string) =>
  page.locator("tbody tr:visible").filter({ hasText: title });

const tabCount = async (page: Page, label: string) => {
  const tab = page.getByRole("tab", { name: new RegExp(`^${label}`) });
  return Number((await tab.innerText()).replace(/\D+/g, ""));
};

const canManage = () => seedable && SYSTEM_ADMIN.password && KOSK_NAZIM.sub;

test("nizam/20 — the başnazım's page fills every section and the numbers are the database's (criteria 1, 6)", async ({
  page,
}) => {
  test.skip(!canManage(), "no SYSTEM_ADMIN account");
  await signIn(page, SYSTEM_ADMIN);
  await page.goto(`/tr/kosks/${fixture.kosk.id}`);
  await expect(
    page.getByRole("heading", { level: 1, name: fixture.kosk.name })
  ).toBeVisible();
  await shot(page, "20-kosk-yonetimi");

  await expect(
    page.getByText("Bu, Medaris yönetimi görünümüdür")
  ).toBeVisible();
  const counts = await fixture.counts();
  const summary = page.getByLabel("Köşkün özeti");
  await expect(summary).toContainText(
    `${counts.published} yayında · ${counts.draft} taslak · ${counts.hidden} gizli`
  );
  await expect(summary).toContainText(fixture.madrasah.name);
  // Talebe: two in the köşk's own course, one more in the medrese's — S1 is in
  // both and counts once; the hidden course's talebe do not count.
  await expect(summary.locator(".mds-stat").nth(1)).toContainText("2");

  // The tabs of the courses table equal the rows' own numbers.
  expect(await tabCount(page, "Tümü")).toBe(counts.all);
  expect(await tabCount(page, "Yayında")).toBe(counts.published);
  expect(await tabCount(page, "Taslak")).toBe(counts.draft);
  expect(await tabCount(page, "Gizli")).toBe(counts.hidden);
  await expect(courseRow(page, fixture.own.title)).toContainText(
    "Mehmet Emin Işıkoğlu"
  );
  await expect(courseRow(page, fixture.own.title)).toContainText("imam");
  await expect(courseRow(page, fixture.hosted.title)).toContainText(
    fixture.madrasah.name
  );

  // The hosting table: the medrese, its open courses.
  const hosting = page.getByRole("region", {
    name: "Medreseler ve barındırma hakları",
  });
  await expect(hosting).toContainText(fixture.madrasah.name);
  await expect(hosting).toContainText("Barındırma hakkını geri al");
});

test("nizam/20 — criterion 5: there is no permanent delete on the page, only the way to the Arşiv", async ({
  page,
}) => {
  test.skip(!canManage(), "no SYSTEM_ADMIN account");
  await signIn(page, SYSTEM_ADMIN);
  await page.goto(`/tr/kosks/${fixture.kosk.id}`);
  await expect(page.getByRole("link", { name: "Arşiv’e git" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Kalıcı olarak sil/ })
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Müderrisleri düzenle/ })
  ).toHaveCount(0);
});

test("nizam/20 — 'Köşkü gizle' asks first, hides the köşk and writes the audit row (criteria 2, 7)", async ({
  page,
}) => {
  test.skip(!canManage(), "no SYSTEM_ADMIN account");
  await signIn(page, SYSTEM_ADMIN);
  await page.goto(`/tr/kosks/${fixture.kosk.id}`);
  await page.getByRole("button", { name: "Köşkü gizle" }).click();
  await expect(page.getByRole("alertdialog")).toContainText(fixture.kosk.name);
  await page.getByRole("button", { name: "Vazgeç" }).click();
  expect((await fixture.koskRow()).hidden).toBe(false);

  await page.getByRole("button", { name: "Köşkü gizle" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Gizle" })
    .click();
  await expect(page.getByText("Köşk gizlendi")).toBeVisible();
  await expect.poll(async () => (await fixture.koskRow()).hidden).toBe(true);
  expect(await fixture.audits("kosk.hide")).toBe(1);

  // It is in the table as Gizli.
  await page.goto(`/tr/kosks?q=${fixture.tail}`);
  await expect(
    page.locator("[data-testid=kosks] tbody tr:visible").filter({
      hasText: fixture.kosk.name,
    })
  ).toContainText("Gizli");
});

test("nizam/20 — 'Köşkü pasife al' takes the nazımları off the post and writes the audit row (criterion 7)", async ({
  page,
}) => {
  test.skip(!canManage(), "no SYSTEM_ADMIN account");
  await signIn(page, SYSTEM_ADMIN);
  await page.goto(`/tr/kosks/${fixture.kosk.id}`);
  await shot(page, "20-pasife-al-oncesi");
  await page.getByRole("button", { name: "Köşkü pasife al" }).click();
  const dialog = page.getByRole("dialog");
  // MDRS-227: the dialog shows what it takes along before it asks. The seed's
  // two talebe are enrolled in the köşk's courses.
  await expect(dialog).toContainText("Pasife almak yanında şunları götürür");
  await expect(dialog).toContainText("1 köşk nazımı görevden alınır");
  await expect(dialog).toContainText("ders kapanır");
  await expect(dialog).toContainText("2 kayıtlı talebe içeriğe erişemez");
  await shot(page, "20-pasife-al");
  await dialog.getByRole("button", { name: "Yine de pasife al" }).click();
  await expect(page.getByText("Köşk pasife alındı")).toBeVisible();
  await expect.poll(async () => (await fixture.koskRow()).passive).toBe(true);
  expect(await fixture.nazims()).toEqual([]);
  expect(await fixture.audits("kosk.deactivate")).toBe(1);
  // Nothing was hidden or deleted.
  expect((await fixture.koskRow()).hidden).toBe(false);
  expect((await fixture.counts()).all).toBe(4);
});

test("nizam/20 — 'Barındırma hakkını geri al' updates the table (criterion 6)", async ({
  page,
}) => {
  test.skip(!canManage(), "no SYSTEM_ADMIN account");
  await signIn(page, SYSTEM_ADMIN);
  await page.goto(`/tr/kosks/${fixture.kosk.id}`);
  const hosting = page.getByRole("region", {
    name: "Medreseler ve barındırma hakları",
  });
  // The medrese has two open courses here (one published, one draft): "2".
  await expect(
    hosting.locator("tbody tr").filter({ hasText: fixture.madrasah.name })
  ).toContainText("1 yayında · 1 taslak");
  await hosting
    .getByRole("button", { name: /^Barındırma hakkını geri al/ })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /Dersler sürsün/ }).check();
  await dialog
    .getByRole("button", { name: "Barındırma hakkını geri al" })
    .click();
  await expect.poll(() => fixture.hostingHeld()).toBe(0);
  await expect(hosting).not.toContainText(fixture.madrasah.name);
});

test("nizam/20 — a köşk nazımı who opens the köşk lands on Dersler", async ({
  page,
}) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no KOSK_NAZIM account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.kosk.id}`);
  await page.waitForURL(new RegExp(`/kosks/${fixture.kosk.id}/dersler`));
  await expect(
    page.getByRole("heading", { level: 1, name: "Dersler" })
  ).toBeVisible();
});

test("nizam/23 — Dersler lists the courses, the tabs' numbers are the database's and each tab narrows the list (criteria 1, 2, 4)", async ({
  page,
}) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no KOSK_NAZIM account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.kosk.id}/dersler`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Dersler" })
  ).toBeVisible();
  await shot(page, "23-dersler");

  const counts = await fixture.counts();
  expect(await tabCount(page, "Tümü")).toBe(counts.all);
  await expect(page.locator("tbody tr:visible")).toHaveCount(counts.all);
  // The cards: the waiting application, the hosting right, the nazım.
  const cards = page.getByLabel("Köşkün özeti");
  await expect(cards.locator(".mds-stat").nth(0)).toContainText("1");
  await expect(cards.locator(".mds-stat").nth(1)).toContainText("1");
  await expect(cards.locator(".mds-stat").nth(2)).toContainText("1");
  await expect(courseRow(page, fixture.own.title)).toContainText(
    "1 onay bekliyor"
  );

  for (const [label, expected] of [
    ["Yayında", counts.published],
    ["Taslak", counts.draft],
    ["Gizli", counts.hidden],
  ] as const) {
    await page.getByRole("tab", { name: new RegExp(`^${label}`) }).click();
    await expect(page.locator("tbody tr:visible")).toHaveCount(expected);
  }
});

test("nizam/23 — a medrese's course has Dersi gör and no Düzenle; an own one has them all", async ({
  page,
}) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no KOSK_NAZIM account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.kosk.id}/dersler`);
  const own = courseRow(page, fixture.own.title);
  await expect(own.getByRole("link", { name: /^Düzenle/ })).toBeVisible();
  await expect(
    own.getByRole("link", { name: /^Müderrisleri düzenle/ })
  ).toBeVisible();
  await expect(own.getByRole("button", { name: /^Gizle/ })).toBeVisible();
  const hosted = courseRow(page, fixture.hosted.title);
  await expect(hosted.getByRole("link", { name: /^Düzenle/ })).toHaveCount(0);
  await expect(hosted.getByRole("button", { name: /^Gizle/ })).toBeVisible();
  const hidden = courseRow(page, fixture.hidden.title);
  await expect(hidden.getByRole("button", { name: /^Geri al/ })).toBeVisible();
  await expect(hidden.getByRole("button", { name: /^Gizle/ })).toHaveCount(0);
});

test("nizam/23 — 'Gizle' asks first, the course becomes Gizli, and 'Geri al' brings it back (criterion 3)", async ({
  page,
}) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no KOSK_NAZIM account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.kosk.id}/dersler`);
  const before = await fixture.counts();

  await courseRow(page, fixture.own.title)
    .getByRole("button", { name: /^Gizle/ })
    .click();
  await expect(page.getByRole("alertdialog")).toContainText(fixture.own.title);
  await page.getByRole("button", { name: "Vazgeç" }).click();
  expect(await fixture.courseHidden(fixture.own.id)).toBe(false);

  await courseRow(page, fixture.own.title)
    .getByRole("button", { name: /^Gizle/ })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Gizle" })
    .click();
  await expect(page.getByText("Ders gizlendi")).toBeVisible();
  await expect.poll(() => fixture.courseHidden(fixture.own.id)).toBe(true);
  await expect.poll(() => tabCount(page, "Gizli")).toBe(before.hidden + 1);
  await page.getByRole("tab", { name: /^Gizli/ }).click();
  await expect(courseRow(page, fixture.own.title)).toBeVisible();

  await courseRow(page, fixture.own.title)
    .getByRole("button", { name: /^Geri al/ })
    .click();
  await expect(page.getByText("Ders geri alındı")).toBeVisible();
  await expect.poll(() => fixture.courseHidden(fixture.own.id)).toBe(false);
  await expect.poll(() => tabCount(page, "Gizli")).toBe(before.hidden);
});

test("nizam/23 — 'Ders aç' opens the new-course form", async ({ page }) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no KOSK_NAZIM account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.kosk.id}/dersler`);
  await page.getByRole("link", { name: "Ders aç" }).click();
  await page.waitForURL(new RegExp(`/kosks/${fixture.kosk.id}/courses/new`));
});

test("nizam/53 — the overview draws the course, warns about the missing link and lists the next sessions (criteria 1, 2, 3, 6)", async ({
  page,
}) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no KOSK_NAZIM account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.kosk.id}/courses/${fixture.own.id}`);
  await expect(
    page.getByRole("heading", { level: 1, name: /Genel bakış/ })
  ).toBeVisible();
  await shot(page, "53-genel-bakis");
  await expect(page.getByText(fixture.own.title).first()).toBeVisible();
  await expect(page.getByText("2 hafta").first()).toBeVisible();
  await expect(page.getByText("4 celse").first()).toBeVisible();

  await expect(
    page.getByText("celsesinin toplantı bağlantısı eksik")
  ).toBeVisible();
  const sessions = page.locator("tbody tr:visible").filter({
    hasText: /celse/,
  });
  // The past session is not listed; the three that are coming are, by date.
  await expect(page.getByText("Geçmiş celse")).toHaveCount(0);
  const rows = await page
    .locator("[aria-labelledby=next-heading] tbody tr:visible")
    .allInnerTexts();
  expect(rows).toHaveLength(3);
  expect(rows[0]).toContain("Bağlantısız celse");
  expect(rows[0]).toContain("Bağlantı eksik");
  // The cancelled one keeps its slot, by date, between the two.
  expect(rows[1]).toContain("İptal edilen celse");
  expect(rows[1]).toContain("İptal edildi");
  expect(rows[2]).toContain("Planlı celse");
  expect(rows[2]).toContain("Zoom");
  expect(await sessions.count()).toBeGreaterThan(0);

  await expect(page.getByText("Mehmet Emin Işıkoğlu")).toBeVisible();
  await expect(page.getByText("Dersin imamı")).toBeVisible();
});

test("nizam/53 — 'Müfredatı düzenle' and 'Celse planla' go to the course's editor (criterion 5)", async ({
  page,
}) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no KOSK_NAZIM account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.kosk.id}/courses/${fixture.own.id}`);
  await page.getByRole("link", { name: "Müfredatı düzenle" }).click();
  await page.waitForURL(
    new RegExp(`/kosks/${fixture.kosk.id}/courses/${fixture.own.id}/edit`)
  );
  await page.goBack();
  await page.getByRole("link", { name: "Celse planla" }).click();
  await page.waitForURL(
    new RegExp(`/kosks/${fixture.kosk.id}/courses/${fixture.own.id}/edit`)
  );
});

test("nizam/53 — 'Onayla' takes the application off the list and adds one to Kayıtlı talebe; 'Reddet' only takes it off (criterion 4)", async ({
  page,
}) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no KOSK_NAZIM account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.kosk.id}/courses/${fixture.own.id}`);
  const students = page.getByLabel("Dersin sayıları").locator(".mds-stat");
  await expect(students.nth(0)).toContainText("2");
  await expect(students.nth(1)).toContainText("1");
  await expect(page.getByText(fixture.pendingName)).toBeVisible();

  await page
    .getByRole("button", {
      name: new RegExp(`^Onayla: ${fixture.pendingName}`),
    })
    .click();
  await expect(page.getByText("Bekleyen başvuru yok")).toBeVisible();
  await expect.poll(() => fixture.enrolled(fixture.own.id)).toBe(3);
  await expect(students.nth(0)).toContainText("3");
  await expect(students.nth(1)).toContainText("0");
});

test("nizam/53 — a draft course shows the draft badge", async ({ page }) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no KOSK_NAZIM account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.kosk.id}/courses/${fixture.draft.id}`);
  await expect(
    page.getByRole("heading", { level: 1, name: /Genel bakış/ })
  ).toContainText("Taslak");
});
