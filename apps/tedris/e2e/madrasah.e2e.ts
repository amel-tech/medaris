import { expect, test } from "@playwright/test";
import { type MadrasahFixture, seedMadrasah } from "./seed";

/**
 * Design tedris/03, acceptance criteria 1 to 5, against the running app and
 * API. Signed out: the page is open to visitors (MDRS-122), so the enrollment
 * badges (`Devam ediyor`, `Onay bekliyor`) need a Keycloak login and are
 * covered by tedrisat's own e2e (the endpoint) and the page spec (the badge
 * mapping); they are not asserted in a browser here.
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
  await expect(
    page.getByRole("heading", { level: 1, name: "Süleymaniye Medresesi" })
  ).toBeVisible();
  await expect(page.getByText(/^2 ders/)).toBeVisible();
  await expect(
    page.getByText(`Başmüderris ${fixture.headMuderrisName}`)
  ).toBeVisible();
  await expect(
    page.getByText("Bu medresenin 2 dersinde müderris")
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
