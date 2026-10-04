import type { Page } from "@playwright/test";
import { account, canSignIn, expect, test } from "./accounts";
import { type NazirsFixture, seedNazirs } from "./nazirs-seed";
import { type NazirFixture, seedPortal } from "./seed";

/**
 * Design nazir/16 (İzin grubu tanımla / düzenle) against the running app and
 * API with real Keycloak sign-ins (MDRS-185). Defining groups is the medrese
 * başmüderris's and is not behind the version gate. The seeded groups are
 * Fatma's two (Ders açma ve kadro, Yasak ve itiraz) and Ümmügülsüm's one
 * (Kayıt ve talebe işleri): each is held by one person, so each card reads
 * '… izin · 1 nazıra verildi' and each is a used group. Groups and the grants
 * they leave behind are read back from the database.
 */
const BASMUDERRIS = account("MEDRESE_BASMUDERRIS");

let base: NazirFixture | undefined;
let extra: NazirsFixture | undefined;

test.beforeAll(async () => {
  if (!BASMUDERRIS.sub) return;
  base = await seedPortal({ basmuderris: BASMUDERRIS.sub });
});

test.afterAll(async () => {
  await base?.remove();
});

// Editing and deleting change what the next spec reads, so each has its own groups.
test.beforeEach(async () => {
  if (base) extra = await seedNazirs(base);
});

test.afterEach(async () => {
  await extra?.remove();
  extra = undefined;
});

const ready = () => Boolean(base && extra && canSignIn(BASMUDERRIS));

