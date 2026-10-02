import { expect, test } from "@playwright/test";
import { type MadrasahFixture, seedEnrollments, seedMadrasah } from "./seed";

/**
 * Design tedris/03, acceptance criteria 1 to 5, against the running app and
 * API. Most specs run signed out: the page is open to visitors (MDRS-122). The
 * enrollment badges (`Devam ediyor`, `Onay bekliyor`) need a real Keycloak
 * login; that spec runs when E2E_TALEBE_EMAIL, E2E_TALEBE_PASSWORD and
 * E2E_TALEBE_SUB (the user's Keycloak id) are set, and is skipped otherwise.
 */
let fixture: MadrasahFixture;

test.beforeAll(async () => {
  fixture = await seedMadrasah();
});

test.afterAll(async () => {
  await fixture?.remove();
});

const page_ = (id: string) => `/tr/madrasahs/${id}`;

test("shows the medrese, its head müderris and its courses", async ({
  page,
}) => {
  await page.goto(page_(fixture.madrasahId));
  // streaming SSR leaves a hidden copy of the page outside <main> for a moment
  const main = page.getByRole("main");
  await expect(
    page.getByRole("heading", { level: 1, name: "Süleymaniye Medresesi" })
  ).toBeVisible();
  await expect(main.getByText(/^2 ders/)).toBeVisible();
  await expect(
    main.getByText(`Başmüderris ${fixture.headMuderrisName}`)
  ).toBeVisible();
  await expect(
    main.getByText("Bu medresenin 2 dersinde müderris")
  ).toBeVisible();
  for (const course of fixture.courses) {
    await expect(page.getByRole("link", { name: course.title })).toBeVisible();
  }
  await expect(page.getByText(", imam").first()).toBeVisible();
  // the unlisted köşk's course is in no list
  await expect(page.getByText(fixture.unlistedCourseTitle)).toHaveCount(0);
});

test("writes the next session as weekday and clock, and never sends the meeting link", async ({
  page,
}) => {
  const response = await page.goto(page_(fixture.madrasahId));
  expect(await response?.text()).not.toContain("e2e-secret");
  const times = page.locator("time");
  await expect(times).toHaveCount(2);
  for (const text of await times.allTextContents()) {
    expect(text).toMatch(/^(Paz|Pzt|Sal|Çar|Per|Cum|Cmt) \d{2}:\d{2}$/);
  }
});

test("lists only the köşks the medrese has a listed course in", async ({
  page,
}) => {
  await page.goto(page_(fixture.madrasahId));
  const card = page.locator("aside").filter({ hasText: "Köşkler" });
  for (const kosk of fixture.kosks) {
    await expect(card.getByRole("link", { name: kosk.name })).toBeVisible();
  }
  await expect(card.getByText("Gizli Köşk")).toHaveCount(0);
});

test("a course row leads to its course page", async ({ page }) => {
  await page.goto(page_(fixture.madrasahId));
  const course = fixture.courses[0];
  await page.getByRole("link", { name: course.title }).click();
  await expect(page).toHaveURL(new RegExp(`/courses/${course.id}$`));
});

test("an unknown or malformed medrese id answers 404 with the not-found state and no page error", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const id of ["a0000000-0000-4000-8000-0000000000ff", "abc"]) {
    const response = await page.goto(page_(id));
    expect(response?.status()).toBe(404);
    await expect(page.getByText("Sayfa bulunamadı")).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("a signed-in talebe sees Devam ediyor and Onay bekliyor on their courses", async ({
  page,
  baseURL,
}) => {
  const email = process.env.E2E_TALEBE_EMAIL;
  const password = process.env.E2E_TALEBE_PASSWORD;
  const sub = process.env.E2E_TALEBE_SUB;
  test.skip(
    !(email && password && sub),
    "no Keycloak talebe in the environment"
  );
  const remove = await seedEnrollments(fixture, sub as string);
  try {
    await page.goto("/tr/auth/signin");
    await page.locator("#username").fill(email as string);
    await page.locator("#password").fill(password as string);
    await page.locator("button[type=submit]").click();
    const appOrigin = new URL(baseURL as string).origin;
    await page.waitForURL((url) => url.origin === appOrigin);
    await page.goto(page_(fixture.madrasahId));
    const [enrolled, pending] = fixture.courses;
    const row = (title: string) =>
      page
        .locator(".mds-card")
        .filter({ has: page.getByRole("link", { name: title }) })
        .first();
    await expect(row(enrolled.title)).toContainText("Devam ediyor");
    await expect(row(pending.title)).toContainText("Onay bekliyor");
  } finally {
    await remove();
  }
});
