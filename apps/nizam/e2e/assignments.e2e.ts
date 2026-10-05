import { expect, type Page, test } from "@playwright/test";
import { type NizamFixture, seedMuderris } from "./seed";
import { seedShell } from "./shell-seed";

/**
 * Designs nizam/04 and nizam/06 against the running app and API, with real
 * Keycloak sign-ins (MDRS-169). A spec whose account is not in the environment
 * (E2E_<ROLE>_EMAIL, _PASSWORD, _SUB) is skipped.
 */
const account = (role: string) => ({
  email: process.env[`E2E_${role}_EMAIL`],
  password: process.env[`E2E_${role}_PASSWORD`],
  sub: process.env[`E2E_${role}_SUB`],
});
const MUDERRIS = account("MUDERRIS");
const KOSK_NAZIM = account("KOSK_NAZIM");
const MEDARIS_NAZIM = account("MEDARIS_NAZIM");

const seedable = Boolean(MUDERRIS.sub && MEDARIS_NAZIM.sub);

// `/tr` sends a köşk nazımı on to the home page of the first köşk they manage
// (MDRS-182), so "home" for them is that page.
const KOSK_HOME = /\/tr\/kosks\/[0-9a-f-]{36}\/ana-sayfa$/;
const HOME = /\/tr(\/kosks\/[0-9a-f-]{36}\/ana-sayfa)?$/;
let fixture: NizamFixture;

test.beforeAll(async () => {
  if (!seedable) return;
  fixture = await seedMuderris({
    granter: MEDARIS_NAZIM.sub as string,
    muderris: MUDERRIS.sub as string,
  });
});

test.afterAll(async () => {
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

test("a müderris who is not a nazım lands on 'Bu işler Nazır'da' with the same roles the API returns", async ({
  page,
}) => {
  test.skip(!(seedable && MUDERRIS.password), "no müderris account");
  await signIn(page, MUDERRIS);
  await page.goto("/tr");
  await page.waitForURL(/\/tr\/nazar-yonlendirme$/);

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Medrese ve ders işleriniz Nazır’da",
    })
  ).toBeVisible();
  const rows = page.getByTestId("task-row").filter({ visible: true });
  await expect(rows).toHaveCount(3 + fixture.standing);

  const published = rows.filter({ hasText: fixture.published.title });
  await expect(published).toContainText(
    `Müderris · ${fixture.koskName} · ${fixture.enrolled} talebe`
  );
  await expect(published).toContainText("Dersin imamı");
  const draft = rows.filter({ hasText: fixture.draft.title });
  await expect(draft).toContainText("Taslak");
  await expect(draft).not.toContainText("talebe");
  await expect(rows.filter({ hasText: fixture.madrasahName })).toContainText(
    "Medrese başmüderrisi"
  );
});

test("'Nazır'a git' goes to the Nazır address", async ({ page }) => {
  test.skip(!(seedable && MUDERRIS.password), "no müderris account");
  await signIn(page, MUDERRIS);
  await page.goto("/tr/nazar-yonlendirme");
  const go = page.getByRole("link", { name: "Nazır’a git" });
  await expect(go).toHaveAttribute("href", /localhost:4002/);
});

test("a köşk nazım is not sent to Nazır", async ({ page }) => {
  test.skip(
    !(KOSK_NAZIM.email && KOSK_NAZIM.password),
    "no köşk nazım account"
  );
  test.skip(!KOSK_NAZIM.sub, "no köşk nazım id");
  // a köşk the account manages: without one it holds no role to be sent by
  const managed = await seedShell({ nazim: KOSK_NAZIM.sub as string });
  try {
    await signIn(page, KOSK_NAZIM);
    await page.goto("/tr");
    await expect(page).toHaveURL(KOSK_HOME);
    await page.goto("/tr/nazar-yonlendirme");
    await expect(page).toHaveURL(KOSK_HOME);
  } finally {
    await managed.remove();
  }
});

test("a route the account has no page for shows 'Bu bölüm için izniniz yok' inside the shell, with the account e-mail", async ({
  page,
}) => {
  test.skip(
    !(KOSK_NAZIM.email && KOSK_NAZIM.password),
    "no köşk nazım account"
  );
  test.skip(!KOSK_NAZIM.sub, "no köşk nazım id");
  // a köşk the account manages, so that "Ana sayfaya dön" has a home to go to
  const managed = await seedShell({ nazim: KOSK_NAZIM.sub as string });
  try {
    await signIn(page, KOSK_NAZIM);
    await page.goto("/tr/izin-gruplari");
    await expect(
      page.getByRole("heading", { name: "Bu bölüm için izniniz yok" })
    ).toBeVisible();
    await expect(
      page.locator("main code").filter({ hasText: KOSK_NAZIM.email as string })
    ).toBeVisible();
    // the shell around it is still there
    await expect(page.locator("aside").first()).toBeVisible();
    await page.getByRole("link", { name: "Ana sayfaya dön" }).click();
    await expect(page).toHaveURL(HOME);
  } finally {
    await managed.remove();
  }
});

test("a köşk id that does not exist shows the same screen", async ({
  page,
}) => {
  test.skip(
    !(KOSK_NAZIM.email && KOSK_NAZIM.password),
    "no köşk nazım account"
  );
  await signIn(page, KOSK_NAZIM);
  await page.goto("/tr/kosks/a0000000-0000-4000-8000-0000000000ff");
  await expect(
    page.getByRole("heading", { name: "Bu bölüm için izniniz yok" })
  ).toBeVisible();
  await page.goto("/tr/kosks/not-a-uuid");
  await expect(
    page.getByRole("heading", { name: "Bu bölüm için izniniz yok" })
  ).toBeVisible();
});

test("a path no page answers, under the köşk the nazım manages, is 'Sayfa bulunamadı', not 'izniniz yok' (MDRS-211)", async ({
  page,
}) => {
  test.skip(
    !(KOSK_NAZIM.email && KOSK_NAZIM.password),
    "no köşk nazım account"
  );
  test.skip(!KOSK_NAZIM.sub, "no köşk nazım id");
  const managed = await seedShell({ nazim: KOSK_NAZIM.sub as string });
  try {
    await signIn(page, KOSK_NAZIM);
    await page.goto(`/tr/kosks/${managed.koskId}/celseler`);
    await expect(
      page.getByRole("heading", { name: "Sayfa bulunamadı" })
    ).toBeVisible();
    await expect(page.getByText("izniniz yok")).toHaveCount(0);
    // the shell around it is still there, and its menu no longer offers the page
    await expect(page.locator("aside").first()).toBeVisible();
    await expect(
      page
        .locator("aside")
        .first()
        .getByRole("link", { name: /^Celseler/ })
    ).toHaveCount(0);
    await page.getByRole("link", { name: "Ana sayfaya dön" }).click();
    await expect(page).toHaveURL(HOME);
  } finally {
    await managed.remove();
  }
});
