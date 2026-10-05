import type { Page } from "@playwright/test";
import { account, canSignIn, expect, test } from "./accounts";
import { type CoursesFixture, seedCourses } from "./courses-seed";
import { type NazarFixture, seedPortal } from "./seed";

/**
 * Designs nazir/07 (Dersler), 17 (Müderrisleri değiştir) and 18 (Dersi gizle)
 * against the running app and API with real Keycloak sign-ins (MDRS-186). The
 * medrese's courses are the başmüderris's; MEDRESE_NAZIR is only asked what
 * the open owner decision allows: the API refuses it, and the page says so.
 * Adding a müderris by e-mail goes to the real realm directory through
 * tedrisat's admin client, so it adds the TALEBE account, which holds no role.
 * Opening a course (nazir/08) has its own spec (open-course.e2e.ts).
 */
const BASMUDERRIS = account("MEDRESE_BASMUDERRIS");
const MEDRESE_NAZIR = account("MEDRESE_NAZIR");
const TALEBE = account("TALEBE");

let base: NazarFixture | undefined;
let courses: CoursesFixture | undefined;

test.beforeAll(async () => {
  if (!BASMUDERRIS.sub) return;
  base = await seedPortal({
    basmuderris: BASMUDERRIS.sub,
    medreseNazir: MEDRESE_NAZIR.sub,
  });
});

test.afterAll(async () => {
  await base?.remove();
});

// Changing a list and hiding a course change what the next spec reads, so each has its own.
test.beforeEach(async () => {
  if (base && BASMUDERRIS.sub)
    courses = await seedCourses(base, BASMUDERRIS.sub);
});

test.afterEach(async () => {
  await courses?.remove();
  courses = undefined;
});

const ready = () => Boolean(base && courses && canSignIn(BASMUDERRIS));

const open = async (page: Page, query = "") => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/medrese/${base?.madrasah.id}/dersler${query}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Dersler" })
  ).toBeVisible();
};

const rows = (page: Page) =>
  page.locator("[data-testid=courses] tbody tr:visible");
const rowOf = (page: Page, title: string) =>
  rows(page).filter({ hasText: title });
const rowMenu = async (page: Page, title: string, item: string) => {
  await page.getByRole("button", { name: `Diğer işlemler: ${title}` }).click();
  await page.getByRole("menuitem", { name: item }).click();
};

test("nazir/07 — lists the medrese's courses with their köşk, müderrisler, talebe and state; a hidden course is not there (criteria 1, 3, 4)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);

  // the two seeded courses, the draft and the other köşk's course; the hidden one stays out
  await expect(rows(page)).toHaveCount(4);
  await expect(
    page.getByText(courses?.hidden.title ?? "", { exact: false })
  ).toHaveCount(0);
  await expect(
    page.getByTestId("counter").filter({ visible: true })
  ).toHaveText("4 ders · 2 köşkte");

  const first = rowOf(page, base?.first.title ?? "");
  await expect(first).toContainText(courses?.kosk.name ?? "");
  await expect(first).not.toContainText("bugün açıldı");
  await expect(first).toContainText("Dersin imamı");
  await expect(first).toContainText(courses?.second.name ?? "");
  await expect(first).toContainText(String(courses?.enrolled));
  await expect(first).toContainText("2 onay bekliyor");
  await expect(first).toContainText("Yayında");

  const draft = rowOf(page, courses?.draft.title ?? "");
  await expect(draft).toContainText("bugün açıldı");
  await expect(draft).toContainText("Taslak");
  await expect(draft).toContainText("E2E Konuk Müderris");
  await expect(draft).not.toContainText("onay bekliyor");

  const other = rowOf(page, courses?.other.title ?? "");
  await expect(other).toContainText(courses?.fatih.name ?? "");
  await expect(other).toContainText("Henüz talebe yok");
  await expect(other).not.toContainText("bugün açıldı");

  await expect(
    page.locator("main").getByRole("link", { name: "Arşiv", exact: true })
  ).toHaveAttribute("href", `/medrese/${base?.madrasah.id}/arsiv`);
});

