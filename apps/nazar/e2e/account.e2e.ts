import { account, canSignIn, expect, signIn, test } from "./accounts";
import { type NazirFixture, seedPortal } from "./seed";

/**
 * Design nazir/20 (Hesap ve ayarlar) against the running app and API with real
 * Keycloak sign-ins (MDRS-183). Roles and permissions are the API's own, read
 * back through the page.
 */
const BASMUDERRIS = account("MEDRESE_BASMUDERRIS");

let fixture: NazirFixture | undefined;

test.beforeAll(async () => {
  if (!BASMUDERRIS.sub) return;
  fixture = await seedPortal({ basmuderris: BASMUDERRIS.sub });
});

test.afterAll(async () => {
  await fixture?.remove();
});

const seeded = () => Boolean(fixture && canSignIn(BASMUDERRIS));

test("the roles table is the person's real assignments, the medrese first, with the 'no nazırlık' note", async ({
  as,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await page.goto("/hesap");

  await expect(
    page.getByRole("heading", { level: 1, name: "Hesap ve ayarlar" })
  ).toBeVisible();
  const table = page.getByRole("table", { name: "Görevleriniz" });
  const rows = table.locator("tbody tr");
  // the course rows name their medrese too, so the first row that names it is the
  // medrese's own (the shared test seed gives the account another medrese, whose
  // row may come before it)
  const named = rows.filter({ hasText: fixture?.madrasah.name ?? "" });
  await expect(named.first()).toContainText("Medrese başmüderrisi");
  await expect(named.first()).toContainText("Etkin");
  const course = rows.filter({ hasText: fixture?.first.title ?? "" });
  await expect(course).toContainText("Müderris");
  await expect(course).toContainText("Dersin imamı");
  await expect(course).toContainText(fixture?.first.koskName ?? "");
  await expect(course).toContainText("Yayında");
  await expect(course).toContainText("Kendiniz");
  await expect(course).toContainText("Süresiz");

  // the account is not a nazır of either kind
  await expect(
    page
      .getByText("Medrese nazırlığınız ya da ders nazırlığınız yok.")
      .filter({ visible: true })
  ).toBeVisible();
  // and there is no way to "open in the app" from the app itself
  await expect(page.getByRole("link", { name: /Nazar’da aç/ })).toHaveCount(0);
});

test("the permission sentences come from the person's courses, grouped under one heading", async ({
  as,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await page.goto("/hesap");

  // the group headed "Müderris": the medrese başmüderrisi's comes first or not, by
  // how many medreses the shared test seed gives the account
  const group = page.getByTestId("permission-group").filter({
    has: page.getByRole("heading", { level: 3, name: "Müderris", exact: true }),
  });
  await expect(
    group.getByRole("heading", { level: 3, name: "Müderris", exact: true })
  ).toBeVisible();
  await expect(group).toContainText(
    "Müderris olduğunuz derslerin her birinde geçerli"
  );
  await expect(group).toContainText(
    "Dersi düzenle: başlık, tanıtım, müfredat, saat dilimi"
  );
  await expect(group).toContainText("Bitiş: süresiz.");
});

test("the e-mail is read-only and the language is Türkçe", async ({ as }) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await page.goto("/hesap");

  // `visible`: a page Next keeps hidden after a navigation holds the same fields
  const email = page.getByLabel("E-posta").filter({ visible: true });
  await expect(email).toHaveValue(BASMUDERRIS.email as string);
  await expect(email).toHaveAttribute("readonly", "");
  const language = page
    .getByLabel("Dil", { exact: true })
    .filter({ visible: true });
  await expect(language).toHaveValue("Türkçe");
  await expect(language).toHaveAttribute("readonly", "");
  await expect(
    page
      .getByText("Medaris şimdilik yalnız Türkçe görünür.")
      .filter({ visible: true })
  ).toBeVisible();
});

test("the time zone saves the moment it is chosen and is still chosen after a reload", async ({
  as,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await page.goto("/hesap");

  const zone = page.getByRole("combobox", { name: "Saat dilimi" });
  try {
    await zone.click();
    await page.getByRole("option", { name: "New York" }).click();
    // no save button: a toast says it was kept
    await expect(
      page.getByText("Saat diliminiz kaydedildi.").filter({ visible: true })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Kaydet/ })).toHaveCount(0);

    await page.reload();
    await expect(zone).toContainText("New York");
  } finally {
    // The profile is the account's, not the fixture's: put İstanbul back.
    await zone.click();
    await page.getByRole("option", { name: "İstanbul" }).click();
    await expect(zone).toContainText("İstanbul");
  }
});

test("'Diğer…' opens the full list of zones, and a zone from it is kept too", async ({
  as,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await page.goto("/hesap");

  const zone = page.getByRole("combobox", { name: "Saat dilimi" });
  try {
    await zone.click();
    await page.getByRole("option", { name: "Diğer…" }).click();
    const others = page.getByRole("combobox", { name: "Diğer saat dilimleri" });
    await others.click();
    await page.getByRole("option", { name: "Asia / Tokyo" }).click();
    await expect(
      page.getByText("Saat diliminiz kaydedildi.").filter({ visible: true })
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("combobox", { name: "Diğer saat dilimleri" })
    ).toContainText("Asia / Tokyo");
  } finally {
    await page.goto("/hesap");
    await page.getByRole("combobox", { name: "Saat dilimi" }).click();
    await page.getByRole("option", { name: "İstanbul" }).click();
    await expect(
      page.getByRole("combobox", { name: "Saat dilimi" })
    ).toContainText("İstanbul");
  }
});

test("a failed save puts the previous zone back and says so", async ({
  as,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await page.goto("/hesap");

  // The server action posts to this page; refuse the next one.
  await page.route("**/hesap", async (route) => {
    if (route.request().method() === "POST") {
      await route.abort();
      return;
    }
    await route.continue();
  });
  const zone = page.getByRole("combobox", { name: "Saat dilimi" });
  const before = (await zone.innerText()).trim();
  await zone.click();
  await page.getByRole("option", { name: "Berlin" }).click();
  await expect(
    page.locator(".mds-toast--error").getByText("Saat dilimi kaydedilemedi")
  ).toBeVisible();
  await expect(zone).toContainText(before);
});

test("the sign-out card has the sentence and no confirmation window; the button ends both sessions and the back button does not return to the page", async ({
  browser,
  baseURL,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  // A session of its own: signing out revokes it, and the shared one must stay.
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  try {
    await signIn(page, BASMUDERRIS);
    await page.goto("/hesap");
    await expect(
      page
        .getByText(
          "Bu tarayıcıda Medaris’ten çıkarsınız. Görevleriniz ve tercihleriniz hesabınızda kalır."
        )
        .filter({ visible: true })
    ).toBeVisible();

    await page.getByRole("button", { name: "Çıkış yap" }).click();
    // Keycloak's end-session, then our sign-in page, then Keycloak's form.
    await expect(page.locator("#username")).toBeVisible({ timeout: 30_000 });

    await page.goBack();
    await expect(
      page.getByRole("heading", { name: "Hesap ve ayarlar" })
    ).toHaveCount(0);
    await page.goto("/hesap");
    await expect(page.locator("#username")).toBeVisible({ timeout: 30_000 });
  } finally {
    await context.close();
  }
});
