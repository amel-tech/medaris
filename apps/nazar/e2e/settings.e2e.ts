import type { Page } from "@playwright/test";
import { account, canSignIn, expect, test } from "./accounts";
import { type NazirsFixture, seedNazirs } from "./nazirs-seed";
import { type NazarFixture, seedPortal } from "./seed";

/**
 * Design nazir/04 (Medrese ayarları) against the running app and API with real
 * Keycloak sign-ins (MDRS-184). The settings are the medrese başmüderris's;
 * MEDRESE_NAZIR is only asked what the open owner decision allows: the API
 * refuses it, and the page says so instead of drawing a form.
 */
const BASMUDERRIS = account("MEDRESE_BASMUDERRIS");
const MEDRESE_NAZIR = account("MEDRESE_NAZIR");

let base: NazarFixture | undefined;
let extra: NazirsFixture | undefined;

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

test.beforeEach(async () => {
  if (base) extra = await seedNazirs(base);
});

test.afterEach(async () => {
  await extra?.remove();
  extra = undefined;
});

const ready = () => Boolean(base && extra && canSignIn(BASMUDERRIS));
const desktop = { width: 1440, height: 900 };

const day = (at: Date) =>
  new Intl.DateTimeFormat("tr", {
    dateStyle: "long",
    timeZone: "Europe/Istanbul",
  }).format(at);

const open = async (page: Page) => {
  await page.setViewportSize(desktop);
  await page.goto(`/medrese/${base?.madrasah.id}/ayarlar`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Medrese ayarları" })
  ).toBeVisible();
};

test("nazir/04 — the form shows what is saved, the last change, the four levels and the courses the policies apply to", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);

  await expect(
    page.getByLabel("Medrese adı").filter({ visible: true })
  ).toHaveValue(base?.madrasah.name ?? "");
  await expect(
    page.getByLabel("Açıklama").filter({ visible: true })
  ).toHaveValue(extra?.description ?? "");
  await expect(
    page.getByRole("checkbox", { name: "Kayıt her zaman onaylı" })
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Kapalı ders zorunlu" })
  ).not.toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Ders kayıtları herkese açılamaz" })
  ).not.toBeChecked();
  await expect(
    page.getByTestId("last-change").filter({ visible: true })
  ).toHaveText(`Son değişiklik 29 Eylül 2026 · ${extra?.lastChange.by.name}`);

  // criterion 5: the four levels, in order, the medrese's own marked
  const tiers = page.getByTestId("policy-tiers").getByRole("listitem");
  await expect(tiers).toHaveCount(4);
  await expect(tiers.nth(0)).toContainText("Medaris");
  await expect(tiers.nth(1)).toContainText("Dersin açıldığı köşk");
  await expect(tiers.nth(2)).toContainText(base?.madrasah.name ?? "");
  await expect(tiers.nth(2)).toContainText("Bu sayfa");
  await expect(tiers.nth(3)).toContainText("Ders ayarları");

  // the published courses and the draft are listed, the hidden one is not
  const courses = page.getByTestId("policy-courses").getByRole("listitem");
  await expect(courses).toHaveCount(3);
  await expect(
    courses.filter({ hasText: base?.first.title ?? "" })
  ).toContainText("Yayında");
  await expect(
    courses.filter({ hasText: extra?.draft.title ?? "" })
  ).toContainText("Taslak");
  await expect(
    page.getByTestId("policy-courses").getByText(extra?.hidden.title ?? "")
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Medrese dersleri" })
  ).toHaveAttribute("href", `/medrese/${base?.madrasah.id}/dersler`);

  const view = page.getByRole("link", { name: /Medrese sayfasını gör/ });
  await expect(view).toHaveAttribute("target", "_blank");
  await expect(view).toHaveAttribute(
    "href",
    new RegExp(`/tr/madrasahs/${base?.madrasah.id}$`)
  );
});

test("nazir/04 — Kaydet waits for a change, and Vazgeç takes it back", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);

  const save = page.getByRole("button", { name: "Kaydet" });
  const cancel = page.getByRole("button", { name: "Vazgeç" });
  await expect(save).toBeDisabled();
  await expect(cancel).toBeDisabled();

  await page
    .getByLabel("Medrese adı")
    .filter({ visible: true })
    .fill("Başka bir ad");
  await page.getByRole("checkbox", { name: "Kapalı ders zorunlu" }).check();
  await expect(save).toBeEnabled();
  await cancel.click();
  await expect(
    page.getByLabel("Medrese adı").filter({ visible: true })
  ).toHaveValue(base?.madrasah.name ?? "");
  await expect(
    page.getByRole("checkbox", { name: "Kapalı ders zorunlu" })
  ).not.toBeChecked();
  await expect(save).toBeDisabled();
  expect((await extra?.medreseName())?.name).toBe(base?.madrasah.name);
});

