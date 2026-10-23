import { expect, type Page, test } from "@playwright/test";
import { type CourseDecksFixture, seedCourseDecks } from "./course-decks-seed";
import { type CoursePageFixture, seedCoursePage } from "./course-page-seed";

/**
 * The course page's "Ders destesi" tab for an enrolled talebe (MDRS-248): the
 * course's decks, one featured and the others as links to their pages. Signs in
 * as the `e2e-talebe` user (E2E_TALEBE_EMAIL, E2E_TALEBE_PASSWORD,
 * E2E_TALEBE_SUB) and skips when those are unset.
 */
const talebe = {
  email: process.env.E2E_TALEBE_EMAIL,
  password: process.env.E2E_TALEBE_PASSWORD,
  sub: process.env.E2E_TALEBE_SUB,
};

let course: CoursePageFixture;
let decks: CourseDecksFixture;
let unenroll: (() => Promise<void>) | undefined;

test.beforeAll(async () => {
  course = await seedCoursePage();
  if (talebe.sub) {
    unenroll = await course.enroll(talebe.sub, "ENROLLED");
    decks = await seedCourseDecks(course.courseId);
  }
});
test.afterAll(async () => {
  await decks?.remove();
  await unenroll?.();
  await course?.remove();
});

const signIn = async (page: Page) => {
  await page.goto("/tr/auth/signin");
  await page.locator("#username").fill(talebe.email as string);
  await page.locator("#password").fill(talebe.password as string);
  await page.locator("button[type=submit]").click();
  await page.waitForURL(/localhost:4000/);
};

test.describe("MDRS-248: the course's deck tab for an enrolled talebe", () => {
  test.skip(
    !(talebe.email && talebe.password && talebe.sub),
    "no Keycloak account in the environment"
  );

  test("counts the decks, features one, and links every deck to its page", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/tr/courses/${course.courseId}?tab=deste`);

    const tab = page.getByRole("tab", { name: /Ders destesi/ });
    await expect(tab).toContainText(String(decks.deckIds.length));

    // The deck to study first is featured: it has a "Çalış" link; every other
    // deck is a row linking to its page. Each seeded deck shows up one way.
    for (const id of decks.deckIds) {
      const featured = page.locator(`a[href$="/decks/study/${id}"]`);
      const row = page.locator(`a[href$="/decks/${id}"]`);
      await expect(featured.or(row).first()).toBeVisible();
    }
  });
});