test("nazir/07 — the köşk and the state filters work together, and the counter follows them (criterion 2)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);

  await page.getByRole("combobox", { name: "Köşk" }).click();
  await page
    .getByRole("option", { name: `Köşk: ${courses?.fatih.name}` })
    .click();
  await expect(page).toHaveURL(new RegExp(`kosk=${courses?.fatih.id}`));
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText(courses?.other.title ?? "");
  await expect(
    page.getByTestId("counter").filter({ visible: true })
  ).toHaveText("1 ders · 1 köşkte");
  // the köşk filter still offers every köşk that hosts the medrese
  await page.getByRole("combobox", { name: "Köşk" }).click();
  await expect(page.getByRole("option")).toHaveCount(3);
  await page.keyboard.press("Escape");

  await page.getByRole("combobox", { name: "Durum" }).click();
  await page.getByRole("option", { name: "Durum: Taslak" }).click();
  await expect(page).toHaveURL(/durum=taslak/);
  await expect(
    page.getByText("Bu süzgece uyan ders yok.").filter({ visible: true })
  ).toBeVisible();
  await expect(
    page.getByTestId("counter").filter({ visible: true })
  ).toHaveText("Gösterilecek ders yok");

  await page.getByRole("link", { name: "Süzgeçleri temizle" }).click();
  await expect(rows(page)).toHaveCount(4);

  await page.getByRole("combobox", { name: "Durum" }).click();
  await page.getByRole("option", { name: "Durum: Taslak" }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText(courses?.draft.title ?? "");
  await expect(
    page.getByTestId("counter").filter({ visible: true })
  ).toHaveText("1 ders · 1 köşkte");
});

test("nazir/07 — beside the list: the köşks that host the medrese, with their courses, and the two buttons", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);

  const hosts = page.getByTestId("hosting-kosks").getByRole("listitem");
  await expect(hosts).toHaveCount(2);
  await expect(
    hosts.filter({ hasText: courses?.kosk.name ?? "" })
  ).toContainText("3 medrese dersi");
  await expect(
    hosts.filter({ hasText: courses?.kosk.name ?? "" })
  ).not.toContainText("Arapça dil ilimleri");
  await expect(
    hosts.filter({ hasText: courses?.fatih.name ?? "" })
  ).toContainText("1 medrese dersi");
  // a köşk that gave no right and a hidden one are not offered
  await expect(page.getByText(courses?.noRight.name ?? "")).toHaveCount(0);
  await expect(page.getByText(courses?.hiddenKosk.name ?? "")).toHaveCount(0);

  await expect(
    page.getByRole("link", { name: "Medrese dersi aç" })
  ).toHaveAttribute("href", `/medrese/${base?.madrasah.id}/dersler/yeni`);
  await expect(
    page.getByRole("link", { name: "Medrese dışı ders talebi gönder" })
  ).toHaveAttribute("href", `/medrese/${base?.madrasah.id}/dersler/talep`);
});

test("nazir/17 — the dialog shows the list and keeps Kaydet off until it changes; the second müderris leaves and the row follows (criterion 4)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  await rowMenu(page, base?.first.title ?? "", "Müderrisleri değiştir");

  const dialog = page.getByRole("dialog", { name: "Müderrisleri değiştir" });
  await expect(dialog).toContainText(base?.first.title ?? "");
  await expect(dialog).toContainText("2 müderris");
  await expect(dialog).toContainText(courses?.second.name ?? "");
  await expect(dialog.getByRole("button", { name: "Kaydet" })).toBeDisabled();
  await expect(dialog.getByRole("radio")).toHaveCount(2);

  await dialog
    .getByRole("button", { name: `Çıkar: ${courses?.second.name}` })
    .click();
  await expect(dialog).toContainText("1 müderris");
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(
    page.getByText("Müderrisler kaydedildi").filter({ visible: true })
  ).toBeVisible();

  await expect(dialog).toHaveCount(0);
  const first = rowOf(page, base?.first.title ?? "");
  await expect(first).not.toContainText(courses?.second.name ?? "");
  await expect(first).toContainText("Dersin imamı");

  const held = await courses?.muderrisOf(base?.first.id ?? "");
  expect(held?.map((m) => m.userId)).toEqual([BASMUDERRIS.sub]);
  expect(
    await courses?.audits("course.muderris.update", base?.first.id ?? "")
  ).toBe(1);
});

