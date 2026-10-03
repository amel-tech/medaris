import type { Page } from "@playwright/test";
import { account, canSignIn, expect, test } from "./accounts";
import { type NazirsFixture, seedNazirs } from "./nazirs-seed";
import { type NazirFixture, seedPortal } from "./seed";

/**
 * Design nazir/15 (Görevden al) against the running app and API with real
 * Keycloak sign-ins (MDRS-184). The window opens on 4 Ekim 2026 on the
 * viewer's clock, and the real clock of a run before that day is behind it, so
 * each spec fixes the browser's clock on the side of the gate it is about.
 * Fatma is the nazır who gave things away (Abdullah's role, a permission to
 * Ayşe, a role in a course to Hatice); Ümmügülsüm gave nothing.
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

// Dismissing changes what the next spec reads, so each one has its own nazırs.
test.beforeEach(async () => {
  if (base) extra = await seedNazirs(base);
});

test.afterEach(async () => {
  await extra?.remove();
  extra = undefined;
});

const ready = () => Boolean(base && extra && canSignIn(BASMUDERRIS));

const open = async (page: Page, clock: string) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.setFixedTime(new Date(clock));
  await page.goto(`/medrese/${base?.madrasah.id}/nazirlar`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Medrese nazırları" })
  ).toBeVisible();
};

const BEFORE = "2026-10-02T09:00:00+03:00";
const AFTER = "2026-10-05T10:00:00+03:00";

const dismissButton = (page: Page, name?: string) =>
  page.getByRole("button", { name: `Görevden al: ${name}` });

test("nazir/15 — before 4 Ekim 'Görevden al' is off on every row, and nothing is said about why", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page, BEFORE);
  for (const nazir of [extra?.fatma, extra?.ummugulsum, extra?.abdullah]) {
    await expect(dismissButton(page, nazir?.name)).toBeDisabled();
  }
  await expect(page.getByText(/4 Ekim|sürüm/i)).toHaveCount(0);
});

test("nazir/15 — after the gate it asks about each person the nazır gave something to, with nothing chosen and the button off until every row has an answer (criterion 1)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page, AFTER);

  await dismissButton(page, extra?.fatma.name).click();
  const dialog = page.getByRole("dialog", {
    name: `${extra?.fatma.name} görevden alınıyor`,
  });
  const submit = dialog.getByRole("button", {
    name: "Görevden al",
    exact: true,
  });

  await expect(dialog).toContainText(base?.madrasah.name ?? "");
  await expect(dialog).toContainText(
    `${extra?.fatma.name} şu kişilere rol ve izin vermişti. Her biri için ne olacağını seçin.`
  );
  // "Vazgeç" has the focus, and the scrim does not close the dialog
  await expect(dialog.getByRole("button", { name: "Vazgeç" })).toBeFocused();
  await page.mouse.click(5, 5);
  await expect(dialog).toBeVisible();

  const people = dialog.getByTestId("given-person");
  await expect(people).toHaveCount(3);
  const abdullah = people.filter({ hasText: extra?.abdullah.name ?? "" });
  await expect(abdullah).toContainText(extra?.abdullah.email ?? "");
  await expect(abdullah).toContainText("Medrese nazırı");
  await expect(abdullah).toContainText(base?.madrasah.name ?? "");
  await expect(abdullah).toContainText("süresiz");
  await expect(abdullah).toContainText("verildi 30 Eylül 2026");
  await expect(abdullah).toContainText(
    "Hiç izni yok; medrese nazırı atadığı nazıra izin veremez."
  );
  await expect(
    people.filter({ hasText: extra?.ders.name ?? "" })
  ).toContainText(`Ders nazırı · ${base?.first.title}`);
  await expect(
    people.filter({ hasText: extra?.ayse.name ?? "" })
  ).toContainText("1 izin: Başvuruyu onayla ya da reddet");

  // what drops at once
  await expect(dialog).toContainText(
    `Görevden alınırsa ${extra?.fatma.name} için “${extra?.groups.dersAcma}” ve “${extra?.groups.yasak}” grupları ile 3 ek izin hemen düşer.`
  );

  await expect(dialog.getByRole("button", { pressed: true })).toHaveCount(0);
  await expect(submit).toBeDisabled();
  await abdullah.getByRole("button", { name: "Devral" }).click();
  await people
    .filter({ hasText: extra?.ayse.name ?? "" })
    .getByRole("button", { name: "Düşür" })
    .click();
  await expect(submit).toBeDisabled();
  await people
    .filter({ hasText: extra?.ders.name ?? "" })
    .getByRole("button", { name: "Devral" })
    .click();
  await expect(submit).toBeEnabled();
});

test("nazir/15 — Devral keeps what was given under the başmüderris's name, Düşür takes it back, and the nazır is gone (criteria 2, 3, 4, 5)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page, AFTER);

  await dismissButton(page, extra?.fatma.name).click();
  const dialog = page.getByRole("dialog", {
    name: `${extra?.fatma.name} görevden alınıyor`,
  });
  const people = dialog.getByTestId("given-person");
  const choose = (who: string | undefined, answer: string) =>
    people
      .filter({ hasText: who ?? "" })
      .getByRole("button", { name: answer })
      .click();
  await choose(extra?.abdullah.name, "Devral");
  await choose(extra?.ders.name, "Devral");
  await choose(extra?.ayse.name, "Düşür");
  await dialog
    .getByRole("button", { name: "Görevden al", exact: true })
    .click();

  await expect(page.getByText("Görevden alındı")).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(
    page.locator("[data-testid=nazirs] tbody tr:visible").filter({
      hasText: extra?.fatma.name ?? "",
    })
  ).toHaveCount(0);
  // Abdullah is still a nazır, now appointed by the başmüderris
  await expect(
    page.locator("[data-testid=nazirs] tbody tr:visible").filter({
      hasText: extra?.abdullah.name ?? "",
    })
  ).toHaveCount(1);

  const madrasahId = base?.madrasah.id ?? "";
  expect(
    await extra?.roleRow(extra.fatma.id, "MEDRESE_NAZIR", madrasahId)
  ).toMatchObject({
    revoked: true,
  });
  expect(
    await extra?.roleRow(extra.abdullah.id, "MEDRESE_NAZIR", madrasahId)
  ).toEqual({ grantedBy: BASMUDERRIS.sub, revoked: false });
  expect(
    await extra?.roleRow(extra.ders.id, "DERS_NAZIR", base?.first.id ?? "")
  ).toEqual({ grantedBy: BASMUDERRIS.sub, revoked: false });
  expect(
    await extra?.grantRow(extra.ayse.id, "enrollment.decide")
  ).toMatchObject({
    revoked: true,
  });
  // her own groups and permissions in the medrese went with the appointment
  expect(
    await extra?.grantRow(extra.fatma.id, "course.settings")
  ).toMatchObject({
    revoked: true,
  });
  expect(await extra?.audits("madrasah_nazir.dismiss")).toBe(1);
});

test("nazir/15 — a nazır who gave no one anything is dismissed without a choice step", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page, AFTER);

  await dismissButton(page, extra?.ummugulsum.name).click();
  const dialog = page.getByRole("dialog", {
    name: `${extra?.ummugulsum.name} görevden alınıyor`,
  });
  await expect(dialog.getByTestId("given-person")).toHaveCount(0);
  await expect(dialog).toContainText("seçilecek bir şey yok");
  await dialog
    .getByRole("button", { name: "Görevden al", exact: true })
    .click();

  await expect(page.getByText("Görevden alındı")).toBeVisible();
  await expect(
    page.locator("[data-testid=nazirs] tbody tr:visible").filter({
      hasText: extra?.ummugulsum.name ?? "",
    })
  ).toHaveCount(0);
  expect(
    await extra?.roleRow(
      extra.ummugulsum.id,
      "MEDRESE_NAZIR",
      base?.madrasah.id ?? ""
    )
  ).toMatchObject({ revoked: true });
});

test("nazir/15 — Vazgeç closes the dialog and changes nothing", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page, AFTER);

  await dismissButton(page, extra?.fatma.name).click();
  const dialog = page.getByRole("dialog", {
    name: `${extra?.fatma.name} görevden alınıyor`,
  });
  await dialog.getByRole("button", { name: "Vazgeç" }).click();
  await expect(dialog).toBeHidden();
  expect(
    await extra?.roleRow(
      extra.fatma.id,
      "MEDRESE_NAZIR",
      base?.madrasah.id ?? ""
    )
  ).toMatchObject({ revoked: false });
  expect(await extra?.audits("madrasah_nazir.dismiss")).toBe(0);
});
