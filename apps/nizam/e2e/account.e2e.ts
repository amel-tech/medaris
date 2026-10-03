import { expect, type Page, test } from "@playwright/test";
import { type BanFixture, seedBans } from "./ban-seed";

/**
 * Designs nizam/36 (Hesap, köşk nazımı) and nizam/47 (Hesap ve ayarlar)
 * against the running app and API, with real Keycloak sign-ins (MDRS-179). A
 * spec whose account is not in the environment (E2E_<ROLE>_EMAIL, _PASSWORD,
 * _SUB) is skipped.
 */
const account = (role: string) => ({
  email: process.env[`E2E_${role}_EMAIL`],
  password: process.env[`E2E_${role}_PASSWORD`],
  sub: process.env[`E2E_${role}_SUB`],
});
const KOSK_NAZIM = account("KOSK_NAZIM");
const MUDERRIS = account("MUDERRIS");
const SYSTEM_ADMIN = account("SYSTEM_ADMIN");

const seedable = Boolean(KOSK_NAZIM.sub && KOSK_NAZIM.password && MUDERRIS.sub);
let fixture: BanFixture | undefined;

test.beforeEach(async () => {
  if (!seedable) return;
  fixture = await seedBans({
    nazim: KOSK_NAZIM.sub as string,
    muderris: MUDERRIS.sub as string,
  });
});

test.afterEach(async () => {
  await fixture?.remove();
  fixture = undefined;
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

const zone = (page: Page) =>
  page.getByRole("combobox", { name: "Saat dilimi" });

test("nizam/36 — the person row leads to 'Hesap ve ayarlar', which lists the köşk nazımı's roles with scope, grantor and term (criterion 1)", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await page.goto("/tr");
  await page.locator("aside a.mds-nav-user").click();
  await expect(page).toHaveURL(/\/tr\/hesap$/);

  await expect(
    page.getByRole("heading", { name: "Hesap ve ayarlar", level: 1 })
  ).toBeVisible();
  const table = page.getByRole("table", { name: "Görevleriniz" });
  await expect(table.getByRole("columnheader")).toHaveText([
    "Görev",
    "Kapsam",
    "Atayan",
    "Süre",
  ]);
  const row = table.locator("tbody tr").filter({ hasText: fixture?.koskName });
  await expect(row).toContainText("Köşk nazımı");
  await expect(row).toContainText("Kendiniz");
  await expect(row).toContainText("Süresiz");
});

test("nizam/36 — the active permissions come from the roles, grouped, with the köşk nazımı's sentences (criterion 2)", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await page.goto("/tr/hesap");

  const group = page
    .locator("#main")
    .getByTestId("permission-group")
    .filter({ hasText: fixture?.koskName });
  await expect(group).toContainText("köşk nazımı");
  await expect(group).toContainText("Köşkü düzenle, gizle ya da geri al");
  await expect(group).toContainText("E-postayla kullanıcı bul");
  await expect(group).toContainText("Her arama denetim kaydına yazılır.");
  await expect(group.getByTestId("expiry-note")).toContainText(
    "Süresiz: atamanız, atayan geri alana dek sürer."
  );
});

test("nizam/36 — the time zone is saved the moment it is chosen and is still there after a reload (criterion 3)", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await page.goto("/tr/hesap");

  try {
    await zone(page).click();
    await page.getByRole("option", { name: "Berlin" }).click();
    await expect(page.getByText("Saat diliminiz kaydedildi.")).toBeVisible();
    await page.reload();
    await expect(zone(page)).toContainText("Berlin");
  } finally {
    // put the shared account's profile back
    await page.goto("/tr/hesap");
    await zone(page).click();
    await page.getByRole("option", { name: "İstanbul" }).click();
    await expect(zone(page)).toContainText("İstanbul");
  }
});

test("nizam/36 — 'Diğer…' opens the full list, and a zone from it is saved too", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await page.goto("/tr/hesap");

  try {
    await zone(page).click();
    await page.getByRole("option", { name: "Diğer…" }).click();
    const all = page.getByRole("combobox", { name: "Tüm saat dilimleri" });
    await expect(all).toBeVisible();
    await all.click();
    await page.getByRole("option", { name: "Asia/Tokyo", exact: true }).click();
    await expect(page.getByText("Saat diliminiz kaydedildi.")).toBeVisible();
    await page.reload();
    // a saved zone outside the short list opens the full one
    await expect(
      page.getByRole("combobox", { name: "Tüm saat dilimleri" })
    ).toContainText("Asia/Tokyo");
  } finally {
    await page.goto("/tr/hesap");
    await zone(page).click();
    await page.getByRole("option", { name: "İstanbul" }).click();
    await expect(zone(page)).toContainText("İstanbul");
  }
});

test("nizam/36 — the e-mail is read only and the language is fixed to Turkish (criterion 4)", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await page.goto("/tr/hesap");

  const email = page.locator("#main").getByTestId("account-email");
  await expect(email).toHaveValue(KOSK_NAZIM.email as string);
  await expect(email).toHaveAttribute("readonly", "");
  await expect(page.locator("#main").getByText("Salt okunur.")).toBeVisible();
  await expect(page.getByLabel("Dil", { exact: true })).toHaveValue("Türkçe");
  await expect(page.getByLabel("Dil", { exact: true })).toHaveAttribute(
    "readonly",
    ""
  );
  await expect(
    page.locator("#main").getByText("Medaris şimdilik yalnız Türkçe görünür.")
  ).toBeVisible();
});

test("nizam/36 — 'Çıkış yap' asks once, then ends the session and returns to sign-in; a protected page then asks for sign-in (criterion 5)", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await page.goto("/tr/hesap");

  await page.getByRole("link", { name: "Çıkış yap" }).click();
  await expect(page).toHaveURL(/\/tr\/auth\/signout/);
  await page.getByRole("button", { name: "Çıkış yap" }).click();
  await page.waitForURL(/^.*(?:auth\/signin|realms\/|\/tr\/?$)/);
  await page.goto("/tr/hesap");
  await expect(page).toHaveURL(/auth\/signin|realms\//);
});

test("nizam/47 — a signed-out visitor is sent to sign in (criterion 6)", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await page.goto("/tr/hesap");
  await expect(page).toHaveURL(/auth\/signin|realms\//);
});

test("nizam/47 — the başnazım's row says the role is defined in the sign-in system and never ends", async ({
  page,
}) => {
  test.skip(!seedable || !SYSTEM_ADMIN.password, "no başnazım account");
  await signIn(page, SYSTEM_ADMIN);
  await page.goto("/tr/hesap");

  const table = page.getByRole("table", { name: "Görevleriniz" });
  const row = table
    .locator("tbody tr")
    .filter({ hasText: "Medaris başnazımı" });
  await expect(row).toContainText("Platform");
  await expect(row).toContainText("Giriş sisteminde tanımlı");
  await expect(row).toContainText("Süresiz");
  await expect(
    page.locator("#main").getByText("Bütün izinler, her kapsamda.")
  ).toBeVisible();
});
