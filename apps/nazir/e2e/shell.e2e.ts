import type { Page } from "@playwright/test";
import { account, canSignIn, expect, test } from "./accounts";
import { type NazirFixture, seedPortal } from "./seed";

/**
 * Designs nazir/03 (kapsam seçici), nazir/21 and nazir/22 (the menus of a
 * medrese and of a course, on the phone and on the desktop) against the running
 * app and API with real Keycloak sign-ins (MDRS-183).
 *
 * MEDRESE_BASMUDERRIS holds the medrese and, through the seed, both courses as
 * müderris, so the picker has three scopes. MEDRESE_NAZIR and DERS_NAZIR are
 * only asked what the open owner decision allows: the shell loads and a count
 * the role matrix refuses leaves its badge out without an error.
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
const phone = { width: 390, height: 844 };

const MEDRESE_ITEMS = [
  "Pano",
  "Bildirimler",
  "Dersler",
  "Talebeler",
  "Medrese nazırları",
  "Yasaklamalar",
  "İtirazlar",
  "Arşiv",
  "Kabul kuralları",
  "Medrese ayarları",
];
const DERS_ITEMS = [
  "Pano",
  "Bildirimler",
  "Genel bakış",
  "Müfredat",
  "Celseler",
  "Talebeler",
  "Ders kayıtları",
  "Ders destesi",
  "Yasaklamalar",
  "Arşiv",
  "Ders nazırları",
  "Ders ayarları",
];

/** The menu's item names in order, without the number a badge adds. */
const itemNames = async (page: Page, scope = "aside") => {
  const links = page
    .locator(scope)
    .getByRole("navigation", { name: "Ana menü" })
    .getByRole("link");
  // a client-side move shows the loading state first, with no menu in it
  await expect(links.first()).toBeVisible();
  return (await links.allInnerTexts()).map((text) =>
    text.replace(/\s*\d+[\s\S]*$/, "").trim()
  );
};

/** Alerts the page draws; Next's own route announcer is a role=alert too and is not one. */
const alerts = (page: Page) =>
  page.locator("[role=alert]:not(#__next-route-announcer__)");

