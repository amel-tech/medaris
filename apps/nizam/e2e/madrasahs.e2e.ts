import { expect, type Page, test } from "@playwright/test";
import { type MadrasahFixture, seedMadrasahs } from "./madrasah-seed";

/**
 * Designs nizam/07 (Medreseler), nizam/08 (Medrese aç), nizam/26 (Barındırma
 * hakları) and nizam/27 (Barındırma hakkını geri al) against the running app
 * and API, with real Keycloak sign-ins (MDRS-170). A spec whose account is not
 * in the environment (E2E_<ROLE>_EMAIL, _PASSWORD, _SUB) is skipped. The
 * Medreseler page is the Medaris başnazımı's, so those specs sign in as the
 * account that holds the SYSTEM_ADMIN realm role.
 */
const account = (role: string) => ({
  email: process.env[`E2E_${role}_EMAIL`],
  password: process.env[`E2E_${role}_PASSWORD`],
  sub: process.env[`E2E_${role}_SUB`],
});
const SYSTEM_ADMIN = account("SYSTEM_ADMIN");
const KOSK_NAZIM = account("KOSK_NAZIM");
const MEDARIS_NAZIM = account("MEDARIS_NAZIM");
const MUDERRIS = account("MUDERRIS");

const seedable = Boolean(KOSK_NAZIM.sub && process.env.E2E_DATABASE_URL);
let fixture: MadrasahFixture;

