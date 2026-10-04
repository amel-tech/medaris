import { expect, type Page, test } from "@playwright/test";
import { type InactiveFixture, seedInactive } from "./inactive-seed";

/**
 * Design nizam/14 (Pasif kapsamlar) against the running app and API, with real
 * Keycloak sign-ins (MDRS-172). A spec whose account is not in the environment
 * (E2E_<ROLE>_EMAIL, _PASSWORD, _SUB) is skipped. The page is the Medaris
 * başnazımı's (and a Medaris nazımı's who may manage passive scopes), so the
 * specs sign in as the account that holds the SYSTEM_ADMIN realm role; the
 * e-mail search of "… ata" goes to the real realm directory through
 * `tedrisat-admin`.
 */
const account = (role: string) => ({
  email: process.env[`E2E_${role}_EMAIL`],
  password: process.env[`E2E_${role}_PASSWORD`],
  sub: process.env[`E2E_${role}_SUB`],
});
const SYSTEM_ADMIN = account("SYSTEM_ADMIN");
const MEDARIS_NAZIM = account("MEDARIS_NAZIM");
const TALEBE = account("TALEBE");
const MUDERRIS = account("MUDERRIS");
const KOSK_NAZIM = account("KOSK_NAZIM");
const DERS_NAZIR = account("DERS_NAZIR");

const seedable = Boolean(process.env.E2E_DATABASE_URL);
let fixture: InactiveFixture;

// The screen shows moments in the browser's zone unless the account has one:
// pinned, the end dates below mean the same instant on any machine (MDRS-254).
test.use({ timezoneId: "Europe/Istanbul" });

