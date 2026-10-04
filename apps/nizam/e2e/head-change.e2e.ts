import { expect, type Page, test } from "@playwright/test";
import { type HeadFixture, seedHead } from "./head-seed";

/**
 * Design nizam/22 (Başmüderrisi değiştir / ata) against the running app and
 * API, with real Keycloak sign-ins (MDRS-172). A spec whose account is not in
 * the environment (E2E_<ROLE>_EMAIL, _PASSWORD, _SUB) is skipped. The Medreseler
 * page is the Medaris başnazımı's, so the specs sign in as the account that
 * holds the SYSTEM_ADMIN realm role; the e-mail search of the new başmüderris
 * goes to the real realm directory through `tedrisat-admin`.
 */
const account = (role: string) => ({
  email: process.env[`E2E_${role}_EMAIL`],
  password: process.env[`E2E_${role}_PASSWORD`],
  sub: process.env[`E2E_${role}_SUB`],
});
const SYSTEM_ADMIN = account("SYSTEM_ADMIN");
const MUDERRIS = account("MUDERRIS");

const seedable = Boolean(SYSTEM_ADMIN.sub && process.env.E2E_DATABASE_URL);
let fixture: HeadFixture;

// The screen shows moments in the browser's zone unless the account has one:
// pinned, the end dates below mean the same instant on any machine (MDRS-254).
test.use({ timezoneId: "Europe/Istanbul" });

test.beforeEach(async () => {
  if (!seedable) return;
  fixture = await seedHead(SYSTEM_ADMIN.sub as string);
});

test.afterEach(async () => {
  await fixture?.remove();
});

async function signIn(
  page: Page,
  who: { email?: string; password?: string }
): Promise<void> {
  await page.goto("/tr/auth/signin");
  await page.locator("#username").fill(who.email as string);
  await page.locator("#password").fill(who.password as string);
  await page.locator("button[type=submit]").click();
  await page.waitForURL(/localhost:4001/);
}

// `:visible`: while a navigation streams in, Next keeps the finished page in a
// hidden node beside the one on screen, so a row can briefly exist twice.
const rowOf = (page: Page, name: string) =>
  page
    .locator("[data-testid=madrasahs] tbody tr:visible")
    .filter({ hasText: name });

const openMedreseler = async (page: Page) => {
  await page.goto("/tr/medreseler?q=E2E");
  await expect(
    page.getByRole("heading", { level: 1, name: "Medreseler" })
  ).toBeVisible();
};

const daysFromNow = (n: number) => {
  const d = new Date(Date.now() + n * 24 * 3600 * 1000);
  return `${d.toISOString().slice(0, 10)}T12:00`;
};

test("nizam/22 — before 4 Ekim 'Başmüderrisi değiştir' is off, and nothing is said about why", async ({
  page,
}) => {
  test.skip(!(seedable && SYSTEM_ADMIN.password), "no SYSTEM_ADMIN account");
  // the real clock of the run is 2 Ekim 2026; pin it so the spec says what it means
  await page.clock.setFixedTime(new Date("2026-10-02T09:00:00+03:00"));
  await signIn(page, SYSTEM_ADMIN);
  await openMedreseler(page);
  await expect(
    page.getByRole("button", {
      name: `Başmüderrisi değiştir: ${fixture.active.name}`,
    })
  ).toBeDisabled();
  await expect(page.getByText(/4 Ekim|sürüm/i)).toHaveCount(0);
  // 'Başmüderris ata' on the passive one carries no gate: nobody is replaced
  await expect(
    page.getByRole("button", {
      name: `Başmüderris ata: ${fixture.passive.name}`,
    })
  ).toBeEnabled();
});