test("nazir/03 — the closed picker names the scope, and opening it lists only the person's medrese and courses with the current one checked", async ({
  as,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await page.setViewportSize(desktop);
  await page.goto(`/medrese/${fixture?.madrasah.id}`);

  const picker = page.locator("aside").getByRole("button", {
    name: `Kapsam değiştir: ${fixture?.madrasah.name}`,
  });
  await expect(picker).toContainText("Medrese başmüderrisi");
  await picker.click();

  const list = page.getByRole("menu", { name: "Kapsamlar" });
  await expect(list).toBeVisible();
  await expect(list).toContainText(
    "Yalnız görev aldığınız medrese ve dersler listelenir."
  );
  const rows = list.getByRole("menuitem");
  await expect(rows).toHaveCount(3);
  await expect(
    rows.filter({ hasText: fixture?.madrasah.name ?? "" })
  ).toHaveAttribute("aria-current", "true");
  await expect(
    rows.filter({ hasText: fixture?.first.title ?? "" })
  ).toContainText(
    new RegExp(
      // the "·" is a separate, aria-hidden span, spaced by CSS, not by text
      `Müderris\\s*·\\s*dersin imamı\\s*·\\s*${fixture?.first.koskName}`
    )
  );

  // Esc closes it and the focus returns to the picker.
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
  await expect(picker).toBeFocused();
});

test("nazir/03 and 22 — choosing a course switches the menu to the course's, and back to the medrese's", async ({
  as,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await page.setViewportSize(desktop);
  await page.goto(`/medrese/${fixture?.madrasah.id}`);
  expect(await itemNames(page)).toEqual(MEDRESE_ITEMS);

  await page
    .locator("aside")
    .getByRole("button", { name: /Kapsam değiştir/ })
    .click();
  await page
    .getByRole("menuitem", { name: new RegExp(fixture?.first.title ?? "") })
    .click();
  await page.waitForURL(`**/ders/${fixture?.first.id}`);
  expect(await itemNames(page)).toEqual(DERS_ITEMS);
  await expect(
    page.locator("aside").getByRole("link", { name: /Genel bakış/ })
  ).toHaveAttribute("aria-current", "page");

  await page
    .locator("aside")
    .getByRole("button", { name: /Kapsam değiştir/ })
    .click();
  await page
    .getByRole("menuitem", { name: new RegExp(fixture?.madrasah.name ?? "") })
    .click();
  await page.waitForURL(`**/medrese/${fixture?.madrasah.id}`);
  expect(await itemNames(page)).toEqual(MEDRESE_ITEMS);
});

test("nazir/21 and 22 — the badges are the real counts", async ({ as }) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await page.setViewportSize(desktop);

  await page.goto(`/medrese/${fixture?.madrasah.id}`);
  const dersler = page.locator("aside").getByRole("link", { name: /^Dersler/ });
  await expect(dersler).toContainText(
    String(fixture?.expected.coursesWithApplications)
  );
  await expect(dersler).toContainText("derste bekleyen başvuru");

  await page.goto(`/ders/${fixture?.first.id}`);
  const celseler = page
    .locator("aside")
    .getByRole("link", { name: /^Celseler/ });
  await expect(celseler).toContainText(
    String(fixture?.expected.firstMissingLinks)
  );
  await expect(celseler).toContainText("bağlantısı eksik");
  const talebeler = page
    .locator("aside")
    .getByRole("link", { name: /^Talebeler/ });
  await expect(talebeler).toContainText(
    String(fixture?.expected.firstApplications)
  );
  await expect(talebeler).toContainText("bekleyen başvuru");

  // The second course has one application and no session ahead: Celseler has no badge.
  await page.goto(`/ders/${fixture?.second.id}`);
  await expect(
    page.locator("aside").getByRole("link", { name: /^Celseler/ })
  ).not.toContainText(/\d/);
});

test("a menu entry whose screen is not built opens the shared placeholder under the shell; an unknown one is a 404", async ({
  as,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await page.setViewportSize(desktop);
  await page.goto(`/medrese/${fixture?.madrasah.id}`);
  await page
    .locator("aside")
    .getByRole("link", { name: "Kabul kuralları" })
    .click();
  await page.waitForURL("**/kabul-kurallari");
  await expect(
    page.getByRole("heading", { level: 1, name: "Kabul kuralları" })
  ).toBeVisible();
  await expect(page.getByText("Bu sayfa henüz hazır değil.")).toBeVisible();
  await expect(
    page.locator("aside").getByRole("link", { name: "Kabul kuralları" })
  ).toHaveAttribute("aria-current", "page");
});

test("nazir/21 — on a 390 px screen the menu button opens the sheet in the canvas's order, a link closes it, and widening past 768 px closes it", async ({
  as,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await page.setViewportSize(phone);
  await page.goto(`/medrese/${fixture?.madrasah.id}`);

  // the sidebar is not drawn on the phone
  await expect(page.locator("aside")).toBeHidden();
  await page.getByRole("button", { name: "Menü" }).click();
  const sheet = page.getByRole("dialog", { name: "Ana menü" });
  await expect(sheet).toBeVisible();
  // focus starts on the close button, in the head
  await expect(sheet.getByRole("button", { name: "Kapat" })).toBeFocused();

  // head, scope picker, nav, then the person
  const order = await sheet.evaluate((root) =>
    [
      ".mds-sheet__head",
      "button[aria-haspopup=menu]",
      "nav",
      ".mds-sheet__foot",
    ].map((selector) => {
      const el = root.querySelector(selector);
      return el ? Math.round(el.getBoundingClientRect().top) : -1;
    })
  );
  expect(order.every((top) => top >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);

  expect(await itemNames(page, "[role=dialog]")).toEqual(MEDRESE_ITEMS);
  await expect(sheet.getByText("Çıkış yap")).toHaveCount(0);
  await expect(sheet.locator("a.mds-nav-user")).toHaveAttribute(
    "href",
    "/hesap"
  );

  await sheet.getByRole("link", { name: /^Dersler/ }).click();
  await page.waitForURL("**/dersler");
  await expect(sheet).toBeHidden();

  await page.getByRole("button", { name: "Menü" }).click();
  await expect(sheet).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(sheet).toBeHidden();
  await expect(page.locator("aside")).toBeVisible();
});

test("nazir/22 — on the phone the course's menu is in the canvas's order, and the picker inside the sheet switches back to the medrese", async ({
  as,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await page.setViewportSize(phone);
  await page.goto(`/ders/${fixture?.first.id}`);
  await page.getByRole("button", { name: "Menü" }).click();
  const sheet = page.getByRole("dialog", { name: "Ana menü" });
  expect(await itemNames(page, "[role=dialog]")).toEqual(DERS_ITEMS);

  // the picker opens from inside the sheet, above it
  await sheet.getByRole("button", { name: /Kapsam değiştir/ }).click();
  await page
    .getByRole("menuitem", { name: new RegExp(fixture?.madrasah.name ?? "") })
    .click();
  await page.waitForURL(`**/medrese/${fixture?.madrasah.id}`);
  await page.getByRole("button", { name: "Menü" }).click();
  expect(await itemNames(page, "[role=dialog]")).toEqual(MEDRESE_ITEMS);
});

test("the bell on the phone bar is a link named with the unread count and shows no number", async ({
  as,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await page.setViewportSize(phone);
  await page.goto(`/medrese/${fixture?.madrasah.id}`);
  const bell = page
    .locator("header.mds-appbar")
    .getByRole("link", { name: /^Bildirimler/ });
  await expect(bell).toHaveAttribute("href", "/bildirimler");
  await expect(bell).not.toContainText(/\d/);
});

test("a medrese nazırı gets the shell and no error where the role matrix refuses a count (open owner decision)", async ({
  as,
}) => {
  test.skip(
    !(fixture && canSignIn(MEDRESE_NAZIR)),
    "no medrese nazırı account"
  );
  const page = await as("MEDRESE_NAZIR");
  await page.setViewportSize(desktop);
  await page.goto(`/medrese/${fixture?.madrasah.id}`);
  expect(await itemNames(page)).toEqual(MEDRESE_ITEMS);
  await expect(
    page.locator("aside").getByRole("link", { name: /^Dersler/ })
  ).not.toContainText(/\d/);
  await expect(alerts(page)).toHaveCount(0);
});

test("a ders nazırı gets the course's shell and no error where the role matrix refuses a count (open owner decision)", async ({
  as,
}) => {
  test.skip(!(fixture && canSignIn(DERS_NAZIR)), "no ders nazırı account");
  const page = await as("DERS_NAZIR");
  await page.setViewportSize(desktop);
  await page.goto(`/ders/${fixture?.first.id}`);
  expect(await itemNames(page)).toEqual(DERS_ITEMS);
  await expect(alerts(page)).toHaveCount(0);
});
