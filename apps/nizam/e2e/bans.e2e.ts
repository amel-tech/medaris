import { expect, type Page, test } from "@playwright/test";
import { type BanFixture, seedBans } from "./ban-seed";

/**
 * Designs nizam/41 (Talebeyi yasakla) and nizam/42 (Yasaklamalar, Yasağı
 * kaldır) against the running app and API, with real Keycloak sign-ins
 * (MDRS-177). A spec whose account is not in the environment
 * (E2E_<ROLE>_EMAIL, _PASSWORD, _SUB) is skipped.
 */
const account = (role: string) => ({
  email: process.env[`E2E_${role}_EMAIL`],
  password: process.env[`E2E_${role}_PASSWORD`],
  sub: process.env[`E2E_${role}_SUB`],
});
const KOSK_NAZIM = account("KOSK_NAZIM");
const MUDERRIS = account("MUDERRIS");

const seedable = Boolean(KOSK_NAZIM.sub && KOSK_NAZIM.password && MUDERRIS.sub);
let fixture: BanFixture;

test.beforeEach(async () => {
  if (!seedable) return;
  fixture = await seedBans({
    nazim: KOSK_NAZIM.sub as string,
    muderris: MUDERRIS.sub as string,
  });
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

/** The roster is the "Kayıtlı" tab of the course's Talebeler page (nizam/57). */
const openRoster = async (page: Page) => {
  await page.goto(studentsUrl());
  await page.getByRole("tab", { name: /^Kayıtlı/ }).click();
};
const studentsUrl = () =>
  `/tr/kosks/${fixture.koskId}/courses/${fixture.course.id}/students`;
const rowOf = (page: Page, name: string) =>
  page.locator("tbody tr").filter({ hasText: name });

test("nizam/41 — 'Yasakla' opens the window for that talebe, with the course scope chosen", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await openRoster(page);

  await page
    .getByRole("button", { name: `Yasakla: ${fixture.talebe.name}` })
    .click();
  const dialog = page.getByRole("dialog", { name: "Talebeyi yasakla" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(fixture.talebe.name);
  await expect(dialog).toContainText(fixture.talebe.email);
  await expect(dialog).toContainText(fixture.course.title);
  await expect(
    dialog.getByRole("radio", { name: "Yalnızca bu ders" })
  ).toBeChecked();
  await expect(
    dialog.getByRole("radio", { name: "Köşkten de yasakla" })
  ).not.toBeChecked();
  // the window opens on the reason field
  await expect(dialog.getByRole("textbox")).toBeFocused();
});

test("nizam/41 — the reason is required: 'Yasakla' stays off for empty or blank text, and the field says so", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await openRoster(page);
  await page
    .getByRole("button", { name: `Yasakla: ${fixture.talebe.name}` })
    .click();
  const dialog = page.getByRole("dialog", { name: "Talebeyi yasakla" });
  const submit = dialog.getByRole("button", { name: "Yasakla", exact: true });
  const reason = dialog.getByRole("textbox");

  await expect(submit).toBeDisabled();
  await reason.fill("   ");
  await expect(submit).toBeDisabled();
  await reason.blur();
  await expect(dialog.getByText("Bir gerekçe yazın.")).toBeVisible();
  await reason.fill("Celsede hakaret.");
  await expect(submit).toBeEnabled();
});

test("nizam/41 — the scrim does not close it; Escape and 'Vazgeç' do", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await openRoster(page);
  const open = async () => {
    await page
      .getByRole("button", { name: `Yasakla: ${fixture.talebe.name}` })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Talebeyi yasakla" })
    ).toBeVisible();
  };

  await open();
  await page.mouse.click(5, 5);
  await expect(
    page.getByRole("dialog", { name: "Talebeyi yasakla" })
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Talebeyi yasakla" })
  ).toBeHidden();

  await open();
  await page.getByRole("button", { name: "Vazgeç" }).click();
  await expect(
    page.getByRole("dialog", { name: "Talebeyi yasakla" })
  ).toBeHidden();
});

test("nizam/41 — barring marks the row 'Yasaklı', swaps 'Dersten çıkar' for 'Yasağı kaldır' and keeps the reason", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await openRoster(page);
  const row = rowOf(page, fixture.talebe.name);
  await expect(
    row.getByRole("button", { name: /Dersten çıkar/ })
  ).toBeVisible();

  await page
    .getByRole("button", { name: `Yasakla: ${fixture.talebe.name}` })
    .click();
  const dialog = page.getByRole("dialog", { name: "Talebeyi yasakla" });
  await dialog.getByRole("textbox").fill("Celsede başka talebelere hakaret.");
  await dialog.getByRole("button", { name: "Yasakla", exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText("Yasak kaydedildi")).toBeVisible();
  await expect(row).toContainText("Yasaklı");
  await expect(row).toContainText("Bu ders");
  await expect(row.getByRole("button", { name: /Dersten çıkar/ })).toHaveCount(
    0
  );
  await expect(
    row.getByRole("button", { name: `Yasağı kaldır: ${fixture.talebe.name}` })
  ).toBeVisible();
});

