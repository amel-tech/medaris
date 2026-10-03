import type { Page } from "@playwright/test";
import { account, canSignIn, expect, test } from "./accounts";
import { type BansFixture, seedBans } from "./people-seed";
import { type NazirFixture, seedPortal } from "./seed";

/**
 * Design nazir/11 (Yasaklamalar) against the running app and API with real
 * Keycloak sign-ins (MDRS-187): the tabs and their counts, the actions each
 * kademe is offered, and the four decisions ("Yasağı kaldır", "Medreseden de
 * yasakla", "Kalıcı yasak talebi aç", "Yasakla"), each read back from the
 * database. "Yasakla" finds its person through tedrisat's admin client in the
 * real realm directory, so it bars the TALEBE account, which the spec's
 * cleanup frees again. The list is the başmüderris's; MEDRESE_NAZIR is only
 * asked what the open owner decision allows: the API refuses it, and the page
 * says so.
 */
const BASMUDERRIS = account("MEDRESE_BASMUDERRIS");
const MEDRESE_NAZIR = account("MEDRESE_NAZIR");
const TALEBE = account("TALEBE");

let base: NazirFixture | undefined;
let bans: BansFixture | undefined;
/** people a spec barred through "Yasakla", for the cleanup to free */
const barred: string[] = [];

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

// A decision changes the list the next spec reads, so each has its own.
test.beforeEach(async () => {
  if (base && BASMUDERRIS.sub) bans = await seedBans(base, BASMUDERRIS.sub);
});

test.afterEach(async () => {
  await bans?.remove(barred.splice(0));
  bans = undefined;
});

const ready = () => Boolean(base && bans && canSignIn(BASMUDERRIS));
const directory = () => ready() && canSignIn(TALEBE) && Boolean(TALEBE.sub);

const open = async (page: Page, query = "") => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/medrese/${base?.madrasah.id}/yasaklamalar${query}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Yasaklamalar" })
  ).toBeVisible();
};

const rows = (page: Page) =>
  page.locator("[data-testid=bans] tbody tr:visible");
const rowOf = (page: Page, name: string) =>
  rows(page).filter({ hasText: name });
const tab = (page: Page, name: RegExp) =>
  page.getByRole("navigation", { name: "Yasak durumu" }).getByRole("link", {
    name,
  });

test("nazir/11 — the active and the lifted bans are told apart, and each tab counts the whole medrese (criterion 1)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);

  await expect(tab(page, /^Etkin/)).toContainText("2");
  await expect(tab(page, /^Kaldırılan/)).toContainText("1");
  await expect(rows(page)).toHaveCount(2);
  await expect(rowOf(page, bans?.lifted.name ?? "")).toHaveCount(0);

  await tab(page, /^Kaldırılan/).click();
  await expect(page).toHaveURL(/durum=kaldirilan/);
  await expect(rows(page)).toHaveCount(1);
  const lifted = rowOf(page, bans?.lifted.name ?? "");
  await expect(lifted).toContainText("E2E süre doldu");
  await expect(lifted.getByRole("button")).toHaveCount(0);
  // the counts do not follow the tab
  await expect(tab(page, /^Etkin/)).toContainText("2");
});

test("nazir/11 — a row offers the actions of its kademe, and a Medaris nazımı's ban only widens, with the note (criteria 2, 5)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);

  const own = rowOf(page, bans?.open.name ?? "");
  await expect(own).toContainText("Yeni");
  await expect(own).toContainText("Medrese başmüderrisi (siz)");
  await expect(own).toContainText(base?.first.title ?? "");
  await expect(
    own.getByRole("button", { name: /^Yasağı kaldır/ })
  ).toBeVisible();
  await expect(
    own.getByRole("button", { name: /^Medreseden de yasakla/ })
  ).toBeVisible();
  await expect(
    own.getByRole("button", { name: /^Kalıcı yasak talebi aç/ })
  ).toBeVisible();

  const medaris = rowOf(page, bans?.medaris.name ?? "");
  await expect(medaris).toContainText("Medaris nazımı");
  await expect(medaris).not.toContainText("Yeni");
  await expect(
    medaris.getByRole("button", { name: /^Medreseden de yasakla/ })
  ).toBeVisible();
  await expect(
    medaris.getByRole("button", { name: /^Yasağı kaldır/ })
  ).toHaveCount(0);
  await expect(
    medaris.getByRole("button", { name: /^Kalıcı yasak talebi aç/ })
  ).toHaveCount(0);
  await expect(
    medaris.getByText("Bu yasağı yalnız Medaris yönetimi kaldırabilir.")
  ).toBeVisible();
});

test("nazir/11 — the scope filter and the search narrow the rows, and the filter is in the address", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);

  await page.getByRole("combobox", { name: "Kapsam" }).click();
  await page.getByRole("option", { name: base?.second.title ?? "" }).click();
  await expect(page).toHaveURL(new RegExp(`kapsam=${base?.second.id}`));
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText(bans?.medaris.name ?? "");

  await page.getByRole("combobox", { name: "Kapsam" }).click();
  await page.getByRole("option", { name: "Medrese düzeyi" }).click();
  await expect(page).toHaveURL(/kapsam=medrese/);
  await expect(page.getByText("Bu süzgece uyan yasak yok.")).toBeVisible();

  await page.getByRole("button", { name: "Süzgeçleri temizle" }).click();
  await expect(rows(page)).toHaveCount(2);
  await page.getByRole("searchbox").fill(bans?.open.name ?? "");
  await expect(rows(page)).toHaveCount(1);
});