test("nazir/04 — a blank name is refused under its field and nothing is saved (criterion 1)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);

  await page.getByLabel("Medrese adı").filter({ visible: true }).fill("   ");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(
    page.getByText("Medrese adı boş olamaz.").filter({ visible: true })
  ).toBeVisible();
  await expect(
    page.getByLabel("Medrese adı").filter({ visible: true })
  ).toHaveAttribute("aria-invalid", "true");
  expect((await extra?.medreseName())?.name).toBe(base?.madrasah.name);
  expect(await extra?.audits("madrasah.settings.update")).toBe(0);
});

test("nazir/04 — Kaydet writes the name, the description and a policy, moves 'Son değişiklik', and it is still there after a reload (criteria 2, 3)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);

  const name = `${base?.madrasah.name} (yeni)`;
  await page.getByLabel("Medrese adı").filter({ visible: true }).fill(name);
  await page
    .getByLabel("Açıklama")
    .filter({ visible: true })
    .fill("Yeni açıklama.");
  await page.getByRole("checkbox", { name: "Kapalı ders zorunlu" }).check();
  await page.getByRole("button", { name: "Kaydet" }).click();

  await expect(
    page.getByText("Ayarlar kaydedildi.").filter({ visible: true })
  ).toBeVisible();
  await expect(
    page.getByTestId("last-change").filter({ visible: true })
  ).toContainText(`Son değişiklik ${day(new Date())}`);
  await expect(page.getByRole("button", { name: "Kaydet" })).toBeDisabled();

  // the sidebar's scope carries the new name, and the database holds all three
  await expect(page.locator("aside")).toContainText(name);
  expect(await extra?.medreseName()).toEqual({
    name,
    description: "Yeni açıklama.",
  });
  expect((await extra?.settingsRow())?.policies).toEqual({
    closedCourseRequired: true,
    alwaysApproval: true,
    noPublicRecordings: false,
  });
  expect(await extra?.audits("madrasah.settings.update")).toBe(1);

  await page.reload();
  await expect(
    page.getByLabel("Medrese adı").filter({ visible: true })
  ).toHaveValue(name);
  await expect(
    page.getByLabel("Açıklama").filter({ visible: true })
  ).toHaveValue("Yeni açıklama.");
  await expect(
    page.getByRole("checkbox", { name: "Kapalı ders zorunlu" })
  ).toBeChecked();
  await expect(
    page.getByTestId("last-change").filter({ visible: true })
  ).toContainText(`Son değişiklik ${day(new Date())}`);
});

test("nazir/04 — emptying the description clears it, and switching a policy off keeps the others", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);

  // A value typed before the page has hydrated is put back by React; Kaydet
  // only turns on once the change has been seen, so repeat until it has.
  await expect(async () => {
    await page.getByLabel("Açıklama").filter({ visible: true }).fill("");
    await expect(page.getByRole("button", { name: "Kaydet" })).toBeEnabled({
      timeout: 1000,
    });
  }).toPass();
  await page
    .getByRole("checkbox", { name: "Kayıt her zaman onaylı" })
    .uncheck();
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(
    page.getByText("Ayarlar kaydedildi.").filter({ visible: true })
  ).toBeVisible();

  expect((await extra?.medreseName())?.description).toBeNull();
  expect((await extra?.settingsRow())?.policies).toEqual({
    closedCourseRequired: false,
    alwaysApproval: false,
    noPublicRecordings: false,
  });
});

test("nazir/04 — a medrese nazır is refused: a notice, no form (criterion 4)", async ({
  as,
}) => {
  test.skip(!(ready() && canSignIn(MEDRESE_NAZIR)), "no medrese nazır account");
  const page = await as("MEDRESE_NAZIR");
  await page.setViewportSize(desktop);
  await page.goto(`/medrese/${base?.madrasah.id}/ayarlar`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Medrese ayarları" })
  ).toBeVisible();
  await expect(
    page.getByText("Bu sayfaya izniniz yok").filter({ visible: true })
  ).toBeVisible();
  await expect(page.getByTestId("settings-form")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Kaydet" })).toHaveCount(0);
});
