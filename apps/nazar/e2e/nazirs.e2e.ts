import type { Page } from "@playwright/test";
import { account, canSignIn, expect, test } from "./accounts";
import { type NazirsFixture, seedNazirs } from "./nazirs-seed";
import { type NazirFixture, seedPortal } from "./seed";

/**
 * Design nazir/05 (Medrese nazırları) against the running app and API with real
 * Keycloak sign-ins (MDRS-184). The roster is the medrese başmüderris's;
 * MEDRESE_NAZIR is only asked what the open owner decision allows: the API
 * refuses it, and the page says so instead of drawing the table. The permission
 * editor and the groups have their own specs (permissions.e2e.ts and
 * groups.e2e.ts). The e-mail search of "Medrese nazırı ata" goes to the real
 * realm directory through tedrisat's admin client, so it appoints the TALEBE
 * account.
 */
const BASMUDERRIS = account("MEDRESE_BASMUDERRIS");
const MEDRESE_NAZIR = account("MEDRESE_NAZIR");
const TALEBE = account("TALEBE");

let base: NazirFixture | undefined;
let extra: NazirsFixture | undefined;

test.beforeAll(async () => {
  if (!BASMUDERRIS.sub) return;
  // MEDRESE_NAZIR is seated by the one spec that signs in as them: holding
  // nothing, they would be a second row, and the band would count two.
  base = await seedPortal({ basmuderris: BASMUDERRIS.sub });
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
  await page.goto(`/medrese/${base?.madrasah.id}/nazirlar`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Medrese nazırları" })
  ).toBeVisible();
};

/** The row of a nazır by the name in its first cell: a giver's name is in other rows too. */
const rowOf = (page: Page, name: string) =>
  page
    .locator("[data-testid=nazirs] tbody tr:visible")
    .filter({ has: page.locator("th", { hasText: name }) });

test("nazir/05 — the table shows each nazır with their groups, extra permissions, end and giver, in the order they were appointed (criteria 1, 4)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);

  const fatma = rowOf(page, extra?.fatma.name ?? "");
  await expect(fatma).toContainText(extra?.fatma.email ?? "");
  await expect(fatma).toContainText(extra?.groups.dersAcma ?? "");
  await expect(fatma).toContainText(extra?.groups.yasak ?? "");
  await expect(fatma).toContainText("Ayrıca 3 izin:");
  await expect(fatma).toContainText("Süresiz");
  await expect(fatma).toContainText(extra?.admin.name ?? "");
  await expect(fatma).toContainText("12 Eylül 2026");

  // an end in the future shows as a date; a permission that has ended is not counted
  const ummugulsum = rowOf(page, extra?.ummugulsum.name ?? "");
  await expect(ummugulsum).toContainText(extra?.groups.kayit ?? "");
  await expect(ummugulsum).toContainText(day(extra?.endsAt ?? new Date()));
  await expect(ummugulsum).not.toContainText("Ayrıca");
  await expect(ummugulsum).toContainText("20 Eylül 2026");

  const names = await page
    .locator("[data-testid=nazirs] tbody tr:visible th")
    .allInnerTexts();
  const mine = names
    .map((text) =>
      [extra?.fatma, extra?.ummugulsum, extra?.abdullah].findIndex((p) =>
        text.includes(p?.name ?? "?")
      )
    )
    .filter((i) => i >= 0);
  expect(mine).toEqual([0, 1, 2]);
});

test("nazir/05 — a nazır who holds nothing has 'İzin yok', who appointed them and when, dashes, and the band names them (criteria 2, 3)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);

  const abdullah = rowOf(page, extra?.abdullah.name ?? "");
  await expect(abdullah).toContainText("İzin yok");
  await expect(abdullah).toContainText(
    `Atayan: ${extra?.fatma.name} · 30 Eylül 2026`
  );
  await expect(abdullah.locator("td").nth(1)).toHaveText("—");
  await expect(abdullah.locator("td").nth(2)).toHaveText("—");

  const band = page
    .getByRole("status")
    .filter({ hasText: "henüz izin almadı" });
  await expect(band).toContainText(`${extra?.abdullah.name} henüz izin almadı`);
  await expect(band).toContainText(
    `${extra?.fatma.name} 30 Eylül’de atadı. Siz izin verene kadar hiçbir işlem yapamaz.`
  );
});