test("nazir/11 — 'Medreseden de yasakla' widens the course ban to the whole medrese, and the course ban stays (criterion 3)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);

  await rowOf(page, bans?.open.name ?? "")
    .getByRole("button", { name: /^Medreseden de yasakla/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "Medreseden de yasakla" });
  await expect(dialog).toContainText(base?.first.title ?? "");
  const submit = dialog.getByRole("button", {
    name: "Medreseden de yasakla",
    exact: true,
  });
  await expect(submit).toBeDisabled();
  await dialog
    .getByLabel("Yasaklama gerekçesi")
    .fill("E2E başka derslerde de aynı davranış");
  await submit.click();

  await expect(
    page.getByText("Medreseden de yasaklandı").first()
  ).toBeVisible();
  const owned = (await bans?.bansOf(bans.open.id)) ?? [];
  expect(owned).toHaveLength(2);
  expect(owned[0]).toMatchObject({ scope: "COURSE", liftedAt: null });
  expect(owned[1]).toMatchObject({
    scope: "MADRASAH",
    madrasahId: base?.madrasah.id,
    extendedFromCourseId: base?.first.id,
    reason: "E2E başka derslerde de aynı davranış",
    bannedRole: "MEDRESE_BASMUDERRIS",
  });
  // the medrese-wide ban is a row of its own, over the whole medrese, and cannot be widened again
  await expect(rows(page)).toHaveCount(3);
  const wide = rows(page).filter({ hasText: "bütün dersleri" });
  await expect(wide).toContainText(bans?.open.name ?? "");
  await expect(wide).toContainText(
    `${base?.first.title} dersinden genişletildi`
  );
  await expect(
    wide.getByRole("button", { name: /^Medreseden de yasakla/ })
  ).toHaveCount(0);
});

test("nazir/11 — 'Yasağı kaldır' wants a reason, lifts the ban, and moves it to Kaldırılan (criterion 4)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);

  await rowOf(page, bans?.open.name ?? "")
    .getByRole("button", { name: /^Yasağı kaldır/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "Yasağı kaldır" });
  await expect(dialog).toContainText(bans?.open.name ?? "");
  await expect(dialog).toContainText("E2E celselerde ders dışı reklam yaptı");
  const submit = dialog.getByRole("button", {
    name: "Yasağı kaldır",
    exact: true,
  });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel("Kaldırma gerekçesi").fill("  E2E söz verdi  ");
  await submit.click();

  await expect(page.getByText("Yasak kaldırıldı")).toBeVisible();
  const [lifted] = (await bans?.bansOf(bans.open.id)) ?? [];
  expect(lifted?.liftedAt).not.toBeNull();
  expect(lifted?.liftReason).toBe("E2E söz verdi");

  await expect(tab(page, /^Etkin/)).toContainText("1");
  await expect(tab(page, /^Kaldırılan/)).toContainText("2");
  await tab(page, /^Kaldırılan/).click();
  await expect(rowOf(page, bans?.open.name ?? "")).toContainText(
    "E2E söz verdi"
  );
});

test("nazir/11 — 'Kalıcı yasak talebi aç' records the request with the reason, and the row says it is waiting", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);

  await rowOf(page, bans?.open.name ?? "")
    .getByRole("button", { name: /^Kalıcı yasak talebi aç/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "Kalıcı yasak talebi aç" });
  const submit = dialog.getByRole("button", { name: "Talebi aç", exact: true });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel("Talep gerekçesi").fill("E2E üçüncü kez tekrarladı");
  await submit.click();

  await expect(page.getByText("Kalıcı yasak talebi açıldı")).toBeVisible();
  expect(await bans?.requestsOf(bans.open.id)).toBe(1);
  const own = rowOf(page, bans?.open.name ?? "");
  await expect(own).toContainText("Kalıcı yasak talebi bekliyor");
  await expect(
    own.getByRole("button", { name: /^Kalıcı yasak talebi aç/ })
  ).toHaveCount(0);
  // the ban itself stays open
  const [ban] = (await bans?.bansOf(bans.open.id)) ?? [];
  expect(ban?.liftedAt).toBeNull();
});

test("nazir/11 — 'Yasakla' finds the person by e-mail and bars them from the course chosen", async ({
  as,
}) => {
  test.skip(!directory(), "no TALEBE account");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  barred.push(TALEBE.sub as string);

  await page.getByRole("button", { name: "Yasakla", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Yasakla" });
  const submit = dialog.getByRole("button", { name: "Yasakla", exact: true });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel("Kişinin e-posta adresi").fill(TALEBE.email ?? "");
  await dialog.getByLabel("Kişinin e-posta adresi").press("Enter");
  await expect(dialog.getByTestId("ban-person")).toContainText(
    TALEBE.email ?? ""
  );

  await dialog
    .getByRole("radio", { name: new RegExp(base?.second.title ?? "") })
    .check();
  await dialog.getByLabel("Yasaklama gerekçesi").fill("E2E hesabını paylaştı");
  await submit.click();

  await expect(page.getByText("Yasak kaydedildi")).toBeVisible();
  const [ban] = (await bans?.bansOf(TALEBE.sub as string)) ?? [];
  expect(ban).toMatchObject({
    scope: "COURSE",
    courseId: base?.second.id,
    reason: "E2E hesabını paylaştı",
    bannedRole: "MEDRESE_BASMUDERRIS",
  });
  await expect(rows(page)).toHaveCount(3);
});

test("nazir/11 — a medrese nazır is refused: a notice, no list and no 'Yasakla'", async ({
  as,
}) => {
  test.skip(!(ready() && canSignIn(MEDRESE_NAZIR)), "no medrese nazır account");
  const page = await as("MEDRESE_NAZIR");
  await open(page);
  await expect(page.getByText("Bu sayfaya izniniz yok")).toBeVisible();
  await expect(page.getByTestId("bans")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Yasakla", exact: true })
  ).toHaveCount(0);
});
