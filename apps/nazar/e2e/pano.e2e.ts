import type { Page } from "@playwright/test";
import { account, canSignIn, expect, test } from "./accounts";
import { type PanoFixture, seedPano } from "./people-seed";
import { type NazirFixture, seedPortal } from "./seed";

/**
 * Design nazir/01 (Pano) against the running app and API with real Keycloak
 * sign-ins (MDRS-187): the medrese's three scope cards, the sessions of the
 * next seven days, the applications waiting and the köşks that host the
 * medrese, and "Onayla" and "Reddet", whose effect is read back from the
 * database. The başmüderris is also the müderris of both courses, which is what
 * lets them decide the applications; MEDRESE_NAZIR is only asked what the open
 * owner decision allows: the API refuses the dashboard, and the Pano says so
 * under the cards.
 */
const BASMUDERRIS = account("MEDRESE_BASMUDERRIS");
const MEDRESE_NAZIR = account("MEDRESE_NAZIR");

let base: NazirFixture | undefined;
let pano: PanoFixture | undefined;

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

// A decision changes what the next spec reads, so each has its own applications.
test.beforeEach(async () => {
  if (base && BASMUDERRIS.sub) pano = await seedPano(base, BASMUDERRIS.sub);
});

test.afterEach(async () => {
  await pano?.remove();
  pano = undefined;
});

const ready = () => Boolean(base && pano && canSignIn(BASMUDERRIS));

const open = async (page: Page) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/medrese/${base?.madrasah.id}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Pano" })
  ).toBeVisible();
};

const applications = (page: Page) =>
  page.locator("[data-testid=applications] tbody tr:visible");
const counter = (page: Page) =>
  page.getByTestId("applications-counter").filter({ visible: true });
// `visible`: after a reload the finished page sits hidden beside the one on screen
const greeting = (page: Page) =>
  page.getByTestId("greeting").filter({ visible: true });

test("nazir/01 — the medrese's Pano shows three scope cards, two sessions and three applications, and the greeting counts the same (criteria 1, 2)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);

  await expect(greeting(page)).toContainText(
    "Önümüzdeki 7 günde 2 celse var; 3 başvuru onayınızı bekliyor."
  );

  const cards = page
    .getByTestId("scopes")
    .filter({ visible: true })
    .locator(".mds-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toContainText(base?.madrasah.name ?? "");
  await expect(cards.first()).toContainText("Medrese başmüderrisi");
  await expect(cards.first()).toContainText(
    "2 medrese dersi · 1 köşkte barındırma hakkı"
  );
  await expect(
    cards.filter({ hasText: base?.first.title ?? "" })
  ).toContainText("Müderris · dersin imamı");
  await expect(
    cards.filter({ hasText: base?.first.title ?? "" })
  ).toContainText("Yayında");

  const sessions = page
    .getByRole("table", { name: "Önümüzdeki 7 günün celseleri" })
    .locator("tbody tr");
  await expect(sessions).toHaveCount(2);
  await expect(sessions.first()).toContainText(base?.first.title ?? "");
  await expect(sessions.first()).toContainText("Hafta 1");
  await expect(sessions.first()).toContainText("Bağlantısı eksik");
  await expect(sessions.first()).toContainText("Planlandı");
  await expect(sessions.nth(1)).toContainText("Zoom");
  await expect(
    sessions.first().getByRole("link", { name: /^Düzenle/ })
  ).toHaveAttribute("href", `/ders/${base?.first.id}/celseler`);

  await expect(applications(page)).toHaveCount(3);
  await expect(applications(page).first()).toContainText(
    pano?.applicants[0]?.name ?? ""
  );
  await expect(counter(page)).toHaveText("3 başvuru · 2 derste");

  const hosts = page.getByTestId("hosting-kosks").filter({ visible: true });
  await expect(hosts).toContainText(base?.first.koskName ?? "");
  await expect(hosts).toContainText("2 medrese dersi");
  await expect(
    page.getByRole("link", { name: "Medrese dışı ders talebi gönder" })
  ).toHaveAttribute("href", `/medrese/${base?.madrasah.id}/dersler/talep`);
  await expect(
    page.getByRole("link", { name: "Medrese dersi aç" })
  ).toHaveAttribute("href", `/medrese/${base?.madrasah.id}/dersler/yeni`);
});

