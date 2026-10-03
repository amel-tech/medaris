import { expect, type Page, test } from "@playwright/test";
import { type BanFixture, seedBans } from "./ban-seed";

/**
 * Design nizam/48 (Yasaklamalar, Medaris yönetimi görünümü) against the
 * running app and API, with real Keycloak sign-ins (MDRS-178). A spec whose
 * account is not in the environment (E2E_<ROLE>_EMAIL, _PASSWORD, _SUB) is
 * skipped. The köşk nazımı's own view (nizam/40 and 42) is `bans.e2e.ts`.
 */
const account = (role: string) => ({
  email: process.env[`E2E_${role}_EMAIL`],
  password: process.env[`E2E_${role}_PASSWORD`],
  sub: process.env[`E2E_${role}_SUB`],
});
const KOSK_NAZIM = account("KOSK_NAZIM");
const MUDERRIS = account("MUDERRIS");
const MEDARIS_NAZIM = account("MEDARIS_NAZIM");
const SYSTEM_ADMIN = account("SYSTEM_ADMIN");

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

const rowOf = (page: Page, name: string) =>
  page.locator("tbody tr").filter({ hasText: name });
const search = (page: Page, text: string) =>
  page.getByRole("searchbox", { name: "Kişi ara" }).fill(text);

test("nizam/48 — the başnazım sees every köşk's bans with scope, reason, who and when (criterion 1)", async ({
  page,
}) => {
  test.skip(!seedable || !SYSTEM_ADMIN.password, "no başnazım account");
  await signIn(page, SYSTEM_ADMIN);
  await page.goto("/tr/yasaklamalar");

  await expect(
    page.getByRole("heading", { name: "Yasaklamalar", level: 1 })
  ).toBeVisible();
  await search(page, fixture.byMuderris.name);
  const row = rowOf(page, fixture.byMuderris.name);
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Ders");
  await expect(row).toContainText(fixture.course.title);
  await expect(row).toContainText(fixture.koskName);
  await expect(row).toContainText(fixture.byMuderris.reason);
  await expect(row).toContainText("Müderris");
  await expect(row).toContainText("Bugün");
  await expect(
    row.getByRole("button", { name: /^Yasağı kaldır: / })
  ).toBeVisible();
  await expect(
    row.getByRole("button", { name: /^Yasağı genişlet: / })
  ).toBeVisible();
});

test("nizam/48 — the tab's count equals the unfiltered list's length (criterion 2)", async ({
  page,
}) => {
  test.skip(!seedable || !SYSTEM_ADMIN.password, "no başnazım account");
  await signIn(page, SYSTEM_ADMIN);
  await page.goto("/tr/yasaklamalar");

  const tab = page.getByRole("tab", { name: /^Etkin/ });
  const count = Number((await tab.innerText()).replace(/\D/g, ""));
  expect(count).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId("all-bans-summary").first()).toHaveText(
    `${count} etkin yasak`
  );
});

test("nizam/48 — the Kapsam chips narrow the list: Köşk keeps none of the course bans, Ders brings them back (criterion 1)", async ({
  page,
}) => {
  test.skip(!seedable || !SYSTEM_ADMIN.password, "no başnazım account");
  await signIn(page, SYSTEM_ADMIN);
  await page.goto("/tr/yasaklamalar");
  await search(page, fixture.byMuderris.name);

  const group = page.getByRole("group", { name: "Kapsam" });
  await expect(rowOf(page, fixture.byMuderris.name)).toHaveCount(1);
  await group.getByRole("button", { name: "Köşk", exact: true }).click();
  await expect(page.getByText("Bu süzgece uyan yasak yok")).toBeVisible();
  await group.getByRole("button", { name: "Ders", exact: true }).click();
  await expect(rowOf(page, fixture.byMuderris.name)).toHaveCount(1);
  await group.getByRole("button", { name: "Tümü" }).click();
  await expect(rowOf(page, fixture.byMuderris.name)).toHaveCount(1);
  // the chips Medrese and Platform wait for bans of those scopes
  await expect(group.getByRole("button", { name: "Platform" })).toHaveCount(0);
});