test("nazir/05 — the permission buttons are on the rows and the groups under the table: 'İzinleri düzenle' where something is held, 'İzin ver' where nothing is", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  await expect(
    rowOf(page, extra?.fatma.name ?? "").getByRole("button", {
      name: /^İzinleri düzenle/,
    })
  ).toBeVisible();
  await expect(
    rowOf(page, extra?.abdullah.name ?? "").getByRole("button", {
      name: /^İzin ver/,
    })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "İzin grupları" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Grup tanımla" })
  ).toBeVisible();
});

test("nazir/05 — 'Medrese nazırı ata' finds the account by its exact e-mail address and appoints it with no permission (criterion 3)", async ({
  as,
}) => {
  test.skip(
    !(ready() && TALEBE.email && TALEBE.sub),
    "no talebe account to appoint"
  );
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  await expect(page.getByText("İzin yok", { exact: true })).toHaveCount(1);

  try {
    await page.getByRole("button", { name: "Medrese nazırı ata" }).click();
    const dialog = page.getByRole("dialog", { name: "Medrese nazırı ata" });
    await expect(dialog).toContainText(base?.madrasah.name ?? "");
    await expect(dialog.getByRole("button", { name: "Ata" })).toBeDisabled();

    await dialog.getByLabel("Nazırın e-posta adresi").fill(TALEBE.email ?? "");
    await dialog.getByLabel("Nazırın e-posta adresi").press("Enter");
    await expect(dialog.getByTestId("chosen-nazir")).toBeVisible();
    await dialog.getByRole("button", { name: "Ata" }).click();

    await expect(
      page.getByText("Nazır atandı").filter({ visible: true })
    ).toBeVisible();
    await expect(dialog).toBeHidden();
    // the roster has the new row and a second 'İzin yok'; the band counts both
    await expect(page.getByText("İzin yok", { exact: true })).toHaveCount(2);
    await expect(
      page.getByRole("status").filter({ hasText: "2 nazır henüz izin almadı" })
    ).toBeVisible();

    const role = await extra?.roleRow(
      TALEBE.sub ?? "",
      "MEDRESE_NAZIR",
      base?.madrasah.id ?? ""
    );
    expect(role).toEqual({ grantedBy: BASMUDERRIS.sub, revoked: false });
    expect(await extra?.audits("madrasah_nazir.appoint")).toBe(1);
    expect(await extra?.grantRow(TALEBE.sub ?? "", "course.edit")).toBeNull();
  } finally {
    // the account is the realm's, not ours: take it out of the medrese again
    await extra?.forget(TALEBE.sub ?? "");
  }
});

test("nazir/05 — an address no account has says so, and nobody is appointed", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);

  await page.getByRole("button", { name: "Medrese nazırı ata" }).click();
  const dialog = page.getByRole("dialog", { name: "Medrese nazırı ata" });
  const field = dialog.getByLabel("Nazırın e-posta adresi");
  await field.fill(`kimse.${extra?.tail}@example.test`);
  await field.press("Enter");
  await expect(
    dialog.getByText("Bu e-posta adresiyle kayıtlı bir hesap bulunamadı.")
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Ata" })).toBeDisabled();
});

test("nazir/05 — a medrese nazır is refused: a notice, no table and no way to appoint (criterion 5)", async ({
  as,
}) => {
  test.skip(
    !(ready() && canSignIn(MEDRESE_NAZIR) && MEDRESE_NAZIR.sub),
    "no medrese nazır account"
  );
  await extra?.seat(MEDRESE_NAZIR.sub ?? "");
  const page = await as("MEDRESE_NAZIR");
  await open(page);
  await expect(
    page.getByText("Bu sayfaya izniniz yok").filter({ visible: true })
  ).toBeVisible();
  await expect(page.getByTestId("nazirs")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Medrese nazırı ata" })
  ).toHaveCount(0);
});
