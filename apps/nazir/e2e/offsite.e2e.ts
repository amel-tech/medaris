import type { Page } from "@playwright/test";
import { account, canSignIn, expect, test } from "./accounts";
import { type OffsiteFixture, seedOffsite } from "./people-seed";
import { type NazirFixture, seedPortal } from "./seed";

/**
 * Design nazir/09 (Medrese dışı ders talebi) against the running app and API
 * with real Keycloak sign-ins (MDRS-187): the form, its refusals, and the
 * request it records, read back from the database together with the fact that
 * no course was made. The köşk is chosen among every köşk the API lists, so the
 * spec picks its own by name. The form is the başmüderris's; MEDRESE_NAZIR is
 * only asked what the open owner decision allows: the API refuses it, and the
 * page says so.
 */
const BASMUDERRIS = account("MEDRESE_BASMUDERRIS");
const MEDRESE_NAZIR = account("MEDRESE_NAZIR");

let base: NazirFixture | undefined;
let offsite: OffsiteFixture | undefined;

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
  if (base) offsite = await seedOffsite(base);
});

test.afterEach(async () => {
  await offsite?.remove();
  offsite = undefined;
});

const ready = () => Boolean(base && offsite && canSignIn(BASMUDERRIS));

const open = async (page: Page) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/medrese/${base?.madrasah.id}/dersler/talep`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Medrese dışı ders talebi" })
  ).toBeVisible();
};

const form = (page: Page) => page.getByTestId("offsite-form");
const submit = (page: Page) =>
  form(page).getByRole("button", { name: "Talebi gönder" });

test("nazir/09 — Dersler leads to the form, which has the canvas's fields and says what happens after", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/medrese/${base?.madrasah.id}/dersler`);
  await page
    .getByRole("link", { name: "Medrese dışı ders talebi gönder" })
    .click();
  await expect(page).toHaveURL(/\/dersler\/talep$/);

  await expect(
    page.getByRole("navigation", { name: "Sayfa yolu" })
  ).toContainText("Dersler");
  await expect(form(page).getByLabel("Köşk")).toBeVisible();
  await expect(form(page).getByLabel("Ders adı")).toBeVisible();
  await expect(form(page).getByLabel("Gerekçe")).toBeVisible();
  await expect(
    form(page).getByText("Önerdiğiniz ad; dersi açan değiştirebilir.")
  ).toBeVisible();
  await expect(page.getByText("Talepten sonra")).toBeVisible();
  await expect(
    page.getByText(
      "Kabul edilirse dersi köşk nazımı açar ve müderrislerini seçer."
    )
  ).toBeVisible();
  await expect(
    form(page).getByRole("link", { name: "Vazgeç" })
  ).toHaveAttribute("href", `/medrese/${base?.madrasah.id}/dersler`);
});

test("nazir/09 — a form with a field missing sends nothing and says which, under the field (criterion 2)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  await submit(page).click();

  await expect(page.getByText("Ders adı boş olamaz.")).toBeVisible();
  await expect(page.getByText("Bir gerekçe yazın.")).toBeVisible();
  await expect(form(page).getByLabel("Ders adı")).toBeFocused();
  expect(await offsite?.requests()).toHaveLength(0);
});

test("nazir/09 — köşk, name and reason are recorded as a pending request of the medrese, no course is made, and the way back is Dersler (criteria 1, 4)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  const before = await offsite?.courseCount();

  await form(page).getByRole("combobox").click();
  await page.getByRole("option", { name: base?.first.koskName ?? "" }).click();
  await form(page)
    .getByLabel("Ders adı")
    .fill("  E2E Erbaîn-i Nevevî okumaları ");
  await form(page)
    .getByLabel("Gerekçe")
    .fill("  E2E bu metni okutan bir ders yok.  ");
  await expect(
    page.getByText(`Talep ${base?.first.koskName}`, { exact: false })
  ).toBeVisible();
  await submit(page).click();

  await expect(page).toHaveURL(/\/dersler$/);
  await expect(page.getByText("Talep gönderildi")).toBeVisible();
  const [request] = (await offsite?.requests()) ?? [];
  expect(request).toMatchObject({
    madrasahId: base?.madrasah.id,
    koskId: base?.koskId,
    title: "E2E Erbaîn-i Nevevî okumaları",
    reason: "E2E bu metni okutan bir ders yok.",
    status: "PENDING",
    requestedBy: BASMUDERRIS.sub,
  });
  // the request makes no course, and the list of Dersler does not show it
  expect(await offsite?.courseCount()).toBe(before);
  await expect(
    page.getByTestId("courses").getByText("E2E Erbaîn-i Nevevî okumaları")
  ).toHaveCount(0);
});

test("nazir/09 — a medrese nazır is refused: a notice and no form", async ({
  as,
}) => {
  test.skip(!(ready() && canSignIn(MEDRESE_NAZIR)), "no medrese nazır account");
  const page = await as("MEDRESE_NAZIR");
  await open(page);
  await expect(page.getByText("Bu sayfaya izniniz yok")).toBeVisible();
  await expect(form(page)).toHaveCount(0);
});
