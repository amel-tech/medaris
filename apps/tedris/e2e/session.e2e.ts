import { expect, type Page, test } from "@playwright/test";
import { type SessionFixture, seedSession } from "./session-seed";

/**
 * Designs tedris/15 (upcoming) and tedris/18 (cancelled), against the running
 * app and API. The lesson routes sit behind the auth middleware, so every
 * spec but the first signs in through Keycloak as the `e2e-talebe` user —
 * E2E_TALEBE_EMAIL, E2E_TALEBE_PASSWORD and E2E_TALEBE_SUB, skipped when they
 * are unset. The PENDING spec needs a second account: E2E_OTHER_EMAIL,
 * E2E_OTHER_PASSWORD and E2E_OTHER_SUB.
 */
let fixture: SessionFixture;
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
let removeEnrollment: (() => Promise<void>) | undefined;

test.beforeAll(async () => {
  fixture = await seedSession();
  if (talebe.sub)
    removeEnrollment = await fixture.enroll(talebe.sub, "ENROLLED");
});

test.afterAll(async () => {
  await removeEnrollment?.();
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

const sessionPath = (id: string) =>
  `/tr/courses/${fixture.courseId}/lessons/${id}`;

const needsTalebe = () =>
  test.skip(
    !(talebe.email && talebe.password && talebe.sub),
    "no Keycloak talebe in the environment"
  );

test("sends a signed-out visitor to sign in, and the link survives", async ({
  page,
}) => {
  await page.goto(sessionPath(fixture.sessions.upcoming.id));
  await expect(page).toHaveURL(/signin/);
});

test.describe("an enrolled talebe", () => {
  test.beforeEach(async ({ page }) => {
    needsTalebe();
    await signIn(page, talebe);
  });

  test("sees the date, the length, the platform, the agenda and the link inside the join window", async ({
    page,
  }) => {
    const s = fixture.sessions.upcoming;
    const response = await page.goto(sessionPath(s.id));
    expect(response?.status()).toBe(200);
    const main = page.getByRole("main");
    await expect(
      main.getByRole("heading", { level: 1, name: s.title })
    ).toBeVisible();
    await expect(main.getByText("Hafta 5").first()).toBeVisible();
    await expect(main.getByText(/dakika sonra/)).toBeVisible();
    await expect(main.getByText("60 dk").first()).toBeVisible();
    await expect(main.locator(".mds-platform-chip")).toHaveText("Zoom");
    const join = main.getByRole("link", { name: /Celseye katıl/ });
    await expect(join).toBeVisible();
    await expect(join).toHaveAttribute("href", fixture.meetingUrl);
    await expect(join).toHaveAttribute("target", "_blank");
    await expect(join).toHaveAttribute("rel", /noopener/);
    await main.getByText("Bağlantıyı göster").click();
    await expect(main.getByText(fixture.meetingUrl)).toBeVisible();
    await expect(
      main.getByRole("heading", { name: "Celse akışı" })
    ).toBeVisible();
    await expect(main.getByText("Saatler İstanbul saatiyle.")).toBeVisible();
    await expect(
      main.getByText("Selâm ve geçen haftanın tekrarı")
    ).toBeVisible();
    await expect(main.locator('[lang="ar"]').first()).toHaveText("قرأ");
    await expect(main.getByText(fixture.imamName)).toBeVisible();
    await expect(main.getByText("İmam", { exact: true })).toBeVisible();
    await expect(
      main.getByRole("button", { name: "Takvime ekle" })
    ).toBeVisible();
  });

  test("keeps the join closed more than ten minutes before the start", async ({
    page,
  }) => {
    await page.goto(sessionPath(fixture.sessions.far.id));
    const main = page.getByRole("main");
    await expect(main.getByText(/dakika sonra/)).toBeVisible();
    await expect(main.getByRole("link", { name: /Celseye katıl/ })).toHaveCount(
      0
    );
    await expect(
      main.getByText("Katılım, celse başlamadan 10 dakika önce açılır.")
    ).toBeVisible();
  });

  test("shows a notice and no join button when the session has no link", async ({
    page,
  }) => {
    await page.goto(sessionPath(fixture.sessions.noLink.id));
    const main = page.getByRole("main");
    await expect(
      main.getByText("Toplantı bağlantısı henüz eklenmedi.")
    ).toBeVisible();
    await expect(main.getByRole("link", { name: /Celseye katıl/ })).toHaveCount(
      0
    );
  });

  test("lists the previous and the next session, the cancelled one skipped, and follows a card", async ({
    page,
  }) => {
    const { upcoming, past, replacement } = fixture.sessions;
    await page.goto(sessionPath(upcoming.id));
    const nav = page.getByRole("navigation", {
      name: "Önceki ve sonraki celse",
    });
    const previous = nav.getByRole("link", {
      name: `Önceki celse: ${past.title}`,
    });
    const next = nav.getByRole("link", {
      name: `Sonraki celse: ${replacement.title}`,
    });
    await expect(previous).toBeVisible();
    await expect(nav.getByText("Hafta 4")).toBeVisible();
    await expect(next).toBeVisible();
    await previous.click();
    await expect(page).toHaveURL(new RegExp(`/lessons/${past.id}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: past.title })
    ).toBeVisible();
    await expect(page.getByText("Sona erdi").first()).toBeVisible();
  });

  test("shows the cancellation, the make-up link and no way to join", async ({
    page,
  }) => {
    const { cancelled, replacement } = fixture.sessions;
    await page.goto(sessionPath(cancelled.id));
    const main = page.getByRole("main");
    await expect(main.getByText("Bu celse iptal edildi")).toBeVisible();
    await expect(main.getByText(/Telafi celsesi:/)).toBeVisible();
    await expect(
      main.getByText("Bu celse için toplantı bağlantısı yok.")
    ).toBeVisible();
    await expect(main.getByRole("link", { name: /Celseye katıl/ })).toHaveCount(
      0
    );
    await expect(main.getByText("Takvime ekle")).toHaveCount(0);
    await expect(main.getByText("Müderris hasta")).toHaveCount(0);
    await main.getByRole("link", { name: "Telafi celsesine git" }).click();
    await expect(page).toHaveURL(new RegExp(`/lessons/${replacement.id}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: replacement.title })
    ).toBeVisible();
  });

  test("marks the cancelled session in the Müfredat and the session up next", async ({
    page,
  }) => {
    await page.goto(sessionPath(fixture.sessions.upcoming.id));
    const programme = page.getByRole("region", { name: "Müfredat" });
    await expect(programme.getByText("Devam ediyor").first()).toBeVisible();
    await expect(programme.getByText("Sıradaki")).toBeVisible();
    await expect(programme.getByText("İptal edildi")).toBeVisible();
    await expect(programme.getByText("Sona erdi").first()).toBeVisible();
  });

  test("answers 404 for a missing session and for a lesson that is not a live one", async ({
    page,
  }) => {
    for (const lessonId of [
      "a0000000-0000-4000-8000-0000000000ff",
      fixture.sessions.video.id,
    ]) {
      const response = await page.goto(sessionPath(lessonId));
      expect(response?.status()).toBe(404);
      await expect(page.getByText("Sayfa bulunamadı")).toBeVisible();
    }
  });

  test("has no page error on the cancelled page", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(sessionPath(fixture.sessions.cancelled.id));
    await expect(page.getByRole("main")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("never sends the meeting link of a cancelled session", async ({
    page,
  }) => {
    const response = await page.goto(
      sessionPath(fixture.sessions.cancelled.id)
    );
    const html = (await response?.text()) ?? "";
    expect(html).not.toContain(fixture.meetingUrl);
    expect(html).not.toContain("Müderris hasta");
  });
});

test("a PENDING applicant gets the locked card, with no link and no agenda in the page", async ({
  page,
}) => {
  test.skip(
    !(other.email && other.password && other.sub),
    "no second Keycloak account in the environment"
  );
  const remove = await fixture.enroll(other.sub as string, "PENDING");
  try {
    await signIn(page, other);
    const response = await page.goto(sessionPath(fixture.sessions.upcoming.id));
    const html = (await response?.text()) ?? "";
    expect(html).not.toContain(fixture.meetingUrl);
    expect(html).not.toContain("Selâm ve geçen haftanın tekrarı");
    await expect(page.getByRole("link", { name: /Celseye katıl/ })).toHaveCount(
      0
    );
  } finally {
    await remove();
  }
});