test("nazir/01 — 'Onayla' takes the row and the count away, the talebe has a seat, and a reload keeps it so (criterion 3)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  const first = pano?.applicants[0];

  await page.getByRole("button", { name: `Onayla: ${first?.name}` }).click();
  await expect(
    page.getByText("Başvuru onaylandı").filter({ visible: true })
  ).toBeVisible();
  await expect(applications(page)).toHaveCount(2);
  await expect(
    applications(page).filter({ hasText: first?.name ?? "" })
  ).toHaveCount(0);
  await expect(counter(page)).toHaveText("2 başvuru · 2 derste");
  expect(await pano?.seatOf(first?.userId ?? "", first?.courseId ?? "")).toBe(
    "ENROLLED"
  );

  await page.reload();
  await expect(applications(page)).toHaveCount(2);
  await expect(greeting(page)).toContainText("2 başvuru onayınızı bekliyor.");
  await expect(counter(page)).toHaveText("2 başvuru · 2 derste");
  // the menu's badge is the courses that still hold an application
  await expect(
    page.locator("aside").getByRole("link", { name: /^Dersler/ })
  ).toContainText("2");
});

test("nazir/01 — 'Reddet' asks once, takes no reason, and removes the application", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  const second = pano?.applicants[1];

  await page.getByRole("button", { name: `Reddet: ${second?.name}` }).click();
  const ask = page.getByRole("alertdialog", {
    name: "Başvuru reddedilsin mi?",
  });
  await expect(ask).toContainText(second?.name ?? "");
  await expect(ask.getByRole("button", { name: "Vazgeç" })).toBeFocused();
  await ask.getByRole("button", { name: "Vazgeç" }).click();
  await expect(applications(page)).toHaveCount(3);

  await page.getByRole("button", { name: `Reddet: ${second?.name}` }).click();
  await ask.getByRole("button", { name: "Reddet", exact: true }).click();
  await expect(
    page.getByText("Başvuru reddedildi").filter({ visible: true })
  ).toBeVisible();
  await expect(applications(page)).toHaveCount(2);
  await expect(counter(page)).toHaveText("2 başvuru · 1 derste");
  expect(
    await pano?.seatOf(second?.userId ?? "", second?.courseId ?? "")
  ).toBeNull();
});

test("nazir/01 — on a 390 px screen the cards are one column and the tables read without sideways scrolling", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/medrese/${base?.madrasah.id}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Pano" })
  ).toBeVisible();

  const cards = page
    .getByTestId("scopes")
    .filter({ visible: true })
    .locator(".mds-card");
  const boxes = await cards.evaluateAll((nodes) =>
    nodes.map((node) => {
      const { left, width } = node.getBoundingClientRect();
      return { left: Math.round(left), width: Math.round(width) };
    })
  );
  expect(new Set(boxes.map((box) => box.left)).size).toBe(1);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(
    page.getByRole("button", { name: `Onayla: ${pano?.applicants[0]?.name}` })
  ).toBeVisible();
});

test("nazir/01 — a medrese nazır is refused the dashboard: the cards stay, a notice stands under them, and there is no 'Medrese dersi aç'", async ({
  as,
}) => {
  test.skip(!(ready() && canSignIn(MEDRESE_NAZIR)), "no medrese nazır account");
  const page = await as("MEDRESE_NAZIR");
  await open(page);
  await expect(
    page.getByText("Bu sayfaya izniniz yok").filter({ visible: true })
  ).toBeVisible();
  await expect(
    page.getByTestId("scopes").filter({ visible: true })
  ).toContainText(base?.madrasah.name ?? "");
  await expect(page.getByTestId("applications")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Medrese dersi aç" })
  ).toHaveCount(0);
});
