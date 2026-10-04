import type { Page } from "@playwright/test";
import { account, canSignIn, expect, test } from "./accounts";
import { type StudentsFixture, seedStudents } from "./people-seed";
import { type NazirFixture, seedPortal } from "./seed";

/**
 * Design nazir/10 (Talebeler) against the running app and API with real
 * Keycloak sign-ins (MDRS-187): 48 talebe over five pages, the filters and the
 * search, and "Yasakla", whose ban is read back from the database. The list is
 * the medrese's başmüderris's; MEDRESE_NAZIR is only asked what the open owner
 * decision allows: the API refuses it, and the page says so.
 */
const BASMUDERRIS = account("MEDRESE_BASMUDERRIS");
const MEDRESE_NAZIR = account("MEDRESE_NAZIR");

let base: NazirFixture | undefined;
let students: StudentsFixture | undefined;

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

// A ban written by one spec must not be read by the next, so each has its own talebe.
test.beforeEach(async () => {
  if (base) students = await seedStudents(base);
});

test.afterEach(async () => {
  await students?.remove();
  students = undefined;
});

const ready = () => Boolean(base && students && canSignIn(BASMUDERRIS));

const open = async (page: Page, query = "") => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/medrese/${base?.madrasah.id}/talebeler${query}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Talebeler" })
  ).toBeVisible();
};

const rows = (page: Page) =>
  page.locator("[data-testid=students] tbody tr:visible");
// `visible`: after a navigation Next keeps the page it left hidden, with its own pager
const pager = (page: Page) =>
  page.getByTestId("pager-range").filter({ visible: true });

test("nazir/10 — the first of five pages lists the newest ten, the counter says 48, and 'Sonraki' reads 11–20 (criteria 1, 2)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);

  // the medrese's pending applications are not talebe
  await expect(
    page.getByTestId("counter").filter({ visible: true })
  ).toHaveText("48 talebe");
  await expect(pager(page)).toHaveText("Sayfa 1 / 5 · 48 talebeden 1–10");
  await expect(rows(page)).toHaveCount(10);
  await expect(rows(page).first()).toContainText(students?.names[0] ?? "");
  await expect(rows(page).nth(9)).toContainText(students?.names[9] ?? "");
  await expect(page.getByRole("link", { name: "Önceki" })).toHaveAttribute(
    "aria-disabled",
    "true"
  );

  await page.getByRole("link", { name: "Sonraki" }).click();
  await expect(page).toHaveURL(/sayfa=2/);
  await expect(pager(page)).toHaveText("Sayfa 2 / 5 · 48 talebeden 11–20");
  await expect(rows(page)).toHaveCount(10);
  await expect(rows(page).first()).toContainText(students?.names[10] ?? "");

  await open(page, "?sayfa=5");
  await expect(pager(page)).toHaveText("Sayfa 5 / 5 · 48 talebeden 41–48");
  await expect(rows(page)).toHaveCount(8);
  await expect(page.getByRole("link", { name: "Sonraki" })).toHaveAttribute(
    "aria-disabled",
    "true"
  );
});

test("nazir/10 — a talebe who finished a course names it with the day, and the others say 'Yok' (criterion 3)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);

  const finisher = rows(page).filter({
    hasText: students?.finisher.name ?? "",
  });
  await expect(finisher).toContainText(base?.first.title ?? "");
  await expect(finisher).toContainText(base?.second.title ?? "");
  await expect(finisher).not.toContainText("Yok");
  await expect(rows(page).nth(1)).toContainText("Yok");
  await expect(
    page
      .getByText("Talebenin medrese dışındaki dersleri bu listede yer almaz.")
      .filter({ visible: true })
  ).toBeVisible();
});

test("nazir/10 — the state filter and the search narrow the list, from the first page, and the counter follows", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page, "?sayfa=3");

  await page.getByRole("combobox", { name: "Durum" }).click();
  await page.getByRole("option", { name: "Tamamladı" }).click();
  await expect(page).toHaveURL(/durum=tamamladi/);
  await expect(page).not.toHaveURL(/sayfa=/);
  await expect(
    page.getByTestId("counter").filter({ visible: true })
  ).toHaveText("1 talebe");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText(students?.finisher.name ?? "");

  await page.getByRole("combobox", { name: "Durum" }).click();
  await page.getByRole("option", { name: "Bütün durumlar" }).click();
  await expect(
    page.getByTestId("counter").filter({ visible: true })
  ).toHaveText("48 talebe");

  await page.getByRole("searchbox").fill(students?.names[6] ?? "");
  await expect(page).toHaveURL(/ara=/);
  await expect(
    page.getByTestId("counter").filter({ visible: true })
  ).toHaveText("1 talebe");
  await expect(rows(page).first()).toContainText(students?.names[6] ?? "");

  await page.getByRole("searchbox").fill("böyle biri yok");
  await expect(
    page.getByText("Bu süzgece uyan talebe yok.").filter({ visible: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "Süzgeçleri temizle" }).click();
  await expect(
    page.getByTestId("counter").filter({ visible: true })
  ).toHaveText("48 talebe");
});

test("nazir/10 — 'Yasakla' opens the dialog with the talebe's courses, wants a reason, and bars them from the course chosen (criterion 4)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);

  await page
    .getByRole("button", { name: `Yasakla: ${students?.finisher.name}` })
    .click();
  const dialog = page.getByRole("dialog", { name: "Yasakla" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(students?.finisher.name ?? "");
  // the courses they hold a seat in, the one they attend first, then the whole medrese
  const radios = dialog.getByRole("radio");
  await expect(radios).toHaveCount(3);
  await expect(radios.first()).toBeChecked();
  await expect(
    dialog.getByRole("radio", { name: /Medrese düzeyi/ })
  ).toBeVisible();

  const submit = dialog.getByRole("button", { name: "Yasakla", exact: true });
  await expect(submit).toBeDisabled();
  await dialog
    .getByLabel("Yasaklama gerekçesi")
    .fill("  E2E derste reklam yaptı  ");
  await submit.click();

  await expect(
    page.getByText("Yasak kaydedildi").filter({ visible: true })
  ).toBeVisible();
  await expect(dialog).toBeHidden();
  const bans = (await students?.bansOf(students.finisher.id)) ?? [];
  expect(bans).toHaveLength(1);
  expect(bans[0]).toMatchObject({
    scope: "COURSE",
    courseId: base?.first.id,
    reason: "E2E derste reklam yaptı",
    bannedRole: "MEDRESE_BASMUDERRIS",
    liftedAt: null,
  });
});

test("nazir/10 — a medrese nazır is refused: a notice and no list", async ({
  as,
}) => {
  test.skip(!(ready() && canSignIn(MEDRESE_NAZIR)), "no medrese nazır account");
  const page = await as("MEDRESE_NAZIR");
  await open(page);
  await expect(
    page.getByText("Bu sayfaya izniniz yok").filter({ visible: true })
  ).toBeVisible();
  await expect(page.getByTestId("students")).toHaveCount(0);
});