test.beforeEach(async () => {
  if (!seedable) return;
  fixture = await seedInactive();
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
const rowOf = (page: Page, text: string) =>
  page
    .locator("[data-testid=inactive] tbody tr:visible")
    .filter({ hasText: text });

const countOf = (page: Page) =>
  page.locator("[data-testid=inactive-count]:visible");

const openInactive = async (page: Page) => {
  await page.goto("/tr/pasif-kapsamlar");
  await expect(
    page.getByRole("heading", { level: 1, name: "Pasif kapsamlar" })
  ).toBeVisible();
};

const daysFromNow = (n: number) => {
  const d = new Date(Date.now() + n * 24 * 3600 * 1000);
  return `${d.toISOString().slice(0, 10)}T12:00`;
};

test("nizam/14 — the list shows the scopes with no manager, why, since when and who the last one was, and leaves out the attended and the new (criterion 1)", async ({
  page,
}) => {
  test.skip(!(seedable && SYSTEM_ADMIN.password), "no SYSTEM_ADMIN account");
  // pin the viewer's clock so "N gündür" says what it means
  await page.clock.setFixedTime(new Date("2026-10-01T09:00:00+03:00"));
  await signIn(page, SYSTEM_ADMIN);
  await openInactive(page);

  const medrese = rowOf(page, fixture.madrasah.name);
  await expect(medrese).toHaveCount(1);
  await expect(medrese).toContainText("Medrese");
  await expect(medrese).toContainText("Başmüderrisin görev süresi doldu");
  await expect(medrese).toContainText("27 Eylül 2026");
  await expect(medrese.getByTestId("days-passive")).toHaveText("4 gündür");
  await expect(medrese).toContainText(fixture.madrasah.head.name);
  await expect(medrese).toContainText("Başmüderris");

  const kosk = rowOf(page, fixture.kosk.name);
  await expect(kosk).toHaveCount(1);
  await expect(kosk).toContainText("Son köşk nazımı görevden alındı");
  await expect(kosk.getByTestId("removed-by")).toHaveText(
    `${fixture.remover.name}, köşk nazımı`
  );
  await expect(kosk).toContainText("30 Eylül 2026");
  await expect(kosk.getByTestId("days-passive")).toHaveText("1 gündür");
  await expect(kosk).toContainText(fixture.kosk.lastNazim.name);

  const course = rowOf(page, fixture.course.title);
  await expect(course).toHaveCount(1);
  await expect(course).toContainText(`Ders · ${fixture.activeKosk.name}`);
  await expect(course).toContainText("Son müderris görevden alındı");
  await expect(course).toContainText(fixture.course.lastMuderris.name);
  await expect(course).toContainText("İmam");

  // attended or never managed: not here
  // (a course row names its köşk, so look at the scope's own name only)
  for (const name of [
    fixture.activeKosk.name,
    fixture.activeMadrasah.name,
    fixture.neverManaged.name,
  ]) {
    await expect(
      page
        .locator("[data-testid=inactive] tbody tr:visible th bdi.font-semibold")
        .filter({ hasText: name })
    ).toHaveCount(0);
  }
  // the count in the heading is the rows under it
  const rows = await page
    .locator("[data-testid=inactive] tbody tr:visible")
    .count();
  await expect(countOf(page)).toHaveText(`${rows} kapsam`);
  // the page does not promise what the server does not do
  await expect(page.getByText(/kimse göremez/)).toHaveCount(0);
});

test("nizam/14 — the filter keeps one kind of scope, and 'Tümü' brings them all back (criterion 2)", async ({
  page,
}) => {
  test.skip(!(seedable && SYSTEM_ADMIN.password), "no SYSTEM_ADMIN account");
  await signIn(page, SYSTEM_ADMIN);
  await openInactive(page);
  const mine = [fixture.madrasah.name, fixture.kosk.name, fixture.course.title];
  const visibleOf = async () =>
    (
      await Promise.all(
        mine.map(async (n) => ((await rowOf(page, n).count()) > 0 ? n : null))
      )
    ).filter(Boolean);

  await page.getByRole("button", { name: "Ders", exact: true }).click();
  await expect.poll(visibleOf).toEqual([fixture.course.title]);
  await page.getByRole("button", { name: "Medrese", exact: true }).click();
  await expect.poll(visibleOf).toEqual([fixture.madrasah.name]);
  await page.getByRole("button", { name: "Köşk", exact: true }).click();
  await expect.poll(visibleOf).toEqual([fixture.kosk.name]);
  await expect(countOf(page)).toHaveText("1 kapsam");
  await page.getByRole("button", { name: "Tümü", exact: true }).click();
  await expect.poll(visibleOf).toEqual(mine);
});

test("nizam/14 — the menu's 'Pasif kapsamlar' opens the page", async ({
  page,
}) => {
  test.skip(!(seedable && SYSTEM_ADMIN.password), "no SYSTEM_ADMIN account");
  await signIn(page, SYSTEM_ADMIN);
  await page.goto("/tr");
  await page.locator("nav a", { hasText: "Pasif kapsamlar" }).first().click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Pasif kapsamlar" })
  ).toBeVisible();
  await expect(page).toHaveURL(/\/tr\/pasif-kapsamlar$/);
});

test("nizam/14 — a köşk nazımı gets the 'izniniz yok' screen, not the list (criterion 5)", async ({
  page,
}) => {
  test.skip(
    !(seedable && KOSK_NAZIM.password && KOSK_NAZIM.sub),
    "no KOSK_NAZIM account"
  );
  await signIn(page, KOSK_NAZIM);
  await page.goto("/tr/pasif-kapsamlar");
  await expect(page.getByText("Bu bölüm için izniniz yok")).toBeVisible();
  await expect(page.getByTestId("inactive")).toHaveCount(0);
});

test("nizam/14 — a Medaris nazımı without 'Pasif kapsamları yönet' gets that screen, one with it gets the list (criterion 5)", async ({
  page,
}) => {
  test.skip(
    !(seedable && MEDARIS_NAZIM.sub && MEDARIS_NAZIM.password),
    "no MEDARIS_NAZIM account"
  );
  await fixture.makeMedarisNazim(MEDARIS_NAZIM.sub as string, false);
  await signIn(page, MEDARIS_NAZIM);
  await page.goto("/tr/pasif-kapsamlar");
  await expect(page.getByText("Bu bölüm için izniniz yok")).toBeVisible();

  await fixture.remove();
  fixture = await seedInactive();
  await fixture.makeMedarisNazim(MEDARIS_NAZIM.sub as string, true);
  await openInactive(page);
  await expect(rowOf(page, fixture.madrasah.name)).toHaveCount(1);
});

test("nizam/14 — 'Köşk nazımı ata' gives the köşk its nazım, the row leaves the list and the köşk is active again (criterion 3)", async ({
  page,
}) => {
  test.skip(
    !(
      seedable &&
      SYSTEM_ADMIN.sub &&
      SYSTEM_ADMIN.password &&
      MUDERRIS.email &&
      MUDERRIS.sub
    ),
    "no SYSTEM_ADMIN or MUDERRIS account"
  );
  await signIn(page, SYSTEM_ADMIN);
  await openInactive(page);
  await rowOf(page, fixture.kosk.name)
    .getByRole("button", { name: /Köşk nazımı ata/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "Köşk nazımı ata" });
  const submit = dialog.getByRole("button", { name: "Köşk nazımı ata" });
  await expect(submit).toBeDisabled();

  const email = dialog.getByRole("textbox", { name: /^Köşk nazımı/ });
  await email.fill("kimse-yok-boyle@example.test");
  await email.press("Enter");
  await expect(
    dialog.getByText("Bu e-posta adresiyle kayıtlı bir hesap bulunamadı.")
  ).toBeVisible();
  await email.fill(MUDERRIS.email as string);
  await email.press("Enter");
  await expect(dialog.getByTestId("chosen-head")).toBeVisible();
  await expect(submit).toBeEnabled();
  await dialog
    .getByLabel("Görev bitiş tarihi ve saati (isteğe bağlı)")
    .fill("2020-01-01T12:00");
  await expect(
    dialog.getByText("Bitiş zamanı şu andan sonra olmalı.")
  ).toBeVisible();
  await expect(submit).toBeDisabled();
  await dialog
    .getByLabel("Görev bitiş tarihi ve saati (isteğe bağlı)")
    .fill(daysFromNow(90));
  await submit.click();
  await expect(dialog).toBeHidden();

  await expect(rowOf(page, fixture.kosk.name)).toHaveCount(0);
  const held = await fixture.held(fixture.kosk.id, "KOSK_NAZIM");
  expect(held).toHaveLength(1);
  expect(held[0]).toMatchObject({
    userId: MUDERRIS.sub,
    grantedBy: SYSTEM_ADMIN.sub,
  });
  expect(held[0]?.expiresAt).not.toBeNull();
  expect(await fixture.passiveSince("kosks", fixture.kosk.id)).toBeNull();
  expect(await fixture.audits("inactive_scope.assign", fixture.kosk.id)).toBe(
    1
  );
});

test("nizam/14 — 'Başmüderris ata' gives a medrese its başmüderris (criterion 3)", async ({
  page,
}) => {
  test.skip(
    !(
      seedable &&
      SYSTEM_ADMIN.sub &&
      SYSTEM_ADMIN.password &&
      DERS_NAZIR.email &&
      DERS_NAZIR.sub
    ),
    "no SYSTEM_ADMIN or DERS_NAZIR account"
  );
  await signIn(page, SYSTEM_ADMIN);
  await openInactive(page);
  await rowOf(page, fixture.madrasah.name)
    .getByRole("button", { name: /Başmüderris ata/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "Başmüderris ata" });
  const email = dialog.getByRole("textbox", { name: /^Başmüderris/ });
  await email.fill(DERS_NAZIR.email as string);
  await email.press("Enter");
  await expect(dialog.getByTestId("chosen-head")).toBeVisible();
  await dialog.getByRole("button", { name: "Başmüderris ata" }).click();
  await expect(dialog).toBeHidden();

  await expect(rowOf(page, fixture.madrasah.name)).toHaveCount(0);
  const held = await fixture.held(fixture.madrasah.id, "MEDRESE_BASMUDERRIS");
  expect(held.map((h) => h.userId)).toEqual([DERS_NAZIR.sub]);
});

test("nizam/14 — 'Müderris ata' gives a course its müderris, the imam, and puts them on the course's list", async ({
  page,
}) => {
  test.skip(
    !(
      seedable &&
      SYSTEM_ADMIN.sub &&
      SYSTEM_ADMIN.password &&
      TALEBE.email &&
      TALEBE.sub
    ),
    "no SYSTEM_ADMIN or TALEBE account"
  );
  await signIn(page, SYSTEM_ADMIN);
  await openInactive(page);
  await rowOf(page, fixture.course.title)
    .getByRole("button", { name: /Müderris ata/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "Müderris ata" });
  const email = dialog.getByRole("textbox", { name: /^Müderris/ });
  await email.fill(TALEBE.email as string);
  await email.press("Enter");
  await expect(dialog.getByTestId("chosen-head")).toBeVisible();
  await dialog.getByRole("button", { name: "Müderris ata" }).click();
  await expect(dialog).toBeHidden();

  await expect(rowOf(page, fixture.course.title)).toHaveCount(0);
  const held = await fixture.held(fixture.course.id, "MUDERRIS");
  expect(held).toHaveLength(1);
  expect(held[0]).toMatchObject({ userId: TALEBE.sub, isImam: true });
  expect(await fixture.listedMuderris(fixture.course.id)).toEqual([TALEBE.sub]);
});

test("nizam/14 — 'Vazgeç' changes nothing, and the scrim does not close the window", async ({
  page,
}) => {
  test.skip(!(seedable && SYSTEM_ADMIN.password), "no SYSTEM_ADMIN account");
  await signIn(page, SYSTEM_ADMIN);
  await openInactive(page);
  await rowOf(page, fixture.kosk.name)
    .getByRole("button", { name: /Köşk nazımı ata/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "Köşk nazımı ata" });
  await page.mouse.click(5, 5);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Vazgeç" }).click();
  await expect(dialog).toBeHidden();
  await expect(rowOf(page, fixture.kosk.name)).toHaveCount(1);
  expect(await fixture.held(fixture.kosk.id, "KOSK_NAZIM")).toEqual([]);
});

test("nizam/14 — 'İçeriği gör' opens the scope and writes one audit row every time; a medrese has no such button (criterion 4)", async ({
  page,
}) => {
  test.skip(!(seedable && SYSTEM_ADMIN.password), "no SYSTEM_ADMIN account");
  await signIn(page, SYSTEM_ADMIN);
  await openInactive(page);

  await expect(
    rowOf(page, fixture.madrasah.name).getByRole("button", {
      name: /İçeriği gör/,
    })
  ).toHaveCount(0);

  await rowOf(page, fixture.kosk.name)
    .getByRole("button", { name: /İçeriği gör/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`/tr/kosks/${fixture.kosk.id}$`));
  expect(await fixture.audits("inactive_scope.view", fixture.kosk.id)).toBe(1);

  await openInactive(page);
  await rowOf(page, fixture.kosk.name)
    .getByRole("button", { name: /İçeriği gör/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`/tr/kosks/${fixture.kosk.id}$`));
  expect(await fixture.audits("inactive_scope.view", fixture.kosk.id)).toBe(2);

  await openInactive(page);
  await rowOf(page, fixture.course.title)
    .getByRole("button", { name: /İçeriği gör/ })
    .click();
  await expect(page).toHaveURL(
    new RegExp(
      `/tr/kosks/${fixture.activeKosk.id}/courses/${fixture.course.id}/edit$`
    )
  );
  expect(await fixture.audits("inactive_scope.view", fixture.course.id)).toBe(
    1
  );
});
