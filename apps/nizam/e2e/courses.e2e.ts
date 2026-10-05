import { expect, type Page, test } from "@playwright/test";
import { type CourseFixture, seedCourses } from "./courses-seed";

/**
 * Designs nizam/32 (Ders aç), nizam/33 (Müderrisleri düzenle), nizam/34 (Ders
 * ayarları), nizam/54 (Müfredat), nizam/55 (Celse planla) and nizam/56
 * (Celseler) against the running app and API, with real Keycloak sign-ins and
 * a real directory lookup (MDRS-176). The accounts come from
 * E2E_<ROLE>_EMAIL, E2E_<ROLE>_PASSWORD, E2E_<ROLE>_SUB; a spec whose account
 * is missing is skipped. The screens are the köşk nazımı's.
 */
const account = (role: string) => ({
  email: process.env[`E2E_${role}_EMAIL`],
  password: process.env[`E2E_${role}_PASSWORD`],
  sub: process.env[`E2E_${role}_SUB`],
});
const KOSK_NAZIM = account("KOSK_NAZIM");
const MUDERRIS = account("MUDERRIS");
const SYSTEM_ADMIN = account("SYSTEM_ADMIN");

const ready = () =>
  Boolean(
    process.env.E2E_DATABASE_URL &&
      KOSK_NAZIM.password &&
      KOSK_NAZIM.sub &&
      MUDERRIS.email &&
      MUDERRIS.sub &&
      SYSTEM_ADMIN.sub
  );

let fixture: CourseFixture;