const open = async (page: Page) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/medrese/${base?.madrasah.id}/nazirlar`);
  await expect(
    page.getByRole("heading", { level: 2, name: "İzin grupları" })
  ).toBeVisible();
};

const card = (page: Page, name: string) =>
  page.locator("[data-testid=permission-group]").filter({ hasText: name });

const dialogOf = (page: Page, title: string) =>
  page.getByRole("dialog", { name: title });

const tick = (page: Page, title: string, sentence: string) =>
  dialogOf(page, title).getByRole("checkbox", { name: sentence });

const question = (page: Page) => page.getByRole("alertdialog");

test("nazir/05 — the cards show each group's name, permissions and '2 izin · 1 nazıra verildi' (criterion 5)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  await expect(
    page.getByText(
      "Gruplar yalnız bu medresede ve medrese derslerinde geçerlidir."
    )
  ).toBeVisible();

  const dersAcma = card(page, extra?.groups.dersAcma ?? "");
  await expect(dersAcma).toContainText("2 izin · 1 nazıra verildi");
  await expect(dersAcma).toContainText(
    "Dersi düzenle: başlık, tanıtım, müfredat, saat dilimi"
  );
  await expect(card(page, extra?.groups.yasak ?? "")).toContainText(
    "3 izin · 1 nazıra verildi"
  );
  await expect(card(page, extra?.groups.kayit ?? "")).toContainText(
    "2 izin · 1 nazıra verildi"
  );
});

test("nazir/16 — 'Grup tanımla': a name and two permissions are saved and the card reads '2 izin · 0 nazıra verildi' (criteria 1, 5)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  const name = `E2E Kabul işleri ${extra?.tail}`;

  await page.getByRole("button", { name: "Grup tanımla" }).click();
  const dialog = dialogOf(page, "İzin grubu tanımla");
  await expect(dialog).toContainText(base?.madrasah.name ?? "");
  await expect(dialog).toContainText("Medrese kapsamı · 0 izin seçili");
  await expect(dialog.getByRole("checkbox")).toHaveCount(32);

  // nothing yet: refused on the page, nothing written
  await dialog.getByRole("button", { name: "Grubu kaydet" }).click();
  await expect(dialog).toContainText("Grup adı boş olamaz.");
  await expect(dialog).toContainText("En az bir izin seçin.");

  await dialog.getByLabel("Grup adı").fill(name);
  await tick(page, "İzin grubu tanımla", "Medrese dersi aç").check();
  await tick(
    page,
    "İzin grubu tanımla",
    "Hafta ve celse gizle, geri al"
  ).check();
  await expect(dialog).toContainText("Medrese kapsamı · 2 izin seçili");
  await dialog.getByRole("button", { name: "Grubu kaydet" }).click();

  await expect(page.getByText("Grup kaydedildi")).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(card(page, name)).toContainText("2 izin · 0 nazıra verildi");
  const group = await extra?.groupRow(name);
  expect(group?.permissions).toEqual(["madrasah.course_open", "week.hide"]);
  expect(
    await extra?.auditsOn("permission_group.create", group?.id ?? "")
  ).toBe(1);
});

test("nazir/16 — 'Ders' turns the medrese's permissions off and unticks them (criterion 3)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  await page.getByRole("button", { name: "Grup tanımla" }).click();
  const title = "İzin grubu tanımla";
  const dialog = dialogOf(page, title);
  await tick(page, title, "Medrese dersi aç").check();
  await dialog.getByRole("radio", { name: /^Ders/ }).check();

  await expect(tick(page, title, "Medrese dersi aç")).toBeDisabled();
  await expect(tick(page, title, "Medrese dersi aç")).not.toBeChecked();
  await expect(tick(page, title, "Medrese nazırı ata")).toBeDisabled();
  await expect(
    tick(page, title, "Hafta ve celse gizle, geri al")
  ).toBeEnabled();
  await expect(dialog).toContainText("Ders kapsamı · 0 izin seçili");
});

test("nazir/16 — a name another group has is refused under the field, whatever its case", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  await page.getByRole("button", { name: "Grup tanımla" }).click();
  const dialog = dialogOf(page, "İzin grubu tanımla");
  await dialog
    .getByLabel("Grup adı")
    .fill((extra?.groups.yasak ?? "").toUpperCase());
  await tick(
    page,
    "İzin grubu tanımla",
    "Hafta ve celse gizle, geri al"
  ).check();
  await dialog.getByRole("button", { name: "Grubu kaydet" }).click();
  await expect(dialog).toContainText(
    "Bu adla başka bir grup var. Başka bir ad seçin."
  );
  await expect(dialog).toBeVisible();
});

test("nazir/16 — a rename of a used group is saved without a question", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  const renamed = `E2E Yeni ad ${extra?.tail}`;
  await page
    .getByRole("button", { name: `Düzenle: ${extra?.groups.kayit}` })
    .click();
  const dialog = dialogOf(page, "İzin grubunu düzenle");
  await expect(dialog).toContainText("Bu grubu 1 kişi kullanıyor.");
  await dialog.getByLabel("Grup adı").fill(renamed);
  await dialog.getByRole("button", { name: "Grubu kaydet" }).click();

  await expect(question(page)).toHaveCount(0);
  await expect(page.getByText("Grup kaydedildi")).toBeVisible();
  await expect(card(page, renamed)).toContainText("2 izin · 1 nazıra verildi");
});

test("nazir/16 — changing a used group's permissions asks about the people who use it; nothing is chosen, and 'Grubu kaydet' waits for an answer (criterion 4)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  await page
    .getByRole("button", { name: `Düzenle: ${extra?.groups.kayit}` })
    .click();
  const title = "İzin grubunu düzenle";
  await tick(page, title, "Hafta ve celse gizle, geri al").check();
  await dialogOf(page, title)
    .getByRole("button", { name: "Grubu kaydet" })
    .click();

  const ask = question(page);
  await expect(ask).toContainText("Bu grubu 1 kişi kullanıyor");
  await expect(ask.getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(
    ask.getByRole("button", { name: "Grubu kaydet" })
  ).toBeDisabled();
  await expect(ask.getByRole("button", { name: "Vazgeç" })).toBeFocused();

  await ask.getByRole("radio", { name: /İzinleri korusunlar/ }).check();
  await ask.getByRole("button", { name: "Grubu kaydet" }).click();
  await expect(page.getByText("Grup kaydedildi")).toBeVisible();

  // the group has the new permission; Ümmügülsüm keeps the old ones, one by one
  const group = await extra?.groupRow(extra?.groups.kayit ?? "");
  expect(group?.permissions).toContain("week.hide");
  const held = await extra?.heldGrants(extra?.ummugulsum.id ?? "");
  expect(held?.filter((row) => row.groupId !== null)).toHaveLength(0);
  expect(
    held
      ?.map((row) => row.permission)
      .filter((code) => code !== null)
      .sort()
  ).toEqual(
    expect.arrayContaining(["enrollment.complete", "enrollment.decide"])
  );
});

test("nazir/16 — deleting a used group asks first; 'İzinleri kaybetsinler' takes the permissions back (criterion 4)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  await page
    .getByRole("button", { name: `Düzenle: ${extra?.groups.kayit}` })
    .click();
  await dialogOf(page, "İzin grubunu düzenle")
    .getByRole("button", { name: "Grubu sil" })
    .click();

  const ask = question(page);
  await expect(ask).toContainText("Bu grubu 1 kişi kullanıyor");
  await expect(ask.getByRole("button", { name: "Grubu sil" })).toBeDisabled();
  await ask.getByRole("radio", { name: /İzinleri kaybetsinler/ }).check();
  await ask.getByRole("button", { name: "Grubu sil" }).click();

  await expect(page.getByText("Grup silindi")).toBeVisible();
  await expect(card(page, extra?.groups.kayit ?? "")).toHaveCount(0);
  expect((await extra?.groupRow(extra?.groups.kayit ?? ""))?.deleted).toBe(
    true
  );
  expect(await extra?.heldGrants(extra?.ummugulsum.id ?? "")).toHaveLength(0);
});

test("nazir/16 — 'Vazgeç' on the question deletes nothing", async ({ as }) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  await page
    .getByRole("button", { name: `Düzenle: ${extra?.groups.yasak}` })
    .click();
  await dialogOf(page, "İzin grubunu düzenle")
    .getByRole("button", { name: "Grubu sil" })
    .click();
  await question(page).getByRole("button", { name: "Vazgeç" }).click();
  await expect(question(page)).toHaveCount(0);
  expect((await extra?.groupRow(extra?.groups.yasak ?? ""))?.deleted).toBe(
    false
  );
});