test("nazir/17 — the last müderris cannot leave (criterion 1)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  await rowMenu(page, base?.second.title ?? "", "Müderrisleri değiştir");
  const dialog = page.getByRole("dialog", { name: "Müderrisleri değiştir" });
  await expect(dialog).toContainText("1 müderris");
  await expect(dialog.getByRole("radio")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /^Çıkar:/ })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Kaydet" })).toBeDisabled();
});

test("nazir/17 — a müderris with no account is shown and left alone", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  await rowMenu(page, courses?.draft.title ?? "", "Müderrisleri değiştir");
  const dialog = page.getByRole("dialog", { name: "Müderrisleri değiştir" });
  await expect(dialog).toContainText("E2E Konuk Müderris");
  await expect(dialog).toContainText(
    "Hesabı olmayan müderris; bu listeden değiştirilemez."
  );
  await expect(
    dialog.getByRole("button", { name: "Çıkar: E2E Konuk Müderris" })
  ).toHaveCount(0);
  // the draft has no account at all: one has to be added before there is anything to save
  await expect(dialog.getByRole("button", { name: "Kaydet" })).toBeDisabled();
});

test("nazir/17 — a müderris added by e-mail takes the course's müderris role; an address nobody has finds no one (criterion 5)", async ({
  as,
}) => {
  test.skip(!(ready() && canSignIn(TALEBE) && TALEBE.sub), "no TALEBE account");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  await rowMenu(page, base?.first.title ?? "", "Müderrisleri değiştir");
  const dialog = page.getByRole("dialog", { name: "Müderrisleri değiştir" });
  const search = dialog.getByLabel("Müderris", { exact: true });

  await search.fill(`kimse.yok.${courses?.tail}@example.test`);
  await search.press("Enter");
  await expect(
    dialog.getByText("Bu e-posta adresiyle kayıtlı bir hesap bulunamadı.")
  ).toBeVisible();

  await search.fill(TALEBE.email ?? "");
  await search.press("Enter");
  await expect(dialog).toContainText("3 müderris");
  await expect(dialog).toContainText(TALEBE.email ?? "");
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(
    page.getByText("Müderrisler kaydedildi").filter({ visible: true })
  ).toBeVisible();

  const held = await courses?.muderrisOf(base?.first.id ?? "");
  expect(held?.map((m) => m.userId)).toContain(TALEBE.sub);
  expect(held?.find((m) => m.isImam)?.userId).toBe(BASMUDERRIS.sub);
  // criterion 5: the search is written to the audit log by the directory read, not by this screen; the save is
  expect(
    await courses?.audits("course.muderris.update", base?.first.id ?? "")
  ).toBe(1);
});