test.beforeEach(async () => {
  if (!seedable) return;
  fixture = await seedMadrasahs({ nazim: KOSK_NAZIM.sub as string });
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

// `:visible`: while a navigation streams in, Next keeps the finished page in a
// hidden node beside the one on screen, so a row can briefly exist twice.
const rowOf = (page: Page, name: string) =>
  page
    .locator("[data-testid=madrasahs] tbody tr:visible")
    .filter({ hasText: name });
const tabCount = (page: Page, name: string) =>
  page
    .getByRole("tab", { name: new RegExp(`^${name}`) })
    .locator(".mds-tab__count");

const openMedreseler = async (page: Page, query = "") => {
  await page.goto(`/tr/medreseler${query}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Medreseler" })
  ).toBeVisible();
};

test("nizam/07 — the tabs' numbers are the database's totals, and each medrese reads as its status says (criteria 1, 2, 4)", async ({
  page,
}) => {
  test.skip(!(seedable && SYSTEM_ADMIN.password), "no SYSTEM_ADMIN account");
  await signIn(page, SYSTEM_ADMIN);
  await openMedreseler(page);

  const counts = await fixture.counts();
  await expect(tabCount(page, "Tümü")).toHaveText(String(counts.all));
  await expect(tabCount(page, "Etkin")).toHaveText(String(counts.active));
  await expect(tabCount(page, "Pasif")).toHaveText(String(counts.passive));
  await expect(tabCount(page, "Gizli")).toHaveText(String(counts.hidden));

  const active = rowOf(page, fixture.active.name);
  await expect(active).toContainText("Mehmet Emin Işıkoğlu");
  await expect(active).toContainText("Etkin");
  await expect(active).toContainText(`@${fixture.active.handle}`);
  await expect(active).toContainText(fixture.koskName);
  await expect(active.getByRole("button")).toHaveCount(0);

  const passive = rowOf(page, fixture.passive.name);
  await expect(passive).toContainText("Atanmamış");
  await expect(passive).toContainText("Görev süresi 27 Eylül’de doldu");
  await expect(passive).toContainText("Pasif");
  await expect(passive).toContainText("27 Eylül’den beri");
  await expect(
    passive.getByRole("button", {
      name: `Başmüderris ata: ${fixture.passive.name}`,
    })
  ).toBeVisible();

  const hidden = rowOf(page, fixture.hidden.name);
  await expect(hidden).toContainText("Gizli");
  await expect(hidden).toContainText("24 Eylül’den beri");
  await expect(hidden).toContainText("Yok");
  await expect(
    hidden.getByRole("button", { name: `Geri al: ${fixture.hidden.name}` })
  ).toBeVisible();
});

test("nizam/07 — the warning names the passive medrese, the status tab narrows the list through the URL, and a search narrows it too (criterion 5)", async ({
  page,
}) => {
  test.skip(!(seedable && SYSTEM_ADMIN.password), "no SYSTEM_ADMIN account");
  await signIn(page, SYSTEM_ADMIN);
  await openMedreseler(page);

  const warning = page.locator("[data-testid=passive-warning]:visible");
  await expect(warning).toContainText(`${fixture.passive.name} pasif`);
  await expect(warning).toContainText(
    "bir başmüderris atadığınızda yeniden açılır"
  );

  await page.getByRole("tab", { name: /^Gizli/ }).click();
  await expect(page).toHaveURL(/durum=gizli/);
  await expect(rowOf(page, fixture.hidden.name)).toBeVisible();
  await expect(rowOf(page, fixture.active.name)).toHaveCount(0);

  await page.goto(`/tr/medreseler?q=${encodeURIComponent(fixture.tail)}`);
  await expect(
    page.locator("[data-testid=madrasahs] tbody tr:visible")
  ).toHaveCount(4);
  await page.getByRole("searchbox").fill("zeyrek");
  await expect(page).toHaveURL(/q=zeyrek/);
  await expect(rowOf(page, fixture.passive.name)).toBeVisible();
  await expect(rowOf(page, fixture.active.name)).toHaveCount(0);
});

test("nizam/07 — 'Geri al' brings a hidden medrese back as Etkin (criterion 3)", async ({
  page,
}) => {
  test.skip(!(seedable && SYSTEM_ADMIN.password), "no SYSTEM_ADMIN account");
  await signIn(page, SYSTEM_ADMIN);
  await openMedreseler(page);

  const row = rowOf(page, fixture.hidden.name);
  await row
    .getByRole("button", { name: `Geri al: ${fixture.hidden.name}` })
    .click();
  await expect(page.getByText("Geri alındı")).toBeVisible();
  await expect(row).toContainText("Etkin");
  await expect(row).not.toContainText("Gizli");
  await expect(row.getByRole("button")).toHaveCount(0);
  expect(
    (await fixture.madrasahByHandle(fixture.hidden.handle))?.archived
  ).toBe(false);
  expect(await fixture.audits("madrasah.restore")).toBe(1);
  // the tab numbers follow the same answer
  const counts = await fixture.counts();
  await expect(tabCount(page, "Gizli")).toHaveText(String(counts.hidden));
});

test("nizam/07 — 'Başmüderris ata' finds an account by e-mail and the passive medrese is active again", async ({
  page,
}) => {
  test.skip(
    !(seedable && SYSTEM_ADMIN.password && MUDERRIS.email && MUDERRIS.sub),
    "no SYSTEM_ADMIN or müderris account"
  );
  await signIn(page, SYSTEM_ADMIN);
  await openMedreseler(page);

  const row = rowOf(page, fixture.passive.name);
  await row
    .getByRole("button", { name: `Başmüderris ata: ${fixture.passive.name}` })
    .click();
  const dialog = page.getByRole("dialog", { name: "Başmüderris ata" });
  const submit = dialog.getByRole("button", {
    name: "Başmüderris ata",
    exact: true,
  });
  await expect(submit).toBeDisabled();
  const email = dialog.locator("input[name=headMuderrisEmail]");
  await email.fill(MUDERRIS.email as string);
  await email.press("Enter");
  await expect(dialog.getByTestId("chosen-head")).toBeVisible();
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(dialog).toBeHidden();
  await expect(row).toContainText("Etkin");
  await expect(row).not.toContainText("Atanmamış");
  await expect(page.getByTestId("passive-warning")).toHaveCount(0);
  expect(await fixture.headsOf(fixture.passive.id)).toEqual([MUDERRIS.sub]);
  expect(await fixture.audits("madrasah.head_muderris.set")).toBe(1);
});

test("nizam/08 — the form is off until the name, the short name and the başmüderris are right (criteria 1 to 3)", async ({
  page,
}) => {
  test.skip(
    !(seedable && SYSTEM_ADMIN.password && MUDERRIS.email),
    "no SYSTEM_ADMIN or müderris account"
  );
  await signIn(page, SYSTEM_ADMIN);
  await openMedreseler(page);
  await page.getByRole("button", { name: "Medrese aç", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "Medrese aç" });
  const submit = dialog.getByRole("button", {
    name: "Medrese aç",
    exact: true,
  });
  const name = dialog.locator("input[name=name]");
  const handle = dialog.locator("input[name=handle]");

  // the first field has the focus; the scrim does not close it
  await expect(name).toBeFocused();
  await page.mouse.click(5, 5);
  await expect(dialog).toBeVisible();

  await expect(submit).toBeDisabled();
  await name.fill("Atik Ali Paşa Medresesi");
  await expect(submit).toBeDisabled();

  await handle.fill("Atik Ali");
  await handle.blur();
  await expect(dialog.getByText("Kısa ad yalnız küçük harf")).toBeVisible();
  await handle.fill("atik-ali-pasa");
  await expect(dialog.getByText("Kısa ad yalnız küçük harf")).toHaveCount(0);
  await expect(submit).toBeDisabled();

  const email = dialog.locator("input[name=headMuderrisEmail]");
  await email.fill("kimse-yok-boyle@example.test");
  await email.press("Enter");
  await expect(
    dialog.getByText("Bu e-posta adresiyle kayıtlı bir hesap bulunamadı.")
  ).toBeVisible();
  await expect(submit).toBeDisabled();

  await email.fill(MUDERRIS.email as string);
  await email.press("Enter");
  await expect(dialog.getByTestId("chosen-head")).toBeVisible();
  await expect(submit).toBeEnabled();

  // Escape closes it
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("nizam/08 — opening a medrese lists it, writes each search to the audit log, and a taken short name answers under its field (criteria 4 to 6)", async ({
  page,
}) => {
  test.skip(
    !(seedable && SYSTEM_ADMIN.password && MUDERRIS.email && MUDERRIS.sub),
    "no SYSTEM_ADMIN or müderris account"
  );
  await signIn(page, SYSTEM_ADMIN);
  await openMedreseler(page);

  const handle = `e2e-yeni-${fixture.tail}`;
  const name = `E2E Atik Ali Paşa ${fixture.tail}`;
  const searchesBefore = await fixture.lookupAudits();

  const openDialog = async () => {
    await page.getByRole("button", { name: "Medrese aç", exact: true }).click();
    return page.getByRole("dialog", { name: "Medrese aç" });
  };
  const fill = async (dialog: ReturnType<Page["getByRole"]>, short: string) => {
    await dialog.locator("input[name=name]").fill(name);
    await dialog.locator("input[name=handle]").fill(short);
    await dialog
      .locator("textarea[name=description]")
      .fill("Çemberlitaş’ta klasik müfredatı izleyen medrese.");
    const email = dialog.locator("input[name=headMuderrisEmail]");
    await email.fill(MUDERRIS.email as string);
    await email.press("Enter");
    await expect(dialog.getByTestId("chosen-head")).toBeVisible();
  };

  let dialog = await openDialog();
  await fill(dialog, handle);
  await dialog.getByRole("button", { name: "Medrese aç", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Medrese açıldı")).toBeVisible();
  await expect(rowOf(page, name)).toBeVisible();
  await expect(rowOf(page, name)).toContainText(`@${handle}`);

  const created = await fixture.madrasahByHandle(handle);
  expect(created).not.toBeNull();
  expect(await fixture.headsOf((created as { id: string }).id)).toEqual([
    MUDERRIS.sub,
  ]);
  expect(await fixture.audits("madrasah.create")).toBe(1);
  // criterion 6: the one search is one row
  expect(await fixture.lookupAudits()).toBe(searchesBefore + 1);

  // the same short name again: 409, answered under the field, nothing written
  dialog = await openDialog();
  await fill(dialog, handle);
  await dialog.getByRole("button", { name: "Medrese aç", exact: true }).click();
  await expect(
    dialog
      .getByText(`Bu kısa ad başka bir medresede kullanılıyor.`)
      .or(dialog.getByText(`@${handle} başka bir medresede kullanılıyor.`))
  ).toBeVisible();
  await expect(dialog).toBeVisible();
  expect(await fixture.audits("madrasah.create")).toBe(1);
});

test("nizam/06 — a Medaris nazımı is not the başnazım: Medreseler shows 'Bu bölüm için izniniz yok'", async ({
  page,
}) => {
  test.skip(
    !(seedable && MEDARIS_NAZIM.password && MEDARIS_NAZIM.sub),
    "no Medaris nazımı account"
  );
  await fixture.makeMedarisNazim(MEDARIS_NAZIM.sub as string);
  await signIn(page, MEDARIS_NAZIM);
  await page.goto("/tr/medreseler");
  await expect(
    page.getByRole("heading", { level: 1, name: "Bu bölüm için izniniz yok" })
  ).toBeVisible();
  await expect(page.getByTestId("madrasahs")).toHaveCount(0);
});

const openHosting = async (page: Page, koskId = fixture.koskId) => {
  await page.goto(`/tr/kosks/${koskId}/ayarlar/barindirma`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Barındırma hakları" })
  ).toBeVisible();
};
const hostingRow = (page: Page, name: string) =>
  page
    .locator("[data-testid=hosting] tbody tr:visible")
    .filter({ hasText: name });

test("nizam/26 — the köşk nazımı sees the medreses with a right here: who gave it and when, and the open courses (criterion 1)", async ({
  page,
}) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await openHosting(page);

  const row = hostingRow(page, fixture.active.name);
  await expect(row).toContainText("Başmüderris Mehmet Emin Işıkoğlu");
  await expect(row).toContainText("Yusuf Ziya Ertuğrul");
  await expect(row).toContainText("Medaris başnazımı");
  await expect(row).toContainText("1 Eylül 2026");
  await expect(row).toContainText("2");
  await expect(row).toContainText("1 yayında · 1 taslak");
  await expect(
    row.getByRole("button", {
      name: `Barındırma hakkını geri al: ${fixture.active.name}`,
    })
  ).toBeVisible();
  // a right that was withdrawn, a hidden medrese and a medrese with none are not here
  await expect(hostingRow(page, fixture.hidden.name)).toHaveCount(0);
  await expect(hostingRow(page, fixture.spare.name)).toHaveCount(0);
  await expect(
    page.getByText("hiçbir yetki vermez", { exact: false }).first()
  ).toBeVisible();
});

test("nizam/26 — 'Barındırma hakkı ver' adds the medrese to the list (criterion 2)", async ({
  page,
}) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await openHosting(page);

  await page
    .getByRole("button", { name: "Barındırma hakkı ver" })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Barındırma hakkı ver" });
  const submit = dialog.getByRole("button", {
    name: "Barındırma hakkı ver",
    exact: true,
  });
  await expect(submit).toBeDisabled();
  await dialog.getByRole("combobox").click();
  await page
    .getByRole("option", { name: new RegExp(fixture.spare.name) })
    .click();
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText("Barındırma hakkı verildi")).toBeVisible();
  const row = hostingRow(page, fixture.spare.name);
  await expect(row).toBeVisible();
  await expect(row).toContainText("Köşk nazımı");
  await expect(row).toContainText("Başmüderris yok");
  expect(await fixture.hostingHeld(fixture.spare.id)).toBe(true);
  expect(await fixture.audits("hosting_right.grant")).toBe(1);
});

test("nizam/27 — no answer is chosen for the nazım: the button is off until one is, and 'Dersler sürsün' takes the right and leaves the courses (criteria 1 to 3, 5)", async ({
  page,
}) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await openHosting(page);

  await hostingRow(page, fixture.active.name)
    .getByRole("button", { name: /Barındırma hakkını geri al/ })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Barındırma hakkını geri al",
  });
  const submit = dialog.getByRole("button", {
    name: "Barındırma hakkını geri al",
    exact: true,
  });

  // the window names the medrese, lists the open courses and starts on Vazgeç
  await expect(dialog).toContainText(fixture.active.name);
  const courses = dialog.getByTestId("open-courses");
  await expect(courses).toContainText(fixture.courses.published.title);
  await expect(courses).toContainText("3 talebe · Ayşe Nur Kılıçarslan, imam");
  await expect(courses).toContainText("Yayında");
  await expect(courses).toContainText(fixture.courses.draft.title);
  await expect(courses).toContainText("Henüz talebe yok");
  await expect(courses).toContainText("Taslak");
  await expect(dialog.getByRole("button", { name: "Vazgeç" })).toBeFocused();
  await expect(
    dialog.getByRole("radio", { name: /Dersler sürsün/ })
  ).not.toBeChecked();
  await expect(
    dialog.getByRole("radio", { name: /Dersleri gizle/ })
  ).not.toBeChecked();
  await expect(submit).toBeDisabled();
  await expect(dialog).toContainText("Seçiminiz denetim kaydına yazılır.");

  await dialog.getByRole("radio", { name: /Dersler sürsün/ }).check();
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText("Barındırma hakkı geri alındı")).toBeVisible();
  await expect(hostingRow(page, fixture.active.name)).toHaveCount(0);
  expect(await fixture.hostingHeld(fixture.active.id)).toBe(false);
  expect(await fixture.courseHidden(fixture.courses.published.id)).toBe(false);
  expect(await fixture.courseHidden(fixture.courses.draft.id)).toBe(false);
  expect(await fixture.audits("hosting_right.revoke")).toBe(1);
});

test("nizam/27 — 'Dersleri gizle' hides the medrese's courses here (criterion 4) and 'Vazgeç' and Escape change nothing", async ({
  page,
}) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await openHosting(page);

  const open = async () => {
    await hostingRow(page, fixture.active.name)
      .getByRole("button", { name: /Barındırma hakkını geri al/ })
      .click();
    return page.getByRole("dialog", { name: "Barındırma hakkını geri al" });
  };

  let dialog = await open();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  dialog = await open();
  await dialog.getByRole("button", { name: "Vazgeç" }).click();
  await expect(dialog).toBeHidden();
  expect(await fixture.hostingHeld(fixture.active.id)).toBe(true);

  dialog = await open();
  await dialog.getByRole("radio", { name: /Dersleri gizle/ }).check();
  await expect(dialog).toContainText(
    "3 talebe celselere ve ders kayıtlarına erişemez"
  );
  await dialog
    .getByRole("button", { name: "Barındırma hakkını geri al", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(hostingRow(page, fixture.active.name)).toHaveCount(0);
  expect(await fixture.hostingHeld(fixture.active.id)).toBe(false);
  expect(await fixture.courseHidden(fixture.courses.published.id)).toBe(true);
  expect(await fixture.courseHidden(fixture.courses.draft.id)).toBe(true);
});

test("nizam/26 — someone who does not manage the köşk gets 'Bu bölüm için izniniz yok' (criterion 4)", async ({
  page,
}) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.otherKoskId}/ayarlar/barindirma`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Bu bölüm için izniniz yok" })
  ).toBeVisible();
  await expect(page.getByTestId("hosting")).toHaveCount(0);
});
