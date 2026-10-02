import { expect, type Page, test } from "@playwright/test";
import { type CoursePageFixture, seedCoursePage } from "./course-page-seed";

/**
 * Designs tedris/05, 06, 08, 12 and 13 (MDRS-161), against the running app and
 * API: the course page as a visitor, a signed-in talebe with no seat, one
 * waiting for approval, an enrolled one and one the course team took out.
 * The visitor specs need no account; the rest sign in through Keycloak as the
 * `e2e-talebe` user (E2E_TALEBE_EMAIL, E2E_TALEBE_PASSWORD, E2E_TALEBE_SUB) and
 * a second account for the application flow (E2E_OTHER_EMAIL,
 * E2E_OTHER_PASSWORD, E2E_OTHER_SUB); they skip when those are unset.
 */
const API = process.env.E2E_API_URL ?? "http://localhost:3001";
const talebe = {
  email: process.env.E2E_TALEBE_EMAIL,
  password: process.env.E2E_TALEBE_PASSWORD,
  sub: process.env.E2E_TALEBE_SUB,
};
const other = {
  email: process.env.E2E_OTHER_EMAIL,
  password: process.env.E2E_OTHER_PASSWORD,
  sub: process.env.E2E_OTHER_SUB,
};

let fixture: CoursePageFixture;
test.beforeAll(async () => {
  fixture = await seedCoursePage();
});
test.afterAll(async () => {
  await fixture?.remove();
});

const signIn = async (
  page: Page,
  who: { email?: string; password?: string }
) => {
  await page.goto("/tr/auth/signin");
  await page.locator("#username").fill(who.email as string);
  await page.locator("#password").fill(who.password as string);
  await page.locator("button[type=submit]").click();
  await page.waitForURL(/localhost:4000/);
};

const coursePath = () => `/tr/courses/${fixture.courseId}`;
const needs = (who: { email?: string; password?: string; sub?: string }) =>
  test.skip(
    !(who.email && who.password && who.sub),
    "no Keycloak account in the environment"
  );

test.describe("tedris/05: a visitor with no account", () => {
  test("sees the page, the programme with its locked weeks, and is asked to sign in", async ({
    page,
  }) => {
    const response = await page.goto(coursePath());
    expect(response?.status()).toBe(200);
    const main = page.locator("main").first();
    await expect(
      main.getByRole("heading", { level: 1, name: fixture.title })
    ).toBeVisible();
    await expect(
      main.getByRole("link", { name: "Başvurmak için giriş yap" })
    ).toBeVisible();
    await expect(main.getByRole("link", { name: "Kayıt ol" })).toBeVisible();
    await expect(
      main.getByRole("link", { name: fixture.madrasahName })
    ).toBeVisible();
    // Every week of the programme is there and locked.
    await expect(main.locator(".mds-week")).toHaveCount(4);
    await expect(
      main.locator(".mds-week__titles .mds-visually-hidden", {
        hasText: ", kilitli",
      })
    ).toHaveCount(4);
    // Times are the course's own zone, said out loud.
    await expect(main.getByText(/İstanbul saatiyle/)).toBeVisible();
    // The next session is named, its content is not.
    await expect(
      main.getByText(/Ders içerikleri, toplantı bağlantıları/)
    ).toBeVisible();
    expect(await page.content()).not.toContain(fixture.meetingUrl);
  });

  test("shows the sample session with its agenda and source, and hides the closed one", async ({
    page,
    request,
  }) => {
    await page.goto(coursePath());
    const sample = page.locator("#ornek-celse");
    await expect(
      sample.getByRole("heading", { name: "Örnek celse" })
    ).toBeVisible();
    await expect(sample.getByText(fixture.sample.agendaStep)).toBeVisible();
    await expect(sample.getByText(fixture.sample.source)).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain(fixture.closed.source);
    expect(html).not.toContain(fixture.closed.agendaStep);

    // The API's own answer to a caller with no token.
    const body = await (
      await request.get(`${API}/courses/${fixture.courseId}`)
    ).json();
    expect(JSON.stringify(body)).not.toContain(fixture.meetingUrl);
    const [first, closed] = body.weeks[0].lessons;
    expect(first.kaynak).toBe(fixture.sample.source);
    expect(first.agenda[0].title).toBe(fixture.sample.agendaStep);
    expect(closed).not.toHaveProperty("kaynak");
    expect(closed).not.toHaveProperty("agenda");
    expect(body.madrasah.name).toBe(fixture.madrasahName);
  });

  test("answers a draft with the not-found page", async ({ page }) => {
    const response = await page.goto(`/tr/courses/${fixture.draftId}`);
    expect(response?.status()).toBe(404);
  });

  test("'giriş yap' leads to the sign-in, which hands over to Keycloak", async ({
    page,
  }) => {
    await page.goto(coursePath());
    await page
      .locator("main")
      .first()
      .getByRole("link", { name: "Başvurmak için giriş yap" })
      .click();
    await expect(page).toHaveURL(/auth\/signin|auth\.medaris\.app/);
  });
});