test("nazir/17 — when the imam leaves and one müderris remains, that one is the imam (criterion 2)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  await rowMenu(page, base?.first.title ?? "", "Müderrisleri değiştir");
  const dialog = page.getByRole("dialog", { name: "Müderrisleri değiştir" });

  // two accounts: the imam leaves, and the one who is left is a lone müderris, so the imam is theirs
  await dialog.getByRole("button", { name: /^Çıkar: .*Işıkoğlu/ }).click();
  await expect(dialog).toContainText("1 müderris");
  await expect(dialog.getByRole("button", { name: "Kaydet" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(
    page.getByText("Müderrisler kaydedildi").filter({ visible: true })
  ).toBeVisible();

  const held = await courses?.muderrisOf(base?.first.id ?? "");
  expect(held).toEqual([{ userId: courses?.second.id, isImam: true }]);
});

test("nazir/18 — 'Dersi gizle' asks first with the real number of talebe, and 'Vazgeç' leaves the course where it is", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  await rowMenu(page, base?.first.title ?? "", "Dersi gizle");

  const ask = page.getByRole("alertdialog", { name: "Dersi gizle" });
  await expect(ask).toContainText(base?.madrasah.name ?? "");
  await expect(ask).toContainText(
    `${base?.first.title} talebelerden, ziyaretçilerden ve ${courses?.kosk.name}`
  );
  await expect(ask).toContainText(
    `${courses?.enrolled} talebe celselere ve ders kayıtlarına erişemez.`
  );
  await expect(ask).toContainText(
    "Hiçbir şey silinmez; Arşiv’den geri alabilirsiniz."
  );
  await expect(ask.getByRole("button", { name: "Vazgeç" })).toBeFocused();

  await ask.getByRole("button", { name: "Vazgeç" }).click();
  await expect(ask).toHaveCount(0);
  await expect(rowOf(page, base?.first.title ?? "")).toHaveCount(1);
  expect(
    (await courses?.courseRow(base?.first.id ?? ""))?.archivedAt
  ).toBeNull();
});

test("nazir/18 — 'Gizle' takes the course off the list and into the Arşiv, deletes nothing, and 'Geri al' brings it back (criteria 2, 3)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  await rowMenu(page, courses?.other.title ?? "", "Dersi gizle");
  const ask = page.getByRole("alertdialog", { name: "Dersi gizle" });
  // nobody is enrolled: the sentence about talebe is left out
  await expect(ask).not.toContainText("erişemez");
  await ask.getByRole("button", { name: "Gizle" }).click();

  await expect(
    page.getByText("Ders gizlendi").filter({ visible: true })
  ).toBeVisible();
  await expect(rowOf(page, courses?.other.title ?? "")).toHaveCount(0);
  await expect(rows(page)).toHaveCount(3);
  await expect(
    page.getByTestId("counter").filter({ visible: true })
  ).toHaveText("3 ders · 1 köşkte");
  const stored = await courses?.courseRow(courses?.other.id ?? "");
  expect(stored?.archivedAt).not.toBeNull();
  expect(await courses?.audits("course.hide", courses?.other.id ?? "")).toBe(1);

  await page.goto(`/medrese/${base?.madrasah.id}/arsiv?tur=ders`);
  const archived = page
    .locator("[data-testid=archive] tbody tr:visible")
    .filter({ hasText: courses?.other.title ?? "" });
  await expect(archived).toContainText("Ders");
  await archived.getByRole("button", { name: /^Geri al/ }).click();
  await expect(
    page.getByText("Geri alındı").filter({ visible: true })
  ).toBeVisible();

  await open(page);
  await expect(rowOf(page, courses?.other.title ?? "")).toHaveCount(1);
  expect(
    (await courses?.courseRow(courses?.other.id ?? ""))?.archivedAt
  ).toBeNull();
});

test("nazir/07, 08 — a medrese nazır is refused: a notice, no list and no way to open a course", async ({
  as,
}) => {
  test.skip(!(ready() && canSignIn(MEDRESE_NAZIR)), "no medrese nazır account");
  const page = await as("MEDRESE_NAZIR");
  await open(page);
  await expect(
    page.getByText("Bu sayfaya izniniz yok").filter({ visible: true })
  ).toBeVisible();
  await expect(page.getByTestId("courses")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Medrese dersi aç" })
  ).toHaveCount(0);

  await page.goto(`/medrese/${base?.madrasah.id}/dersler/yeni`);
  await expect(
    page.getByText("Bu sayfaya izniniz yok").filter({ visible: true })
  ).toBeVisible();
  await expect(page.getByTestId("open-course-form")).toHaveCount(0);
});