test("nizam/48 — 'Daha fazla göster' brings the next page of a long list", async ({
  page,
}) => {
  test.skip(!seedable || !SYSTEM_ADMIN.password, "no başnazım account");
  await fixture.addBans(23);
  await signIn(page, SYSTEM_ADMIN);
  await page.goto("/tr/yasaklamalar");
  await search(page, "Sayfalı");

  await expect(page.locator("tbody tr")).toHaveCount(20);
  await expect(page.getByTestId("all-bans-summary").first()).toHaveText(
    "23 etkin yasak"
  );
  await page.getByRole("button", { name: "Daha fazla göster" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(23);
  await expect(
    page.getByRole("button", { name: "Daha fazla göster" })
  ).toHaveCount(0);
});

test("nizam/48 — 'Yasağı genişlet' needs a reason, then opens a köşk ban beside the course ban and writes ban.extend (criterion 4)", async ({
  page,
}) => {
  test.skip(!seedable || !SYSTEM_ADMIN.password, "no başnazım account");
  await signIn(page, SYSTEM_ADMIN);
  await page.goto("/tr/yasaklamalar");
  await search(page, fixture.byMuderris.name);
  const row = rowOf(page, fixture.byMuderris.name);

  await row.getByRole("button", { name: /^Yasağı genişlet: / }).click();
  const dialog = page.getByRole("dialog", { name: "Yasağı genişlet" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(fixture.byMuderris.name);
  await expect(dialog).toContainText(fixture.koskName);
  const reason = dialog.getByRole("textbox");
  await expect(reason).toBeFocused();
  const submit = dialog.getByRole("button", {
    name: "Yasağı genişlet",
    exact: true,
  });
  await expect(submit).toBeDisabled();
  await reason.fill("Köşkün başka derslerine de başvurdu.");
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(dialog).toBeHidden();

  // the person now has a course row and a köşk row, and no more widening
  await expect(rowOf(page, fixture.byMuderris.name)).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: /^Yasağı genişlet: / })
  ).toHaveCount(0);
  const [wide, course] = (await fixture.koskBans()).filter(
    (b) => b.userId === fixture.byMuderris.id
  );
  expect(wide).toMatchObject({
    scope: "KOSK",
    lifted: false,
    reason: "Köşkün başka derslerine de başvurdu.",
    extendedFromCourseId: fixture.course.id,
    bannedRole: "SYSTEM_ADMIN",
  });
  expect(course).toMatchObject({ scope: "COURSE", lifted: false });
  expect(await fixture.auditActions()).toContain("ban.extend");
});

test("nizam/48 — a köşk row has no 'Yasağı genişlet' (criterion 5: the widest scope has nothing above it)", async ({
  page,
}) => {
  test.skip(!seedable || !SYSTEM_ADMIN.password, "no başnazım account");
  await signIn(page, SYSTEM_ADMIN);
  await page.goto("/tr/yasaklamalar");
  await search(page, fixture.byMuderris.name);
  await page
    .getByRole("button", { name: /^Yasağı genişlet: / })
    .first()
    .click();
  await page
    .getByRole("dialog", { name: "Yasağı genişlet" })
    .getByRole("textbox")
    .fill("Genişletildi.");
  await page
    .getByRole("dialog", { name: "Yasağı genişlet" })
    .getByRole("button", { name: "Yasağı genişlet", exact: true })
    .click();
  await expect(rowOf(page, fixture.byMuderris.name)).toHaveCount(2);

  const koskRow = rowOf(page, fixture.byMuderris.name).filter({
    hasText: "dersinden genişletildi",
  });
  await expect(koskRow).toHaveCount(1);
  await expect(
    koskRow.getByRole("button", { name: /^Yasağı kaldır: / })
  ).toBeVisible();
  await expect(
    koskRow.getByRole("button", { name: /^Yasağı genişlet: / })
  ).toHaveCount(0);
});

test("nizam/48 — a Medaris nazımı lifts a ban with a reason (criterion 3, as in nizam/42)", async ({
  page,
}) => {
  test.skip(!seedable || !MEDARIS_NAZIM.password, "no Medaris nazımı account");
  await signIn(page, MEDARIS_NAZIM);
  await page.goto("/tr/yasaklamalar");
  await search(page, fixture.byPlatform.name);
  const row = rowOf(page, fixture.byPlatform.name);
  await row.getByRole("button", { name: /^Yasağı kaldır: / }).click();

  const dialog = page.getByRole("dialog", { name: "Yasağı kaldır" });
  const submit = dialog.getByRole("button", {
    name: "Yasağı kaldır",
    exact: true,
  });
  await expect(submit).toBeDisabled();
  await dialog.getByRole("textbox").fill("Karar değişti.");
  await submit.click();
  await expect(dialog).toBeHidden();
  await expect(rowOf(page, fixture.byPlatform.name)).toHaveCount(0);

  await page.getByRole("tab", { name: /^Kaldırılan/ }).click();
  const lifted = rowOf(page, fixture.byPlatform.name);
  await expect(lifted).toHaveCount(1);
  await expect(lifted).toContainText("Karar değişti.");
  const ban = await fixture.ban(fixture.byPlatform.banId);
  expect(ban).toMatchObject({ lifted: true, liftReason: "Karar değişti." });
});

test("nizam/48 — a signed-out visitor is sent to sign in and the köşk nazımı gets the no-access screen (criterion 6)", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await page.goto("/tr/yasaklamalar");
  await page.waitForURL(/auth\/signin|realms/);

  await signIn(page, KOSK_NAZIM);
  await page.goto("/tr/yasaklamalar");
  await expect(
    page.getByRole("heading", { name: "Bu bölüm için izniniz yok" })
  ).toBeVisible();
  await expect(page.getByTestId("all-bans")).toHaveCount(0);
});