test("nizam/22 — the window names the başmüderris, lists what they handed on with nothing chosen, and 'Değiştir' waits for every row (criteria 1, 2)", async ({
  page,
}) => {
  test.skip(
    !(seedable && SYSTEM_ADMIN.password && MUDERRIS.email),
    "no SYSTEM_ADMIN or MUDERRIS account"
  );
  await page.clock.setFixedTime(new Date("2026-10-05T10:00:00+03:00"));
  await signIn(page, SYSTEM_ADMIN);
  await openMedreseler(page);
  await page
    .getByRole("button", {
      name: `Başmüderrisi değiştir: ${fixture.active.name}`,
    })
    .click();
  const dialog = page.getByRole("dialog", { name: "Başmüderrisi değiştir" });
  const submit = dialog.getByRole("button", { name: "Değiştir", exact: true });

  await expect(dialog).toContainText(fixture.active.name);
  await expect(dialog).toContainText(
    `${fixture.head.name} şu an bu medresenin başmüderrisi`
  );
  await expect(dialog).toContainText("* zorunlu alan");
  // the scrim does not close it
  await page.mouse.click(5, 5);
  await expect(dialog).toBeVisible();

  // what the head handed on: three rows, nothing chosen for the başnazım
  const rows = dialog.getByTestId("delegation");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText(fixture.handedOn.role.person);
  await expect(rows.nth(0)).toContainText("Medrese nâzırı");
  await expect(rows.nth(0)).toContainText("süresiz");
  await expect(rows.nth(0)).toContainText("verildi 12 Eylül 2026");
  await expect(rows.nth(1)).toContainText(fixture.handedOn.permission.person);
  await expect(rows.nth(2)).toContainText(fixture.handedOn.group.person);
  await expect(rows.nth(2)).toContainText(
    `${fixture.handedOn.group.name} grubu`
  );
  for (const i of [0, 1, 2]) {
    await expect(
      rows.nth(i).getByRole("button", { name: "Devral" })
    ).toHaveAttribute("aria-pressed", "false");
    await expect(
      rows.nth(i).getByRole("button", { name: "Düşür" })
    ).toHaveAttribute("aria-pressed", "false");
  }
  await expect(
    dialog.getByText(
      "Her satır için seçim yapılmadan başmüderris değiştirilemez."
    )
  ).toBeVisible();

  // no new başmüderris, no change
  await expect(submit).toBeDisabled();
  const email = dialog.getByRole("textbox", { name: /^Yeni başmüderris/ });
  await email.fill(MUDERRIS.email as string);
  await email.press("Enter");
  await expect(dialog.getByTestId("chosen-head")).toBeVisible();
  await expect(submit).toBeDisabled();

  // two of three answered: still off; the third turns it on
  await rows.nth(0).getByRole("button", { name: "Devral" }).click();
  await rows.nth(1).getByRole("button", { name: "Düşür" }).click();
  await expect(submit).toBeDisabled();
  await rows.nth(2).getByRole("button", { name: "Devral" }).click();
  await expect(submit).toBeEnabled();

  // an end date that is not in the future is refused where it is typed
  await dialog
    .getByLabel("Görev bitiş tarihi ve saati (isteğe bağlı)")
    .fill("2020-01-01T12:00");
  await expect(
    dialog.getByText("Bitiş zamanı şu andan sonra olmalı.")
  ).toBeVisible();
  await expect(submit).toBeDisabled();
  await dialog
    .getByLabel("Görev bitiş tarihi ve saati (isteğe bağlı)")
    .fill("2026-12-31T12:00");
  await expect(submit).toBeEnabled();

  // 'Vazgeç' changes nothing
  await dialog.getByRole("button", { name: "Vazgeç" }).click();
  await expect(dialog).toBeHidden();
  expect((await fixture.heads(fixture.active.id)).map((h) => h.userId)).toEqual(
    [fixture.head.id]
  );
});