test.beforeEach(async () => {
  if (!ready()) return;
  fixture = await seedCourses({
    nazim: KOSK_NAZIM.sub as string,
    chief: SYSTEM_ADMIN.sub as string,
    muderris: MUDERRIS.sub as string,
  });
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

/** With E2E_SHOTS=<dir> every screen a spec reaches is also saved as a picture. */
const shot = async (page: Page, name: string) => {
  const dir = process.env.E2E_SHOTS;
  if (dir) {
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  }
};

/** The next `weekday` (ISO, 1 = Monday) at least `minDays` from now, as YYYY-MM-DD. */
const nextWeekday = (weekday: number, minDays: number): string => {
  const d = new Date(Date.now() + minDays * 86_400_000);
  while (((d.getUTCDay() + 6) % 7) + 1 !== weekday) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
};

const addDaysTo = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

const base = () => `/tr/kosks/${fixture.kosk.id}`;
const courseBase = () => `${base()}/courses/${fixture.course.id}`;

test.describe("nizam/32 Ders aç", () => {
  test("criteria 1: a form with nothing in it sends nothing and names what is missing", async ({
    page,
  }) => {
    test.skip(!ready(), "no e2e accounts or database");
    await signIn(page, KOSK_NAZIM);
    await page.goto(`${base()}/courses/new`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Ders aç" })
    ).toBeVisible();
    await shot(page, "32-ders-ac");
    await page.getByRole("button", { name: "Dersi aç" }).click();
    await expect(
      page
        .getByText("Ders adı en az iki harften oluşmalı.")
        .filter({ visible: true })
    ).toBeVisible();
    await expect(
      page.getByText("En az bir müderris seçin.").filter({ visible: true })
    ).toBeVisible();
    await expect(
      page.getByText("Başlangıç tarihini girin.").filter({ visible: true })
    ).toBeVisible();
    await expect(
      page.getByText("En az bir celse günü seçin.").filter({ visible: true })
    ).toBeVisible();
    expect(await fixture.courseByTitle("")).toBeNull();
    await expect(page).toHaveURL(/courses\/new/);
  });

  test("criteria 2–5: one müderris is the imam, the summary counts the sessions, a draft is opened with its sessions", async ({
    page,
  }) => {
    test.skip(!ready(), "no e2e accounts or database");
    const title = `Kâfiye’ye giriş ${fixture.tail}`;
    const start = nextWeekday(1, 10);
    await signIn(page, KOSK_NAZIM);
    await page.goto(`${base()}/courses/new`);
    await page
      .locator('input[name="title"]')
      .filter({ visible: true })
      .fill(title);

    const email = page.getByPlaceholder("ad.soyad@example.com");
    await email.fill(MUDERRIS.email as string);
    await email.press("Enter");
    await expect(
      page.getByTestId("team-list").filter({ visible: true })
    ).toBeVisible();
    await expect(
      page.getByText("Tek müderris dersin imamıdır.").filter({ visible: true })
    ).toBeVisible();

    await page
      .getByLabel("Başlangıç tarihi")
      .filter({ visible: true })
      .fill(start);
    await page.getByRole("spinbutton", { name: /Süre \(hafta\)/ }).fill("2");
    await page.getByRole("button", { name: "Pzt" }).click();
    await expect(
      page.getByTestId("schedule-summary").filter({ visible: true })
    ).toContainText("2 celse planlanacak");
    await shot(page, "32-ders-ac-dolu");

    await page.getByRole("button", { name: "Dersi aç" }).click();
    await page.waitForURL(/\/dersler$/);

    const stored = await fixture.courseByTitle(title);
    expect(stored).not.toBeNull();
    expect(stored?.status).toBe("DRAFT");
    const lessons = await fixture.lessonsOf(stored?.id as string);
    expect(lessons).toHaveLength(2);
    expect(await fixture.muderrisOf(stored?.id as string)).toEqual([
      { userId: MUDERRIS.sub, isImam: true },
    ]);
    await expect(
      page.locator("tbody tr:visible").filter({ hasText: title })
    ).toBeVisible();
  });

  test("criteria 4: 'Hemen yayımla' with a closed course and a cover caption opens it published", async ({
    page,
  }) => {
    test.skip(!ready(), "no e2e accounts or database");
    const title = `Yayında ${fixture.tail}`;
    await signIn(page, KOSK_NAZIM);
    await page.goto(`${base()}/courses/new`);
    await page
      .locator('input[name="title"]')
      .filter({ visible: true })
      .fill(title);
    const email = page.getByPlaceholder("ad.soyad@example.com");
    await email.fill(MUDERRIS.email as string);
    await email.press("Enter");
    await expect(
      page.getByTestId("team-list").filter({ visible: true })
    ).toBeVisible();
    await page
      .getByLabel("Başlangıç tarihi")
      .filter({ visible: true })
      .fill(nextWeekday(2, 10));
    await page.getByRole("button", { name: "Sal" }).click();
    await page.getByRole("checkbox", { name: "Kapalı ders" }).click();
    await page.getByRole("radio", { name: "Hemen yayımla" }).check();
    await page.getByRole("combobox", { name: /Kapak ibaresi/ }).click();
    await page.getByRole("option", { name: "Nahiv" }).click();
    await page.getByRole("button", { name: "Dersi aç" }).click();
    await page.waitForURL(/\/dersler$/);
    const stored = await fixture.courseByTitle(title);
    expect(stored).toMatchObject({
      status: "PUBLISHED",
      isClosed: true,
      coverLabel: "Nahiv",
    });
  });
});

test.describe("nizam/33 Müderrisleri düzenle", () => {
  test("criteria 1–3, 5: the dialog shows the imam, adds a person, moves the imam, and the change is audited", async ({
    page,
  }) => {
    test.skip(!ready(), "no e2e accounts or database");
    await signIn(page, KOSK_NAZIM);
    await page.goto(`${base()}/dersler`);
    const row = page
      .locator("tbody tr:visible")
      .filter({ hasText: fixture.course.title });
    await row.getByRole("button", { name: /Müderrisleri düzenle/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Müderrisleri düzenle" })
    ).toBeVisible();
    await expect(dialog.getByText("E2E Köşk Nazımı")).toBeVisible();
    await expect(
      dialog.getByText("Dersin imamı", { exact: true })
    ).toBeVisible();
    await shot(page, "33-muderrisleri-duzenle");

    const email = dialog.getByPlaceholder("ad.soyad@example.com");
    await email.fill(MUDERRIS.email as string);
    await email.press("Enter");
    await expect(dialog.getByRole("radio")).toHaveCount(2);
    await dialog.getByRole("radio").nth(1).check();
    await dialog.getByRole("button", { name: "Kaydet" }).click();
    await expect(dialog).toBeHidden();

    expect(await fixture.muderrisOf(fixture.course.id)).toEqual(
      expect.arrayContaining([
        { userId: MUDERRIS.sub, isImam: true },
        { userId: KOSK_NAZIM.sub, isImam: false },
      ])
    );
    expect(await fixture.audits("course.muderris_update")).toBe(1);
  });

  test("criteria 4: the list cannot be saved empty", async ({ page }) => {
    test.skip(!ready(), "no e2e accounts or database");
    await signIn(page, KOSK_NAZIM);
    await page.goto(`${base()}/dersler`);
    const row = page
      .locator("tbody tr:visible")
      .filter({ hasText: fixture.course.title });
    await row.getByRole("button", { name: /Müderrisleri düzenle/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /listeden çıkar/ }).click();
    await expect(dialog.getByText("En az bir müderris olmalı.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Kaydet" })).toBeDisabled();
  });
});

test.describe("nizam/34 Ders ayarları", () => {
  test("criteria 1–2: the page opens with the course's values and saves approval and closed", async ({
    page,
  }) => {
    test.skip(!ready(), "no e2e accounts or database");
    await signIn(page, KOSK_NAZIM);
    await page.goto(`${courseBase()}/ayarlar`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Ders ayarları" })
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: "Kayıt onayı gereksin" })
    ).toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: "Kapalı ders" })
    ).not.toBeChecked();
    await shot(page, "34-ders-ayarlari");

    await page.getByRole("checkbox", { name: "Kayıt onayı gereksin" }).click();
    await page.getByRole("checkbox", { name: "Kapalı ders" }).click();
    await page.getByRole("button", { name: "Kaydet" }).click();
    await expect(
      page.getByText("Ders ayarları kaydedildi").filter({ visible: true })
    ).toBeVisible();
    const stored = await fixture.courseByTitle(fixture.course.title);
    expect(stored).toMatchObject({ requiresApproval: false, isClosed: true });
  });

  test("criteria 3: 'Taslağa çek' makes the course a draft, and it can be published again", async ({
    page,
  }) => {
    test.skip(!ready(), "no e2e accounts or database");
    await signIn(page, KOSK_NAZIM);
    await page.goto(`${courseBase()}/ayarlar`);
    await page.getByRole("button", { name: "Taslağa çek" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Taslağa çek" })
      .click();
    await expect(
      page.getByText("Ders taslağa çekildi").filter({ visible: true })
    ).toBeVisible();
    expect((await fixture.courseByTitle(fixture.course.title))?.status).toBe(
      "DRAFT"
    );
    await page.getByRole("button", { name: "Yayımla" }).click();
    await expect(
      page.getByText("Ders yayımlandı").filter({ visible: true })
    ).toBeVisible();
    expect((await fixture.courseByTitle(fixture.course.title))?.status).toBe(
      "PUBLISHED"
    );
  });

  test("criteria 4: 'Dersi gizle' moves the course to the Arşiv", async ({
    page,
  }) => {
    test.skip(!ready(), "no e2e accounts or database");
    await signIn(page, KOSK_NAZIM);
    await page.goto(`${courseBase()}/ayarlar`);
    await page.getByRole("button", { name: "Dersi gizle" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Gizle" })
      .click();
    await page.waitForURL(/\/dersler$/);
    expect((await fixture.courseByTitle(fixture.course.title))?.archived).toBe(
      true
    );
  });

  test("criteria 5: the time zone is saved and the sample session is chosen", async ({
    page,
  }) => {
    test.skip(!ready(), "no e2e accounts or database");
    await signIn(page, KOSK_NAZIM);
    await page.goto(`${courseBase()}/ayarlar`);
    await page.getByRole("combobox", { name: "Saat dilimi" }).click();
    await page.getByRole("option", { name: "Berlin" }).click();
    await page.getByRole("combobox", { name: "Örnek ders" }).click();
    await page.getByRole("option", { name: /Bağlantılı celse/ }).click();
    await page.getByRole("button", { name: "Kaydet" }).click();
    await expect(
      page.getByText("Ders ayarları kaydedildi").filter({ visible: true })
    ).toBeVisible();
    const stored = await fixture.courseByTitle(fixture.course.title);
    expect(stored?.timeZone).toBe("Europe/Berlin");
    const preview = (await fixture.lessonsOf(fixture.course.id)).find(
      (l) => l.title === "Bağlantılı celse"
    );
    expect(preview).toBeTruthy();
  });
});

test.describe("nizam/54 Müfredat", () => {
  test("criteria 1–2: a changed title shows the strip, Vazgeç puts it back, Kaydet keeps it across a reload", async ({
    page,
  }) => {
    test.skip(!ready(), "no e2e accounts or database");
    await signIn(page, KOSK_NAZIM);
    await page.goto(`${courseBase()}/curriculum`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Müfredat" })
    ).toBeVisible();
    await expect(
      page.getByText("Kaydedilmemiş değişiklikler var")
    ).toBeHidden();
    await shot(page, "54-mufredat");

    const title = page.locator('input[name="lesson-1-0-title"]:visible');
    await expect(title).toHaveValue("Bağlantılı celse");
    await title.fill("Bağlantılı celse (düzeltildi)");
    await expect(
      page
        .getByText("Kaydedilmemiş değişiklikler var")
        .filter({ visible: true })
    ).toBeVisible();
    await page.getByRole("button", { name: "Vazgeç" }).first().click();
    await expect(title).toHaveValue("Bağlantılı celse");

    await title.fill("Bağlantılı celse (düzeltildi)");
    await page.getByRole("button", { name: "Kaydet" }).first().click();
    await expect(
      page.getByText("Müfredat kaydedildi").filter({ visible: true })
    ).toBeVisible();
    await page.reload();
    await expect(
      page.locator('input[name="lesson-1-0-title"]:visible')
    ).toHaveValue("Bağlantılı celse (düzeltildi)");
    expect(
      (await fixture.lessonsOf(fixture.course.id)).map((l) => l.title)
    ).toContain("Bağlantılı celse (düzeltildi)");
  });

  test("criteria 3: an empty required field or an http link stops Kaydet", async ({
    page,
  }) => {
    test.skip(!ready(), "no e2e accounts or database");
    await signIn(page, KOSK_NAZIM);
    await page.goto(`${courseBase()}/curriculum`);
    const url = page.locator('input[name="lesson-1-1-url"]:visible');
    await url.fill("http://zoom.us/j/81234567890");
    await page.locator('input[name="lesson-1-1-title"]:visible').fill("");
    await page.getByRole("button", { name: "Kaydet" }).first().click();
    await expect(
      page.getByText("Celse başlığını yazın.").filter({ visible: true })
    ).toBeVisible();
    await expect(
      page
        .getByText(
          "Toplantı bağlantısı https:// ile başlamalı. Bağlantıyı platformdan yeniden kopyalayın."
        )
        .filter({ visible: true })
    ).toBeVisible();
    const lessons = await fixture.lessonsOf(fixture.course.id);
    expect(
      lessons.find((l) => l.title === "Bağlantısız celse")?.meetingUrl
    ).toBeNull();
  });

  test("criteria 4: 'Haftayı kopyala' adds the week again seven days later and Kaydet keeps it", async ({
    page,
  }) => {
    test.skip(!ready(), "no e2e accounts or database");
    await signIn(page, KOSK_NAZIM);
    await page.goto(`${courseBase()}/curriculum`);
    const before = await fixture.lessonsOf(fixture.course.id);
    await page.getByRole("button", { name: "Haftayı kopyala" }).first().click();
    await page.getByRole("button", { name: "Kaydet" }).first().click();
    await expect(
      page.getByText("Müfredat kaydedildi").filter({ visible: true })
    ).toBeVisible();
    const after = await fixture.lessonsOf(fixture.course.id);
    expect(after.length).toBeGreaterThan(before.length);
    const copied = after.filter((l) => l.weekNumber === 6);
    expect(copied.length).toBeGreaterThan(0);
    const source = before.find((l) => l.title === copied[0]?.title);
    expect(
      Math.round(
        (new Date(copied[0]?.scheduledAt as Date).getTime() -
          new Date(source?.scheduledAt as Date).getTime()) /
          86_400_000
      )
    ).toBe(7);
  });

  test("criteria 5: a hidden session is gone from the course after Kaydet", async ({
    page,
  }) => {
    test.skip(!ready(), "no e2e accounts or database");
    await signIn(page, KOSK_NAZIM);
    await page.goto(`${courseBase()}/curriculum`);
    await page
      .getByTestId("lesson-1-1")
      .getByRole("button", { name: "Gizle" })
      .click();
    await page.getByRole("button", { name: "Kaydet" }).first().click();
    await expect(
      page.getByText("Müfredat kaydedildi").filter({ visible: true })
    ).toBeVisible();
    const lessons = await fixture.lessonsOf(fixture.course.id);
    expect(lessons.find((l) => l.title === "Bağlantısız celse")?.archived).toBe(
      true
    );
  });
});

test.describe("nizam/55 Celse planla", () => {
  test("criteria 1, 3, 5: three Fridays are previewed, created in their weeks, and nothing is sent while a field is missing", async ({
    page,
  }) => {
    test.skip(!ready(), "no e2e accounts or database");
    const first = nextWeekday(5, 20);
    await signIn(page, KOSK_NAZIM);
    await page.goto(`${courseBase()}/sessions/new`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Celse planla" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /celse oluştur/ })
    ).toBeDisabled();

    await page.getByRole("button", { name: "Cum" }).click();
    await page
      .getByLabel("Başlangıç tarihi")
      .filter({ visible: true })
      .fill(first);
    await page
      .getByLabel("Bitiş tarihi")
      .filter({ visible: true })
      .fill(addDaysTo(first, 14));
    await expect(
      page.getByTestId("plan-preview").filter({ visible: true })
    ).toContainText("3 celse");
    await shot(page, "55-celse-planla");

    const before = await fixture.lessonsOf(fixture.course.id);
    await page.getByRole("button", { name: "3 celse oluştur" }).click();
    await page.waitForURL(/\/sessions$/);
    const after = await fixture.lessonsOf(fixture.course.id);
    expect(after.length - before.length).toBe(3);
    const created = after.filter((l) => l.title === "Haftanın tekrarı");
    expect(created).toHaveLength(3);
    expect(created.every((l) => l.meetingUrl === null)).toBe(true);
  });

  test("criteria 2, 4: 'after N sessions' stops at N and the link goes to the first session only", async ({
    page,
  }) => {
    test.skip(!ready(), "no e2e accounts or database");
    const first = nextWeekday(3, 20);
    await signIn(page, KOSK_NAZIM);
    await page.goto(`${courseBase()}/sessions/new`);
    await page.getByRole("button", { name: "Çar" }).click();
    await page
      .getByLabel("Başlangıç tarihi")
      .filter({ visible: true })
      .fill(first);
    await page
      .getByRole("radio", { name: "Belirli sayıda celseden sonra" })
      .check();
    await page.getByLabel("Celse sayısı").filter({ visible: true }).fill("2");
    await expect(
      page.getByTestId("plan-preview").filter({ visible: true })
    ).toContainText("2 celse");
    await page.getByRole("radio", { name: "Yalnız ilk celseye ekle" }).check();
    await page
      .getByLabel("İlk celsenin bağlantısı")
      .fill("https://meet.google.com/abc-defg-hij");
    await page.getByRole("button", { name: "2 celse oluştur" }).click();
    await page.waitForURL(/\/sessions$/);
    const created = (await fixture.lessonsOf(fixture.course.id)).filter(
      (l) => l.title === "Haftanın tekrarı"
    );
    expect(created).toHaveLength(2);
    expect(created[0]?.meetingUrl).toBe("https://meet.google.com/abc-defg-hij");
    expect(created[1]?.meetingUrl).toBeNull();
  });
});

test.describe("nizam/56 Celseler", () => {
  test("criteria 1: sessions are grouped, counted and ordered", async ({
    page,
  }) => {
    test.skip(!ready(), "no e2e accounts or database");
    await signIn(page, KOSK_NAZIM);
    await page.goto(`${courseBase()}/sessions`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Celseler" })
    ).toBeVisible();
    await shot(page, "56-celseler");
    await expect(
      page.getByTestId("upcoming-counts").filter({ visible: true })
    ).toContainText("4 celse · 1 iptal edildi · Hafta 5");
    const upcoming = page.getByRole("table", { name: "Yaklaşan celseler" });
    const titles = await upcoming.locator("tbody th").allInnerTexts();
    expect(titles.map((t) => t.split("\n")[0])).toEqual([
      "Bağlantılı celse",
      "Bağlantısız celse",
      "İptal edilen celse",
      "Uzak celse",
    ]);
    await expect(
      page.getByRole("table", { name: "Geçmiş celseler" })
    ).toContainText("Geçmiş celse");
  });

  test("criteria 2: a link is added, shows its platform, and an http link is refused", async ({
    page,
  }) => {
    test.skip(!ready(), "no e2e accounts or database");
    await signIn(page, KOSK_NAZIM);
    await page.goto(`${courseBase()}/sessions`);
    const row = page
      .locator("tbody tr:visible")
      .filter({ hasText: "Bağlantısız celse" });
    await row.getByRole("button", { name: "Bağlantı ekle" }).click();
    const input = page
      .getByLabel("Toplantı bağlantısı")
      .filter({ visible: true });
    await input.fill("http://zoom.us/j/81234567890");
    await page.getByRole("button", { name: "Kaydet" }).click();
    await expect(
      page
        .getByText("Toplantı bağlantısı https:// ile başlamalı.")
        .filter({ visible: true })
    ).toBeVisible();
    await input.fill("https://zoom.us/j/82907461385");
    await page.getByRole("button", { name: "Kaydet" }).click();
    await expect(
      page.getByText("Bağlantı kaydedildi").filter({ visible: true })
    ).toBeVisible();
    await expect(
      page
        .locator("tbody tr:visible")
        .filter({ hasText: "Bağlantısız celse" })
        .getByText("Zoom")
    ).toBeVisible();
    expect(
      (await fixture.lessonsOf(fixture.course.id)).find(
        (l) => l.title === "Bağlantısız celse"
      )?.meetingUrl
    ).toBe("https://zoom.us/j/82907461385");
  });

  test("criteria 3: 'İptal et' marks the session cancelled, hides its link and leaves it no action", async ({
    page,
  }) => {
    test.skip(!ready(), "no e2e accounts or database");
    await signIn(page, KOSK_NAZIM);
    await page.goto(`${courseBase()}/sessions`);
    const row = () =>
      page.locator("tbody tr:visible").filter({ hasText: "Uzak celse" });
    await row()
      .getByRole("button", { name: /celsesini iptal et/ })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Celseyi iptal et" })
      .click();
    await expect(
      page
        .getByText("Celse iptal edildi", { exact: true })
        .filter({ visible: true })
    ).toBeVisible();
    await expect(row()).toContainText("İptal edildi");
    await expect(row()).toContainText("İşlem yok");
    const stored = (await fixture.lessonsOf(fixture.course.id)).find(
      (l) => l.title === "Uzak celse"
    );
    expect(stored?.cancelledAt).not.toBeNull();
    expect(await fixture.audits("lesson.cancel")).toBe(1);
  });

  test("criteria 4: a date can be changed", async ({ page }) => {
    test.skip(!ready(), "no e2e accounts or database");
    await signIn(page, KOSK_NAZIM);
    await page.goto(`${courseBase()}/sessions`);
    const row = page
      .locator("tbody tr:visible")
      .filter({ hasText: "Bağlantısız celse" });
    await row.getByRole("button", { name: /tarihini değiştir/ }).click();
    const date = nextWeekday(4, 30);
    await page.locator('input[name="date"]:visible').fill(date);
    await page.locator('input[name="time"]:visible').fill("20:30");
    await page.getByRole("button", { name: "Kaydet" }).click();
    await expect(
      page.getByText("Celse zamanı değişti").filter({ visible: true })
    ).toBeVisible();
    const moved = (await fixture.lessonsOf(fixture.course.id)).find(
      (l) => l.title === "Bağlantısız celse"
    );
    expect(moved?.scheduledAt?.toISOString()).toBe(`${date}T17:30:00.000Z`);
  });
});

test("a caller who is not on the course gets the no-access screen", async ({
  page,
}) => {
  test.skip(!ready(), "no e2e accounts or database");
  const talebe = account("TALEBE");
  test.skip(!talebe.password, "no TALEBE account");
  await signIn(page, talebe);
  // let the sign-in land first: a navigation that starts while the home page is
  // still sending a talebe on to 'Yönetim yetkiniz yok' comes back without a response
  await page.waitForURL(/\/tr\/yetki-yok$/);
  const res = await page.goto(`${courseBase()}/ayarlar`);
  expect(res?.status()).toBe(403);
});
