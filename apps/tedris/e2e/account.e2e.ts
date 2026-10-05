import { expect, type Page, test } from "@playwright/test";
import { type AssignmentFixture, seedAssignments } from "./assignments-seed";

/**
 * Design tedris/43, acceptance criteria 1 to 4, against the running app and
 * API with real Keycloak sign-ins (MDRS-169). Each account is read from
 * E2E_<ROLE>_EMAIL, E2E_<ROLE>_PASSWORD and E2E_<ROLE>_SUB; a spec whose
 * account is missing is skipped. The roles themselves are seeded under random
 * ids by `assignments-seed.ts`.
 */
const account = (role: string) => ({
  email: process.env[`E2E_${role}_EMAIL`],
  password: process.env[`E2E_${role}_PASSWORD`],
  sub: process.env[`E2E_${role}_SUB`],
});
const MUDERRIS = account("MUDERRIS");
const KOSK_NAZIM = account("KOSK_NAZIM");
const MEDARIS_NAZIM = account("MEDARIS_NAZIM");
const TALEBE = account("TALEBE");
const NAZIR_URL = (
  process.env.E2E_NAZIR_URL ?? "http://localhost:4002"
).replace(/\/$/, "");
const NIZAM_URL = process.env.E2E_NIZAM_URL ?? "http://localhost:4001";

const ready = Boolean(
  MUDERRIS.sub && KOSK_NAZIM.sub && MEDARIS_NAZIM.sub && MUDERRIS.password
);

let fixture: AssignmentFixture;

test.beforeAll(async () => {
  if (!ready) return;
  fixture = await seedAssignments({
    granter: MEDARIS_NAZIM.sub as string,
    koskNazim: KOSK_NAZIM.sub as string,
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
  await page.waitForURL(/localhost:4000/);
}

const tasks = (page: Page) =>
  page.getByRole("table", { name: "Görevlerin" }).locator("tbody tr");

test("a müderris sees every role with scope, badge, grantor, term and Nazır button", async ({
  page,
}) => {
  test.skip(!ready, "no Keycloak accounts in the environment");
  await signIn(page, MUDERRIS);
  await page.goto("/tr/account");

  await expect(
    page.getByRole("heading", { level: 2, name: "Görevlerin ve izinlerin" })
  ).toBeVisible();
  // the three of the fixture, and the seats the shared test seed gave the account
  await expect(tasks(page)).toHaveCount(3 + fixture.standing.muderris);

  const row = (title: string) => tasks(page).filter({ hasText: title }).first();
  await expect(row(fixture.published.title)).toContainText("Yayında");
  await expect(row(fixture.published.title)).toContainText(
    `${fixture.koskName} · ${fixture.madrasahName}`
  );
  await expect(row(fixture.published.title)).toContainText("İmam");
  await expect(row(fixture.draft.title)).toContainText("Taslak");
  await expect(row(fixture.draft.title)).toContainText("Kendin");
  await expect(row(fixture.hidden.title)).toContainText("Gizli");
  await expect(row(fixture.published.title)).not.toContainText("Kendin");
  await expect(row(fixture.published.title)).toContainText("Süresiz");

  const open = row(fixture.published.title).getByRole("link", {
    name: /Nazır’da aç/,
  });
  await expect(open).toHaveAttribute("target", "_blank");
  // a course seat opens the Nazır itself, which finds the course (only a köşk has a deep link)
  await expect(open).toHaveAttribute("href", NAZIR_URL);
  await expect(open).toHaveAccessibleName(
    `Nazır’da aç: müderris, ${fixture.published.title}`
  );

  // permissions come from the role only: a müderris holds no köşk permission
  const group = page.getByTestId("permission-group").first();
  await expect(group).toContainText("Müderris");
  await expect(group).toContainText(
    "Dersi düzenle: başlık, tanıtım, müfredat, saat dilimi"
  );
  await expect(
    page.getByText("Köşkü düzenle, gizle ya da geri al")
  ).toHaveCount(0);
});

test("a köşk nazım opens Nizam in a new tab with the köşk in the address", async ({
  page,
  context,
}) => {
  test.skip(!ready, "no Keycloak accounts in the environment");
  await signIn(page, KOSK_NAZIM);
  await page.goto("/tr/account");

  await expect(tasks(page)).toHaveCount(1 + fixture.standing.koskNazim);
  const own = tasks(page).filter({ hasText: fixture.koskName });
  await expect(own).toContainText("Köşk nazımı");
  await expect(page.getByTestId("permission-group").first()).toContainText(
    "E-postayla kullanıcı bul"
  );

  // the link is what is tested, not the app behind it: Nizam need not be running
  await context.route(`${NIZAM_URL}/**`, (route) =>
    route.fulfill({ status: 200, body: "nizam" })
  );
  const [popup] = await Promise.all([
    context.waitForEvent("page"),
    own.getByRole("link", { name: /Nizam’da aç/ }).click(),
  ]);
  expect(decodeURIComponent(popup.url())).toContain(fixture.koskId);
  await popup.close();
});

test("someone with no role sees no roles section", async ({ page }) => {
  test.skip(!(TALEBE.email && TALEBE.password), "no talebe account");
  await signIn(page, TALEBE);
  await page.goto("/tr/account");
  await expect(
    page.getByRole("heading", { level: 1, name: "Hesap" })
  ).toBeVisible();
  await expect(page.getByText("Görevlerin ve izinlerin")).toHaveCount(0);
});