test("nizam/22 — 'Değiştir' replaces the başmüderris, takes over what was answered Devral, drops the rest and writes one audit entry (criteria 3, 4, 5)", async ({
  page,
}) => {
  test.skip(
    !(
      seedable &&
      SYSTEM_ADMIN.password &&
      SYSTEM_ADMIN.sub &&
      MUDERRIS.email &&
      MUDERRIS.sub
    ),
    "no SYSTEM_ADMIN or MUDERRIS account"
  );
  await page.clock.setFixedTime(new Date("2026-10-05T10:00:00+03:00"));
  await signIn(page, SYSTEM_ADMIN);
  await openMedreseler(page);
  await page
    .getByRole("button", {
      name: `Başmüderrisi değiştir: ${fixture.active.name}`,
    })
    .click();
  const dialog = page.getByRole("dialog", { name: "Başmüderrisi değiştir" });
  const rows = dialog.getByTestId("delegation");
  await expect(rows).toHaveCount(3);

  const email = dialog.getByRole("textbox", { name: /^Yeni başmüderris/ });
  await email.fill(MUDERRIS.email as string);
  await email.press("Enter");
  await expect(dialog.getByTestId("chosen-head")).toBeVisible();
  await dialog
    .getByLabel("Görev bitiş tarihi ve saati (isteğe bağlı)")
    .fill("2026-12-31T12:00");
  await rows.nth(0).getByRole("button", { name: "Devral" }).click();
  await rows.nth(1).getByRole("button", { name: "Düşür" }).click();
  await rows.nth(2).getByRole("button", { name: "Devral" }).click();
  await dialog.getByRole("button", { name: "Değiştir", exact: true }).click();
  await expect(dialog).toBeHidden();

  // the table shows the new başmüderris, not the old one
  const row = rowOf(page, fixture.active.name);
  await expect(row).toHaveCount(1);
  await expect(row).not.toContainText(fixture.head.name);

  const heads = await fixture.heads(fixture.active.id);
  expect(heads.map((h) => h.userId)).toEqual([MUDERRIS.sub]);
  expect(heads[0]?.expiresAt?.toISOString()).toMatch(/^2026-12-31T/);

  // Devral: the right stays and the caller is its giver; Düşür: revoked at once
  expect(await fixture.rowState("ROLE", fixture.handedOn.role.id)).toEqual({
    grantedBy: SYSTEM_ADMIN.sub,
    revoked: false,
  });
  expect(
    await fixture.rowState("GRANT", fixture.handedOn.permission.id)
  ).toMatchObject({
    revoked: true,
  });
  expect(await fixture.rowState("GRANT", fixture.handedOn.group.id)).toEqual({
    grantedBy: SYSTEM_ADMIN.sub,
    revoked: false,
  });

  // all of it is one audit entry
  expect(await fixture.audits("madrasah.head_muderris.set")).toBe(1);
  expect(await fixture.lastAudit("madrasah.head_muderris.set")).toMatchObject({
    headMuderrisUserId: MUDERRIS.sub,
    previous: [fixture.head.id],
    tookOver: 2,
    dropped: 1,
  });
});

test("nizam/22 — on a passive medrese the window says 'Başmüderris ata' and asks nothing about hand-ons (criterion 1)", async ({
  page,
}) => {
  test.skip(
    !(seedable && SYSTEM_ADMIN.password && MUDERRIS.email && MUDERRIS.sub),
    "no SYSTEM_ADMIN or MUDERRIS account"
  );
  await signIn(page, SYSTEM_ADMIN);
  await openMedreseler(page);
  await rowOf(page, fixture.passive.name)
    .getByRole("button", { name: /Başmüderris ata/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "Başmüderris ata" });
  await expect(dialog.getByTestId("delegations")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Değiştir", exact: true })
  ).toHaveCount(0);

  const email = dialog.getByRole("textbox", { name: /^Başmüderris/ });
  await email.fill(MUDERRIS.email as string);
  await email.press("Enter");
  await dialog
    .getByLabel("Görev bitiş tarihi ve saati (isteğe bağlı)")
    .fill(daysFromNow(60));
  await dialog.getByRole("button", { name: "Başmüderris ata" }).click();
  await expect(dialog).toBeHidden();

  const row = rowOf(page, fixture.passive.name);
  await expect(row).toContainText("Etkin");
  const heads = await fixture.heads(fixture.passive.id);
  expect(heads.map((h) => h.userId)).toEqual([MUDERRIS.sub]);
  expect(heads[0]?.expiresAt).not.toBeNull();
});
