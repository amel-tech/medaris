import { account, canSignIn, expect, test } from "./accounts";
import { type NazirFixture, seedPortal } from "./seed";

/**
 * Celseler, Talebeler, Müfredat and Ders kayıtları of a course against the
 * running app and API with real Keycloak sign-ins (MDRS-247). Read-only on
 * purpose: the seed's counts are what the other specs assert, so nothing here
 * decides an application, cancels a session, saves the course or adds a
 * recording. The writes are covered by the page specs, with the API's answers
 * stubbed.
 *
 * MEDRESE_BASMUDERRIS holds both seeded courses as müderris. The first course
 * has two sessions ahead, only one with a meeting link, and two waiting
 * applications.
 */
const BASMUDERRIS = account("MEDRESE_BASMUDERRIS");
const MEDRESE_NAZIR = account("MEDRESE_NAZIR");
const DERS_NAZIR = account("DERS_NAZIR");

let fixture: NazirFixture | undefined;

test.beforeAll(async () => {
  if (!BASMUDERRIS.sub) return;
  fixture = await seedPortal({
    basmuderris: BASMUDERRIS.sub,
    medreseNazir: MEDRESE_NAZIR.sub,
    dersNazir: DERS_NAZIR.sub,
  });
});

test.afterAll(async () => {
  await fixture?.remove();
});

const seeded = () => Boolean(fixture && canSignIn(BASMUDERRIS));
const desktop = { width: 1440, height: 900 };

test("Celseler lists the course's sessions, says which has no link, and offers to plan more", async ({
  as,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await page.setViewportSize(desktop);

  await page.goto(`/ders/${fixture?.first.id}/celseler`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Celseler" })
  ).toBeVisible();
  await expect(page.getByText("Bu sayfa henüz hazır değil.")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Celse planla" })
  ).toHaveAttribute("href", `/ders/${fixture?.first.id}/celseler/planla`);

  const upcoming = page.getByRole("table", { name: "Yaklaşan celseler" });
  await expect(upcoming.getByRole("row")).toHaveCount(3);
  await expect(upcoming).toContainText("Celse 1");
  await expect(upcoming).toContainText("Eklenmedi");
  await expect(upcoming).toContainText("Celse 2");
  await expect(
    page.locator("aside").getByRole("link", { name: /^Celseler/ })
  ).toHaveAttribute("aria-current", "page");
});

test("Celse planla opens its form under the course's Celseler", async ({
  as,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await page.setViewportSize(desktop);

  await page.goto(`/ders/${fixture?.first.id}/celseler/planla`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Celse planla" })
  ).toBeVisible();
  // nothing is planned yet, so nothing can be created
  await expect(
    page.getByRole("button", { name: "0 celse oluştur" })
  ).toBeDisabled();
});

test("Talebeler counts the waiting applications and lists them under Başvurular", async ({
  as,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await page.setViewportSize(desktop);

  await page.goto(`/ders/${fixture?.first.id}/talebeler`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Talebeler" })
  ).toBeVisible();
  await expect(page.getByText("Bu sayfa henüz hazır değil.")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /^Başvurular/ })).toContainText(
    "2"
  );
  await expect(page.getByRole("button", { name: /^Onayla: / })).toHaveCount(2);
  await expect(
    page.locator("aside").getByRole("link", { name: /^Talebeler/ })
  ).toHaveAttribute("aria-current", "page");
});

test("Müfredat opens the course's form, with nothing to save until something changes", async ({
  as,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await page.setViewportSize(desktop);

  await page.goto(`/ders/${fixture?.first.id}/mufredat`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Müfredat" })
  ).toBeVisible();
  await expect(page.getByText("Bu sayfa henüz hazır değil.")).toHaveCount(0);
  await expect(page.getByLabel(/^Ders adı/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Kaydet" })).toBeDisabled();
  await expect(
    page.locator("aside").getByRole("link", { name: /^Müfredat/ })
  ).toHaveAttribute("aria-current", "page");
});

test("Ders kayıtları lists the course's sessions by week and says nothing is uploaded here", async ({
  as,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await page.setViewportSize(desktop);

  await page.goto(`/ders/${fixture?.first.id}/kayitlar`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Ders kayıtları" })
  ).toBeVisible();
  await expect(page.getByText("Bu sayfa henüz hazır değil.")).toHaveCount(0);
  await expect(page.getByText(/Burada yükleme yoktur/)).toBeVisible();
  await expect(
    page.locator("aside").getByRole("link", { name: /^Ders kayıtları/ })
  ).toHaveAttribute("aria-current", "page");
});
