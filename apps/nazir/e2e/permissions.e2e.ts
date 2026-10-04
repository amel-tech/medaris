import type { Page } from "@playwright/test";
import { account, canSignIn, expect, test } from "./accounts";
import { type NazirsFixture, seedNazirs } from "./nazirs-seed";
import { type NazirFixture, seedPortal } from "./seed";

/**
 * Design nazir/06 (İzinleri düzenle / İzin ver) against the running app and API
 * with real Keycloak sign-ins (MDRS-185). Giving permissions is the medrese
 * başmüderris's; what a MEDRESE_NAZIR meets on the page is nazir/05's spec. The
 * 4 Ekim 2026 version gate is gone (MDRS-215); the specs still pin the
 * browser's clock so dates on the page are stable. Permissions are records the API keeps; nothing
 * the API decides reads them yet, so the specs read them back from the database.
 * Abdullah holds nothing ("İzin ver"); Ümmügülsüm holds a group that ends.
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

// The screen shows moments in the browser's zone unless the account has one:
// pinned, the end dates below mean the same instant on any machine (MDRS-254).
test.use({ timezoneId: "Europe/Istanbul" });

// Giving changes what the next spec reads, so each one has its own nazırs.
test.beforeEach(async () => {
  if (base) extra = await seedNazirs(base);
});

test.afterEach(async () => {
  await extra?.remove();
  extra = undefined;
});

const ready = () => Boolean(base && extra && canSignIn(BASMUDERRIS));

/** What the date-and-time picker shows for an instant in Istanbul: YYYY-MM-DDTHH:mm. */
const istanbulMinute = (at: Date): string => {
  const part = (type: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Istanbul",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(at)
      .find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
};

const BEFORE = "2026-10-02T09:00:00+03:00";
const AFTER = "2026-10-05T10:00:00+03:00";

const open = async (page: Page, clock = AFTER) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.setFixedTime(new Date(clock));
  await page.goto(`/medrese/${base?.madrasah.id}/nazirlar`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Medrese nazırları" })
  ).toBeVisible();
};

const rowOf = (page: Page, text: string) =>
  page
    .locator("[data-testid=nazirs] tbody tr:visible")
    .filter({ hasText: text });

const editor = (page: Page) =>
  page.getByRole("dialog", { name: "İzinleri düzenle" });

const choose = async (page: Page, select: string, option: string) => {
  await editor(page).getByRole("combobox", { name: select }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
};

const tick = (page: Page, sentence: string) =>
  editor(page).getByRole("checkbox", { name: sentence });

test("nazir/06 — 'İzin ver' and 'İzinleri düzenle' are on whatever the date (MDRS-215: no version gate)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page, BEFORE);
  await expect(
    page.getByRole("button", { name: `İzin ver: ${extra?.abdullah.name}` })
  ).toBeEnabled();
  await expect(
    page.getByRole("button", {
      name: `İzinleri düzenle: ${extra?.ummugulsum.name}`,
    })
  ).toBeEnabled();
});

test("nazir/06 — 'İzin ver': a group and one extra permission are saved, and the row shows the group chip and 'Ayrıca 1 izin' (criteria 1, 4, 5)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  await page
    .getByRole("button", { name: `İzin ver: ${extra?.abdullah.name}` })
    .click();

  const dialog = editor(page);
  await expect(dialog).toContainText(base?.madrasah.name ?? "");
  await expect(dialog).toContainText(extra?.abdullah.email ?? "");
  await expect(dialog.getByRole("checkbox")).toHaveCount(32);
  await expect(dialog).toContainText("Hiç izin seçilmedi");

  // the group's permissions come ticked and locked
  await choose(page, "Hazır izin grubu", extra?.groups.kayit ?? "");
  const decide = tick(page, "Başvuruyu onayla ya da reddet");
  await expect(decide).toBeChecked();
  await expect(decide).toBeDisabled();
  await expect(dialog).toContainText("Gruptan gelir.");
  await expect(dialog).toContainText("Gruptan 2 izin");

  await tick(page, "Hafta ve celse gizle, geri al").check();
  await expect(dialog).toContainText("Gruptan 2 izin ve 1 ek izin");
  await dialog.getByRole("button", { name: "Kaydet" }).click();

  await expect(page.getByText("İzinler kaydedildi")).toBeVisible();
  await expect(dialog).toBeHidden();
  const abdullah = rowOf(page, extra?.abdullah.name ?? "");
  await expect(abdullah).toContainText(extra?.groups.kayit ?? "");
  await expect(abdullah).toContainText("Ayrıca 1 izin:");
  await expect(abdullah).toContainText("Süresiz");
  await expect(
    abdullah.getByRole("button", { name: /^İzinleri düzenle/ })
  ).toBeVisible();
  // he held nothing: the band that named him is gone
  await expect(
    page.getByRole("status").filter({ hasText: "henüz izin almadı" })
  ).toHaveCount(0);

  const held = await extra?.heldGrants(extra?.abdullah.id ?? "");
  expect(held).toHaveLength(2);
  expect(held?.every((row) => row.scopeId === base?.madrasah.id)).toBe(true);
  expect(
    held?.some((row) => row.groupId !== null && row.permission === null)
  ).toBe(true);
  expect(held?.some((row) => row.permission === "week.hide")).toBe(true);
  expect(
    await extra?.auditsOn("permission.grant", extra?.abdullah.id ?? "")
  ).toBe(1);
});