test.describe("tedris/06 and 08: applying, and waiting", () => {
  test.beforeEach(async ({ page }) => {
    needs(other);
    await signIn(page, other);
  });
  test.afterEach(async () => {
    if (other.sub)
      await fixture.enroll(other.sub, "PENDING").then((undo) => undo());
  });

  test("applies, reads the window, waits with the time of the application, and withdraws", async ({
    page,
  }) => {
    if (other.sub) await (await fixture.enroll(other.sub, "PENDING"))();
    await page.goto(coursePath());
    const main = page.locator("main").first();
    await expect(
      main.getByRole("button", { name: "Kayıt başvurusu yap" })
    ).toBeVisible();
    await expect(
      main.getByText("Onaylandığında bildirim alırsın.")
    ).toBeVisible();

    await main.getByRole("button", { name: "Kayıt başvurusu yap" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Başvurun alındı")).toBeVisible();
    await dialog.getByRole("button", { name: "Tamam" }).click();

    await expect(main.getByText("Onay bekliyor").first()).toBeVisible();
    await expect(
      main.getByText(/Başvurun bugün \d\d:\d\d ders kadrosuna iletildi/)
    ).toBeVisible();
    await expect(
      main.getByRole("button", { name: "Kayıt başvurusu yap" })
    ).toHaveCount(0);
    expect(await fixture.enrollmentOf(other.sub as string)).toMatchObject({
      status: "PENDING",
    });
    expect(await page.content()).not.toContain(fixture.meetingUrl);

    await main.getByRole("button", { name: "Başvuruyu geri çek" }).click();
    await expect(
      main.getByRole("button", { name: "Kayıt başvurusu yap" })
    ).toBeVisible();
    expect(await fixture.enrollmentOf(other.sub as string)).toBeNull();
  });
});

test.describe("tedris/12: an enrolled talebe", () => {
  let undo: (() => Promise<void>) | undefined;
  test.beforeEach(async ({ page }) => {
    needs(talebe);
    undo = await fixture.enroll(talebe.sub as string, "ENROLLED");
    await signIn(page, talebe);
  });
  test.afterEach(async () => {
    await undo?.();
  });

  test("sees the next session, the progress, and the weeks that open later", async ({
    page,
  }) => {
    await page.goto(coursePath());
    const main = page.locator("main").first();
    await expect(main.getByText("Devam ediyor").first()).toBeVisible();
    await expect(main.getByText(fixture.next.title).first()).toBeVisible();
    await expect(
      main.getByText("Toplantı bağlantısı henüz eklenmedi.")
    ).toBeVisible();
    await expect(
      main.getByRole("link", { name: "Derse devam et" })
    ).toBeVisible();
    await expect(
      main.getByRole("button", { name: "Takvime ekle" })
    ).toBeVisible();
    await expect(main.getByText("%40")).toBeVisible();
    await expect(main.getByText(/tarihinde açılır/).first()).toBeVisible();
    await expect(main.getByText("İptal edildi")).toBeVisible();
    await expect(main.getByRole("tab", { name: /Ders destesi/ })).toBeVisible();
  });

  test("updates the progress, refuses a number over 100", async ({ page }) => {
    await page.goto(coursePath());
    const main = page.locator("main").first();
    await main.getByRole("button", { name: "İlerlemeni güncelle" }).click();
    const dialog = page.getByRole("dialog", { name: "İlerlemeni güncelle" });
    await dialog.getByLabel("İlerleme (yüzde)").fill("101");
    await dialog.getByRole("button", { name: "Kaydet" }).click();
    await expect(
      dialog.getByText("0 ile 100 arasında bir tam sayı yaz.")
    ).toBeVisible();
    expect(await fixture.enrollmentOf(talebe.sub as string)).toMatchObject({
      progress: 40,
    });

    await dialog.getByLabel("İlerleme (yüzde)").fill("55");
    await dialog.getByRole("button", { name: "Kaydet" }).click();
    await expect(dialog).toBeHidden();
    await page.reload();
    await expect(page.locator("main").first().getByText("%55")).toBeVisible();
    expect(await fixture.enrollmentOf(talebe.sub as string)).toMatchObject({
      progress: 55,
    });
  });

  test("follows 'Derse devam et' to the session page", async ({ page }) => {
    await page.goto(coursePath());
    await page
      .locator("main")
      .first()
      .getByRole("link", { name: "Derse devam et" })
      .click();
    await expect(page).toHaveURL(/\/courses\/.+\/lessons\//);
  });
});

test.describe("tedris/13: a talebe the course team took out", () => {
  let undo: (() => Promise<void>) | undefined;
  test.beforeEach(async ({ page }) => {
    needs(talebe);
    undo = await fixture.enroll(talebe.sub as string, "REVOKED");
    await signIn(page, talebe);
  });
  test.afterEach(async () => {
    await undo?.();
  });

  test("reads that access was withdrawn, keeps the programme, and goes back to the courses", async ({
    page,
  }) => {
    await page.goto(coursePath());
    const main = page.locator("main").first();
    await expect(main.getByText("Bu derse erişimin kaldırıldı.")).toBeVisible();
    await expect(
      main.getByRole("link", { name: "Derslerime dön" })
    ).toBeVisible();
    await expect(
      main.getByRole("button", { name: "Kayıt başvurusu yap" })
    ).toHaveCount(0);
    await expect(main.locator(".mds-week")).toHaveCount(4);
    const html = await page.content();
    expect(html).not.toContain(fixture.meetingUrl);
    expect(html).not.toContain(fixture.closed.source);

    await main.getByRole("link", { name: "Derslerime dön" }).click();
    await expect(page).toHaveURL(/\/my-courses/);
  });
});
