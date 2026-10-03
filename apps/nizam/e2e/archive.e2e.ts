import { expect, type Page, test } from "@playwright/test";
import { type ArchiveFixture, seedArchive } from "./archive-seed";

/**
 * Designs nizam/28 (the köşk archive) and nizam/29 (the platform archive)
 * against the running app and API, with real Keycloak sign-ins (MDRS-173). A
 * spec whose account is not in the environment (E2E_<ROLE>_EMAIL, _PASSWORD,
 * _SUB) is skipped.
 *
 * The platform archive and its permanent delete need the SYSTEM_ADMIN realm
 * role, which the shared realm does not have yet: those specs run only with
 * E2E_SYSTEM_ADMIN_HAS_ROLE=1. The same rules are covered against a real
 * Postgres with a minted SYSTEM_ADMIN token in tedrisat's
 * `archive.e2e.spec.ts`.
 */
const account = (role: string) => ({
  email: process.env[`E2E_${role}_EMAIL`],
  password: process.env[`E2E_${role}_PASSWORD`],
  sub: process.env[`E2E_${role}_SUB`],
});
const KOSK_NAZIM = account("KOSK_NAZIM");
const SYSTEM_ADMIN = account("SYSTEM_ADMIN");
const systemAdminReady = process.env.E2E_SYSTEM_ADMIN_HAS_ROLE === "1";

const seedable = Boolean(KOSK_NAZIM.sub && KOSK_NAZIM.email);
let fixture: ArchiveFixture;

test.beforeEach(async () => {
  if (!seedable) return;
  fixture = await seedArchive({ nazim: KOSK_NAZIM.sub as string });
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

const rows = (page: Page) => page.locator("[data-testid=archive] tbody tr");
const count = (page: Page) => page.getByTestId("archive-count");

test("nizam/28 — the köşk archive lists what is hidden, by type, who and when, and only this köşk's", async ({
  page,
}) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.koskId}/arsiv`);

  await expect(
    page.getByRole("heading", { level: 1, name: "Arşiv" })
  ).toBeVisible();
  await expect(rows(page)).toHaveCount(3);
  await expect(count(page)).toHaveText("3 gizli öğe");
  await expect(page.getByText(fixture.foreignCourse.title)).toHaveCount(0);

  const session = rows(page).filter({ hasText: fixture.session.title });
  await expect(session).toContainText("Celse");
  await expect(session).toContainText("Hafta 5");
  await expect(session).toContainText("Köşk nazımı");
  await expect(rows(page).first()).toContainText(fixture.session.title);
  await expect(
    rows(page).filter({ hasText: fixture.course.title })
  ).toContainText("Ders");

  // criterion 4: this view has no permanent delete
  await expect(page.getByText("Kalıcı olarak sil")).toHaveCount(0);
});

test("nizam/28 — the type filter narrows the list and the count follows", async ({
  page,
}) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.koskId}/arsiv`);
  await expect(rows(page)).toHaveCount(3);

  await page.getByRole("combobox", { name: "Tür süzgeci" }).click();
  await page.getByRole("option", { name: "Ders", exact: true }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(count(page)).toHaveText("1 gizli öğe");
  await expect(rows(page).first()).toContainText(fixture.course.title);

  await page.getByRole("searchbox", { name: "Gizlenenlerde ara" }).fill("zzz");
  await expect(page.getByText("Bu süzgece uyan gizli öğe yok")).toBeVisible();
});

test("nizam/28 — 'Geri al' brings the course back and takes the row out of the list", async ({
  page,
}) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.koskId}/arsiv`);

  await page
    .getByRole("button", {
      name: new RegExp(`^Geri al: ${fixture.course.title}`),
    })
    .click();
  await expect(rows(page)).toHaveCount(2);
  await expect(count(page)).toHaveText("2 gizli öğe");
  await expect(page.getByText("Geri alındı")).toBeVisible();
  expect(await fixture.isShown("courses", fixture.course.id)).toBe(true);

  // it is back where it was: on the köşk's page
  await page.goto(`/tr/kosks/${fixture.koskId}`);
  await expect(page.getByText(fixture.course.title)).toBeVisible();
});

test("nizam/28 — a session and a week come back too", async ({ page }) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.koskId}/arsiv`);

  await page
    .getByRole("button", {
      name: new RegExp(`^Geri al: ${fixture.session.title}`),
    })
    .click();
  await expect(rows(page)).toHaveCount(2);
  await page
    .getByRole("button", {
      name: new RegExp(`^Geri al: ${fixture.week.title}`),
    })
    .click();
  await expect(rows(page)).toHaveCount(1);
  expect(await fixture.isShown("lessons", fixture.session.id)).toBe(true);
  expect(await fixture.isShown("course_weeks", fixture.week.id)).toBe(true);
});

test("nizam/28 — the köşk page links to the archive for its nazım", async ({
  page,
}) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.koskId}`);
  await page.locator("main").getByRole("link", { name: "Arşiv" }).click();
  await expect(page).toHaveURL(new RegExp(`/kosks/${fixture.koskId}/arsiv$`));
});

test("nizam/28 and 29 — a köşk nazım is refused the platform archive and another köşk's archive", async ({
  page,
}) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);

  await page.goto("/tr/arsiv");
  await expect(
    page.getByRole("heading", { name: "Bu bölüm için izniniz yok" })
  ).toBeVisible();

  await page.goto("/tr/kosks/a0000000-0000-4000-8000-0000000000ff/arsiv");
  await expect(
    page.getByRole("heading", { name: "Bu bölüm için izniniz yok" })
  ).toBeVisible();
});

test.describe("nizam/29 — the platform archive (needs the SYSTEM_ADMIN realm role)", () => {
  test.skip(
    !(systemAdminReady && SYSTEM_ADMIN.password && seedable),
    "SYSTEM_ADMIN realm role is not in the shared Keycloak"
  );

  test("lists every köşk's hidden items, 10 at a time, and filters by scope", async ({
    page,
  }) => {
    await signIn(page, SYSTEM_ADMIN);
    await page.goto("/tr/arsiv");
    await expect(
      page.getByRole("heading", { level: 1, name: "Arşiv" })
    ).toBeVisible();
    await expect(
      rows(page).filter({ hasText: fixture.foreignCourse.title })
    ).toHaveCount(1);
    await expect(
      rows(page)
        .first()
        .getByRole("button", { name: /^Kalıcı olarak sil/ })
    ).toBeVisible();
  });

  test("'Kalıcı olarak sil' counts what goes, then deletes the course for good", async ({
    page,
  }) => {
    await signIn(page, SYSTEM_ADMIN);
    await page.goto("/tr/arsiv");
    await page
      .getByRole("button", {
        name: new RegExp(`^Kalıcı olarak sil: ${fixture.course.title}`),
      })
      .click();

    const dialog = page.getByRole("alertdialog");
    await expect(
      dialog.getByRole("heading", { name: "Dersi kalıcı olarak sil" })
    ).toBeVisible();
    await expect(dialog.getByTestId("impact-lines")).toContainText("2 hafta");
    await expect(dialog).toContainText(
      "Silme, denetim kaydına adınızla yazılır."
    );
    // focus starts on the safe answer
    await expect(dialog.getByRole("button", { name: "Vazgeç" })).toBeFocused();

    await dialog.getByRole("button", { name: "Kalıcı olarak sil" }).click();
    await expect(
      rows(page).filter({ hasText: fixture.course.title })
    ).toHaveCount(0);
    expect(await fixture.exists("courses", fixture.course.id)).toBe(false);
  });
});