test("nazir/06 — 'İzinleri düzenle' opens with what the nazır holds and replaces it: the group stays locked, the end is cleared (criterion 4)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  await page
    .getByRole("button", {
      name: `İzinleri düzenle: ${extra?.ummugulsum.name}`,
    })
    .click();

  const dialog = editor(page);
  await expect(
    dialog.getByRole("combobox", { name: "Hazır izin grubu" })
  ).toContainText(extra?.groups.kayit ?? "");
  await expect(tick(page, "Başvuruyu onayla ya da reddet")).toBeDisabled();
  await expect(
    dialog.getByLabel("Bitiş tarihi ve saati (isteğe bağlı)")
  ).toHaveValue(istanbulMinute(extra?.endsAt as Date));

  await dialog.getByLabel("Bitiş tarihi ve saati (isteğe bağlı)").fill("");
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("İzinler kaydedildi")).toBeVisible();

  const ummugulsum = rowOf(page, extra?.ummugulsum.name ?? "");
  await expect(ummugulsum).toContainText(extra?.groups.kayit ?? "");
  await expect(ummugulsum).toContainText("Süresiz");
  const held = await extra?.heldGrants(extra?.ummugulsum.id ?? "");
  expect(held).toHaveLength(1);
  expect(held?.[0]?.expiresAt).toBeNull();
});

test("nazir/06 — the end is a moment to come: one that is not after now is refused on the page, a later one is saved as typed (criterion 3)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  await page
    .getByRole("button", { name: `İzin ver: ${extra?.abdullah.name}` })
    .click();
  const dialog = editor(page);
  await tick(page, "Medrese nazırı ata").check();
  await dialog
    .getByLabel("Bitiş tarihi ve saati (isteğe bağlı)")
    .fill("2026-10-01T12:00");
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(dialog).toContainText("Bitiş zamanı şu andan sonra olmalı.");
  expect(await extra?.heldGrants(extra?.abdullah.id ?? "")).toHaveLength(0);

  await dialog
    .getByLabel("Bitiş tarihi ve saati (isteğe bağlı)")
    .fill("2027-03-15T23:59");
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("İzinler kaydedildi")).toBeVisible();
  await expect(rowOf(page, extra?.abdullah.name ?? "")).toContainText(
    "15 Mart 2027"
  );
  const [row] = (await extra?.heldGrants(extra?.abdullah.id ?? "")) ?? [];
  expect(row?.permission).toBe("madrasah.nazir_appoint");
  // the close of 15 Mart in Istanbul, 23:59 (UTC+3)
  expect(row?.expiresAt?.toISOString()).toBe("2027-03-15T20:59:00.000Z");
});

test("nazir/06 — course permissions can be limited to chosen courses; the row says which", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  await page
    .getByRole("button", { name: `İzin ver: ${extra?.abdullah.name}` })
    .click();
  const dialog = editor(page);
  await tick(page, "Hafta ve celse gizle, geri al").check();
  await expect(dialog).toContainText(
    "Bütün medrese dersleri, sonradan açılacak dersleri de kapsar."
  );

  await choose(page, "Hangi derslerde", "Seçtiğim dersler");
  // nothing chosen yet: refused on the page
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(dialog).toContainText("En az bir ders seçin.");
  expect(await extra?.heldGrants(extra?.abdullah.id ?? "")).toHaveLength(0);

  await dialog.getByRole("checkbox", { name: base?.first.title ?? "" }).check();
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("İzinler kaydedildi")).toBeVisible();

  await expect(rowOf(page, extra?.abdullah.name ?? "")).toContainText(
    `Ders izinleri yalnız şu derslerde: ${base?.first.title}`
  );
  const held = await extra?.heldGrants(extra?.abdullah.id ?? "");
  expect(held).toHaveLength(1);
  expect(held?.[0]).toMatchObject({
    scopeType: "course",
    scopeId: base?.first.id,
    permission: "week.hide",
  });

  // it opens again as it was left
  await page
    .getByRole("button", { name: `İzinleri düzenle: ${extra?.abdullah.name}` })
    .click();
  await expect(
    editor(page).getByRole("combobox", { name: "Hangi derslerde" })
  ).toContainText("Seçtiğim dersler");
  await expect(
    editor(page).getByRole("checkbox", { name: base?.first.title ?? "" })
  ).toBeChecked();
});

test("nazir/06 — 'Vazgeç' writes nothing", async ({ as }) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  await page
    .getByRole("button", { name: `İzin ver: ${extra?.abdullah.name}` })
    .click();
  await tick(page, "Medrese nazırı ata").check();
  await editor(page).getByRole("button", { name: "Vazgeç" }).click();
  await expect(editor(page)).toBeHidden();
  expect(await extra?.heldGrants(extra?.abdullah.id ?? "")).toHaveLength(0);
});
