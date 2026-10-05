import { account, canSignIn, expect, test } from "./accounts";
import { type NazirFixture, seedPortal } from "./seed";

/**
 * Design nazir/02 (Bu portala erişiminiz yok) and the gate in front of it,
 * against the running app and API with real Keycloak sign-ins (MDRS-183). A
 * spec whose account is not in the environment is skipped.
 *
 * The success paths use MEDRESE_BASMUDERRIS: the role resolver maps only that
 * role to the medrese's matrix row today, and MEDRESE_NAZIR / DERS_NAZIR are
 * in no row of it (an open owner decision). `/me/assignments` is self-service,
 * so the gate itself works for all of them.
 */
const TALEBE = account("TALEBE");
const BASMUDERRIS = account("MEDRESE_BASMUDERRIS");

let fixture: NazirFixture | undefined;

test.beforeAll(async () => {
  if (!BASMUDERRIS.sub) return;
  fixture = await seedPortal({ basmuderris: BASMUDERRIS.sub });
});

test.afterAll(async () => {
  await fixture?.remove();
});

test("a talebe with no medrese and no course opens '/' and sees nazir/02, with their e-mail and no menu", async ({
  as,
}) => {
  test.skip(!canSignIn(TALEBE), "no talebe account");
  const page = await as("TALEBE");
  await page.goto("/");
  await page.waitForURL(/\/erisim-yok$/);

  await expect(
    page.getByRole("heading", { level: 1, name: "Bu portala erişiminiz yok" })
  ).toBeVisible();
  await expect(
    page
      .getByText(
        "Nazar, medrese ve ders görevlilerinin portalıdır. Hesabınızda bir medrese ya da ders görevi yok; görev aldığınızda bu portal açılır."
      )
      .filter({ visible: true })
  ).toBeVisible();
  // `visible`: right after the redirect Next can still hold the page's hidden copy
  await expect(
    page
      .locator("main")
      .getByText(`Giriş yaptığınız hesap: ${TALEBE.email}`)
      .filter({ visible: true })
  ).toBeVisible();

  // The sidebar is the brand and the person: no menu, no picker, and the
  // person is not a link to the account page. The theme toggle is the one
  // control a sidebar always has (MDRS-245).
  const sidebar = page.locator("aside");
  await expect(sidebar.getByRole("navigation")).toHaveCount(0);
  await expect(sidebar.getByRole("button")).toHaveCount(1);
  await expect(sidebar.getByRole("button")).toHaveAccessibleName(/temaya geç/);
  await expect(sidebar.getByRole("link")).toHaveCount(0);
  await expect(sidebar).toContainText("Talebe");
});

test("'Tedris’e dön' is a link to the Tedris address", async ({ as }) => {
  test.skip(!canSignIn(TALEBE), "no talebe account");
  const page = await as("TALEBE");
  await page.goto("/erisim-yok");
  const back = page.getByRole("link", { name: "Tedris’e dön" });
  // TEDRIS_URL of the running app; the link is left out when it is not set.
  await expect(back).toHaveAttribute("href", /^https?:\/\//);
});

test("a talebe asking for a scope's page gets the no-access page, not a 404", async ({
  as,
}) => {
  test.skip(!canSignIn(TALEBE), "no talebe account");
  const page = await as("TALEBE");
  await page.goto("/medrese/a0000000-0000-4000-8000-0000000000ff");
  await page.waitForURL(/\/erisim-yok$/);
  await page.goto("/hesap");
  await page.waitForURL(/\/erisim-yok$/);
});

test("a person with a medrese opening /erisim-yok is sent on to the portal (criterion 4)", async ({
  as,
}) => {
  test.skip(!(fixture && canSignIn(BASMUDERRIS)), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await page.goto("/erisim-yok");
  await page.waitForURL((url) => !url.pathname.startsWith("/erisim-yok"));
  await expect(page.locator("aside").getByRole("navigation")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Bu portala erişiminiz yok" })
  ).toHaveCount(0);
});

test("'/' opens the scope that was last used and falls back to the first medrese", async ({
  as,
}) => {
  test.skip(!(fixture && canSignIn(BASMUDERRIS)), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");

  // the cookie is written once the page has hydrated, so wait for it
  const remembered = (scope: string) =>
    expect
      .poll(
        async () =>
          (await page.context().cookies()).find((c) => c.name === "nazar-scope")
            ?.value
      )
      .toBe(encodeURIComponent(scope));

  await page.goto(`/ders/${fixture?.first.id}`);
  await remembered(`ders:${fixture?.first.id}`);
  await page.goto("/");
  await page.waitForURL(`**/ders/${fixture?.first.id}`);

  await page.goto(`/medrese/${fixture?.madrasah.id}`);
  await remembered(`medrese:${fixture?.madrasah.id}`);
  await page.goto("/");
  await page.waitForURL(`**/medrese/${fixture?.madrasah.id}`);
});

test("a scope that is not the person's is a 404 in the same words as a missing page", async ({
  as,
}) => {
  test.skip(!(fixture && canSignIn(BASMUDERRIS)), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  for (const path of [
    "/medrese/a0000000-0000-4000-8000-0000000000ff",
    "/ders/a0000000-0000-4000-8000-0000000000ff",
    `/medrese/${fixture?.madrasah.id}/yok`,
    `/ders/${fixture?.first.id}/dersler`,
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { level: 1, name: "Sayfa bulunamadı" }),
      path
    ).toBeVisible();
  }
});