test("nizam/41 — the köşk nazımı can bar the whole köşk, and the ban remembers the course", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await openRoster(page);
  await page
    .getByRole("button", { name: `Yasakla: ${fixture.talebe.name}` })
    .click();
  const dialog = page.getByRole("dialog", { name: "Talebeyi yasakla" });
  await dialog.getByRole("radio", { name: "Köşkten de yasakla" }).click();
  await dialog.getByRole("textbox").fill("Köşkün her yerinde sorun çıkardı.");
  await dialog.getByRole("button", { name: "Yasakla", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(rowOf(page, fixture.talebe.name)).toContainText("Köşk");

  await page.goto(`/tr/kosks/${fixture.koskId}/yasaklamalar`);
  const row = rowOf(page, fixture.talebe.name);
  await expect(row).toContainText("Köşk");
  await expect(row).toContainText(
    `${fixture.course.title} dersinden genişletildi`
  );
});

test("nizam/42 — the list shows the bans with their columns and counts, and hides the lift where the kademe is too low", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.koskId}/yasaklamalar`);

  await expect(
    page.getByRole("heading", { level: 1, name: "Yasaklamalar" })
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: /Etkin\s*2/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Kaldırılan\s*0/ })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(2);

  await page.setViewportSize({ width: 1440, height: 900 });
  const fit = await page.locator(".mds-table-wrap").evaluate((wrap) => ({
    scroll: wrap.scrollWidth,
    client: wrap.clientWidth,
  }));
  expect(fit.scroll).toBeLessThanOrEqual(fit.client);
  const clipped = await page
    .locator("tbody td button")
    .evaluateAll(
      (btns) => btns.filter((b) => b.scrollWidth > b.clientWidth).length
    );
  expect(clipped).toBe(0);

  const muderris = rowOf(page, fixture.byMuderris.name);
  await expect(muderris).toContainText(fixture.byMuderris.reason);
  await expect(muderris).toContainText("Müderris");
  await expect(muderris).toContainText("Yeni");
  await expect(
    muderris.getByRole("button", {
      name: `Yasağı kaldır: ${fixture.byMuderris.name}`,
    })
  ).toBeVisible();

  const platform = rowOf(page, fixture.byPlatform.name);
  await expect(platform).toContainText("Medaris nazımı");
  await expect(
    platform.getByRole("button", { name: /Yasağı kaldır/ })
  ).toHaveCount(0);
  await expect(platform).toContainText(
    "Bu yasağı yalnız Medaris yönetimi kaldırabilir."
  );
});

test("nizam/42 — lifting needs a reason, then moves the ban to 'Kaldırılan' with who and why", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.koskId}/yasaklamalar`);

  await page
    .getByRole("button", { name: `Yasağı kaldır: ${fixture.byMuderris.name}` })
    .click();
  const dialog = page.getByRole("dialog", { name: "Yasağı kaldır" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(fixture.byMuderris.name);
  await expect(dialog).toContainText(fixture.byMuderris.reason);
  await expect(dialog).toContainText("köşk nazımı olarak kaldırabilirsiniz");

  const submit = dialog.getByRole("button", { name: "Yasağı kaldır" });
  await expect(submit).toBeDisabled();
  await dialog.getByRole("textbox").fill("Talebeyle görüşüldü; söz verdi.");
  await submit.click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText("Yasak kaldırıldı")).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.getByRole("tab", { name: /Etkin\s*1/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Kaldırılan\s*1/ })).toBeVisible();

  await page.getByRole("tab", { name: /Kaldırılan/ }).click();
  const lifted = rowOf(page, fixture.byMuderris.name);
  await expect(lifted).toContainText("Talebeyle görüşüldü; söz verdi.");

  const stored = await fixture.ban(fixture.byMuderris.banId);
  expect(stored?.lifted).toBe(true);
  expect(stored?.liftedBy).toBe(KOSK_NAZIM.sub);
  expect(stored?.liftReason).toBe("Talebeyle görüşüldü; söz verdi.");
});

test("nizam/42 — 'Köşkten de yasakla' widens a course ban to the köşk", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.koskId}/yasaklamalar`);

  await page
    .getByRole("button", {
      name: `Köşkten de yasakla: ${fixture.byMuderris.name}`,
    })
    .click();
  await expect(page.getByText("Köşkten de yasaklandı")).toBeVisible();
  const rows = rowOf(page, fixture.byMuderris.name);
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "Köşk" }).first()).toContainText(
    `${fixture.course.title} dersinden genişletildi`
  );
});

test("nizam/42 — a signed-out visitor is sent to sign in, and the müderris of the course gets the no-access screen", async ({
  page,
}) => {
  test.skip(!seedable || !MUDERRIS.password, "no müderris account");
  await page.goto(`/tr/kosks/${fixture.koskId}/yasaklamalar`);
  await expect(page).toHaveURL(/signin|auth/);
  await signIn(page, MUDERRIS);
  await page.goto(`/tr/kosks/${fixture.koskId}/yasaklamalar`);
  await expect(
    page.getByRole("heading", { name: "Bu bölüm için izniniz yok" })
  ).toBeVisible();
  await expect(page.getByText(fixture.byMuderris.name)).toHaveCount(0);
});
