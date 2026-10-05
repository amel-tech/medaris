import type { Page } from "@playwright/test";
import { account, canSignIn, expect, test } from "./accounts";
import { type NazarFixture, seedPortal } from "./seed";

/**
 * Ders ayarları of a course (MDRS-270) against the running app and API with
 * real Keycloak sign-ins. MEDRESE_BASMUDERRIS is the müderris of both seeded
 * courses and writes only to them: the seed's `remove` takes them out again.
 * DERS_NAZIR is seeded on the first course with no permission at all.
 * SISTEM_ADMIN opens the page by its address, which the başnazım's admission
 * in nazar's shell (the Ders nazırları half of MDRS-270) makes possible: run
 * this file on the integrated branch.
 */
const BASMUDERRIS = account("MEDRESE_BASMUDERRIS");
const DERS_NAZIR = account("DERS_NAZIR");
const ADMIN = account("SISTEM_ADMIN");

let fixture: NazarFixture | undefined;

test.beforeAll(async () => {
  if (!BASMUDERRIS.sub) return;
  fixture = await seedPortal({
    basmuderris: BASMUDERRIS.sub,
    dersNazir: DERS_NAZIR.sub,
  });
});

test.afterAll(async () => {
  await fixture?.remove();
});

const seeded = () => Boolean(fixture && canSignIn(BASMUDERRIS));
const desktop = { width: 1440, height: 900 };

const open = async (page: Page, courseId: string | undefined) => {
  await page.setViewportSize(desktop);
  await page.goto(`/ders/${courseId}/ayarlar`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Ders ayarları" })
  ).toBeVisible();
};

test("the müderris finds every control open, and Kaydet waiting for a change", async ({
  as,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page, fixture?.first.id);

  await expect(page.getByText("Bu sayfa henüz hazır değil.")).toHaveCount(0);
  await expect(
    page.getByRole("checkbox", { name: "Kapalı ders" })
  ).toBeEnabled();
  await expect(
    page.getByRole("checkbox", { name: "Kayıt onayı gereksin" })
  ).toBeEnabled();
  await expect(
    page.getByRole("combobox", { name: "Örnek ders" })
  ).toBeEnabled();
  await expect(
    page.getByRole("combobox", { name: "Saat dilimi" })
  ).toBeEnabled();
  await expect(page.getByRole("button", { name: "Kaydet" })).toBeDisabled();
  await expect(
    page.locator("aside").getByRole("link", { name: /^Ders ayarları/ })
  ).toHaveAttribute("aria-current", "page");
});

test("the müderris changes approval and the sample session, and both stay after a reload", async ({
  as,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page, fixture?.first.id);

  const approval = page.getByRole("checkbox", {
    name: "Kayıt onayı gereksin",
  });
  const before = await approval.isChecked();
  await approval.setChecked(!before);
  await page.getByRole("combobox", { name: "Örnek ders" }).click();
  await page.getByRole("option", { name: "Hafta 1 · Celse 1" }).click();
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(
    page.locator(".mds-toast--success").getByText("Ders ayarları kaydedildi")
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "Kayıt onayı gereksin" })
  ).toBeChecked({ checked: !before });
  await expect(page.getByRole("combobox", { name: "Örnek ders" })).toHaveText(
    "Hafta 1 · Celse 1"
  );
});

test("'Taslağa çek' asks first with the focus on 'Vazgeç', and 'Yayımla' publishes again", async ({
  as,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page, fixture?.second.id);

  const card = page.getByTestId("course-publish");
  await expect(card).toContainText("Yayında");
  await card.getByRole("button", { name: "Taslağa çek" }).click();
  const ask = page.getByRole("alertdialog");
  await expect(ask).toContainText("Dersi taslağa çek");
  await expect(ask.getByRole("button", { name: "Vazgeç" })).toBeFocused();
  await ask.getByRole("button", { name: "Taslağa çek" }).click();
  await expect(card).toContainText("Taslak");

  await card.getByRole("button", { name: "Yayımla" }).click();
  await expect(card).toContainText("Yayında");
});

test("a ders nazırı with no permission is told so, and is shown no control", async ({
  as,
}) => {
  test.skip(
    !fixture || !canSignIn(DERS_NAZIR) || !DERS_NAZIR.sub,
    "no ders nazırı"
  );
  const page = await as("DERS_NAZIR");
  await open(page, fixture?.first.id);

  await expect(page.getByText("Bu sayfaya izniniz yok")).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Kaydet" })).toHaveCount(0);
});

test("the başnazım opens the page by its address, with every control open", async ({
  as,
}) => {
  test.skip(!fixture || !canSignIn(ADMIN), "no başnazım");
  const page = await as("SISTEM_ADMIN");
  await open(page, fixture?.first.id);

  await expect(
    page.getByRole("checkbox", { name: "Kapalı ders" })
  ).toBeEnabled();
  await expect(
    page.getByRole("combobox", { name: "Saat dilimi" })
  ).toBeEnabled();
  await expect(
    page.getByTestId("course-publish").getByRole("button")
  ).toHaveCount(1);
});
