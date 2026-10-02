import { expect, type Page, test } from "@playwright/test";
import { type ShellFixture, seedShell } from "./shell-seed";

/**
 * Designs nizam/03 (Yönetim yetkiniz yok), nizam/31 and 57 (Başvurular,
 * Talebeler), nizam/50, 51 and 52 (the phone menus) and medaris/16's nizam side
 * (Çıkış yapılsın mı?) against the running app and API, with real Keycloak
 * sign-ins (MDRS-168). A spec whose account is not in the environment
 * (E2E_<ROLE>_EMAIL, _PASSWORD, _SUB) is skipped.
 */
const account = (role: string) => ({
  email: process.env[`E2E_${role}_EMAIL`],
  password: process.env[`E2E_${role}_PASSWORD`],
  sub: process.env[`E2E_${role}_SUB`],
});
const TALEBE = account("TALEBE");
const KOSK_NAZIM = account("KOSK_NAZIM");
const MEDARIS_NAZIM = account("MEDARIS_NAZIM");
const SYSTEM_ADMIN = account("SYSTEM_ADMIN");

const seedable = Boolean(KOSK_NAZIM.sub && KOSK_NAZIM.password);
let fixture: ShellFixture;

test.beforeEach(async ({ browserName: _browser }, info) => {
  if (!seedable || !info.title.includes("[seed]")) return;
  fixture = await seedShell({ nazim: KOSK_NAZIM.sub as string });
});

test.afterEach(async ({ browserName: _browser }, info) => {
  if (info.title.includes("[seed]")) await fixture?.remove();
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

/** The desktop sidebar's nav, and the phone sheet's. */
const sidebar = (page: Page) => page.locator("aside nav");
const sheet = (page: Page) => page.getByRole("dialog", { name: "Ana menü" });

const navTexts = async (nav: ReturnType<typeof sidebar>) =>
  (await nav.locator(".mds-nav-section, .mds-nav-item").allInnerTexts()).map(
    (s) => s.replace(/\s+/g, " ").trim()
  );

test("nizam/03 — an account with no role lands on 'Yönetim yetkiniz yok': no menu, its own e-mail, 'Tedris'e dön'", async ({
  page,
}) => {
  test.skip(!TALEBE.password, "no talebe account");
  await signIn(page, TALEBE);
  await page.goto("/tr");
  await page.waitForURL(/\/tr\/yetki-yok$/);

  const heading = page.getByRole("heading", {
    level: 1,
    name: "Yönetim yetkiniz yok",
  });
  await expect(heading).toBeVisible();
  // the title and the heading say the same, and focus starts on the heading
  await expect(page).toHaveTitle(/Yönetim yetkiniz yok/);
  await expect(heading).toBeFocused();
  await expect(
    page.getByText(
      "Nizam, Medaris’i ve köşkleri yönetenlerin uygulamasıdır. Bu hesaba bir yönetim görevi verilmemiş."
    )
  ).toBeVisible();
  // the sidebar carries the brand and the person only
  await expect(page.locator("aside nav")).toHaveCount(0);
  await expect(page.locator("aside .mds-nav-user")).toContainText("Talebe");
  // the shown address is the session's
  await expect(page.getByText("Giriş yaptığınız hesap:")).toContainText(
    TALEBE.email as string
  );

  // 'Tedris'e dön' goes to Tedris's root
  await page.route("http://localhost:4000/**", (route) =>
    route.fulfill({ status: 200, body: "tedris" })
  );
  await page.getByRole("link", { name: "Tedris’e dön" }).click();
  await page.waitForURL("http://localhost:4000/");
});

test("nizam/03 — signed out, /tr/yetki-yok sends to sign-in, not to the screen", async ({
  page,
}) => {
  await page.goto("/tr/yetki-yok");
  await expect(page).not.toHaveURL(/\/yetki-yok$/);
  await expect(page.locator("#username")).toBeVisible();
});

test("medaris/16 — the person row asks 'Çıkış yapılsın mı?'; Vazgeç keeps the session, Çıkış yap ends it", async ({
  page,
}) => {
  test.skip(!TALEBE.password, "no talebe account");
  await signIn(page, TALEBE);
  await page.goto("/tr/yetki-yok");
  await page.locator("aside .mds-nav-user").click();
  await page.waitForURL(/\/tr\/auth\/signout$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Çıkış yapılsın mı?" })
  ).toBeVisible();
  await expect(
    page.getByText("Bu tarayıcıda Medaris’ten çıkarsın.")
  ).toBeVisible();

  await page.getByRole("button", { name: "Vazgeç" }).click();
  await page.waitForURL(/\/tr\/yetki-yok$/);

  await page.locator("aside .mds-nav-user").click();
  await page.getByRole("button", { name: "Çıkış yap" }).click();
  // Keycloak ends its session and sends the browser back to Nizam's root,
  // where a signed-out visitor is offered the way in
  await expect(page.getByRole("link", { name: "Giriş yap" })).toBeVisible({
    timeout: 20000,
  });
  await page.goto("/tr/yetki-yok");
  await expect(page.locator("#username")).toBeVisible();
});

test("nizam/31 [seed] — Başvurular lists the köşk's waiting applications, filters, searches and counts", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.koskId}/basvurular`);

  await expect(
    page.getByRole("heading", { level: 1, name: "Başvurular" })
  ).toBeVisible();
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(5);
  const count = page.getByTestId("applications-count");
  await expect(count).toHaveText("5 başvuru bekliyor");
  // newest first: the first applicant waited ten minutes
  await expect(rows.first()).toContainText(fixture.applicants[0]?.name ?? "");
  await expect(rows.first()).toContainText(fixture.applicants[0]?.email ?? "");
  await expect(rows.first()).toContainText("Bugün");
  // each button is named by its row
  const first = fixture.applicants[0];
  await expect(
    page.getByRole("button", {
      name: `Onayla: ${first?.name}, ${first?.courseTitle}`,
    })
  ).toBeVisible();

  // the sidebar: the köşk in scope, the page selected, the badge equal to the count
  const nav = sidebar(page);
  await expect(page.locator("aside")).toContainText(fixture.koskName);
  await expect(nav.getByRole("link", { name: /^Başvurular/ })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await expect(nav.getByRole("link", { name: /^Başvurular/ })).toContainText(
    "5"
  );

  // course filter
  const second = fixture.courses[1];
  await page.getByRole("combobox", { name: "Ders süzgeci" }).click();
  await page.getByRole("option", { name: `Ders: ${second?.title}` }).click();
  await expect(rows).toHaveCount(2);
  await expect(count).toHaveText("2 başvuru bekliyor");
  await page.getByRole("combobox", { name: "Ders süzgeci" }).click();
  await page.getByRole("option", { name: "Ders: tümü" }).click();
  await expect(rows).toHaveCount(5);

  // search folds Turkish: "omer" finds Ömer
  await page.getByRole("searchbox", { name: "Başvurularda ara" }).fill("omer");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Ömer Faruk Demirkaya");
  await expect(count).toHaveText("1 başvuru bekliyor");
});

test("nizam/31 [seed] — Onayla enrolls the talebe, Reddet deletes the application; both rows drop and the numbers follow", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.koskId}/basvurular`);
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(5);

  const [approved, rejected] = fixture.applicants as [
    ShellFixture["applicants"][number],
    ShellFixture["applicants"][number],
  ];
  await page
    .getByRole("button", {
      name: `Onayla: ${approved.name}, ${approved.courseTitle}`,
    })
    .click();
  await expect(rows).toHaveCount(4);
  await expect(page.getByText("Başvuru onaylandı")).toBeVisible();
  await expect(page.getByTestId("applications-count")).toHaveText(
    "4 başvuru bekliyor"
  );
  expect(await fixture.status(approved.id, approved.courseId)).toBe("ENROLLED");
  // the sidebar badge follows without a reload
  await expect(
    sidebar(page).getByRole("link", { name: /^Başvurular/ })
  ).toContainText("4");

  await page
    .getByRole("button", {
      name: `Reddet: ${rejected.name}, ${rejected.courseTitle}`,
    })
    .click();
  await expect(rows).toHaveCount(3);
  await expect(page.getByText("Başvuru reddedildi")).toBeVisible();
  expect(await fixture.status(rejected.id, rejected.courseId)).toBeNull();
});

test("nizam/31 [seed] — another köşk's Başvurular is 'Bu bölüm için izniniz yok'", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.otherKoskId}/basvurular`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Bu bölüm için izniniz yok" })
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(0);
});

test("nizam/57 [seed] — a course's Talebeler opens on Başvurular; Onayla moves the talebe to Kayıtlı", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  const course = fixture.courses[0];
  const waiting = fixture.applicants.filter((a) => a.courseId === course?.id);
  await page.goto(`/tr/kosks/${fixture.koskId}/courses/${course?.id}/students`);

  await expect(
    page.getByRole("heading", { level: 1, name: "Talebeler" })
  ).toBeVisible();
  const tabs = page.getByRole("tablist", { name: "Talebe durumu" });
  await expect(tabs.getByRole("tab", { name: /^Başvurular/ })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(tabs.getByRole("tab", { name: /^Başvurular/ })).toContainText(
    String(waiting.length)
  );
  // only this course's applications: the other course's are not here
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(waiting.length);
  for (const a of waiting) await expect(page.getByText(a.email)).toBeVisible();
  const other = fixture.applicants.find((a) => a.courseId !== course?.id);
  await expect(page.getByText(other?.email ?? "x")).toHaveCount(0);
  // the sidebar draws Talebeler selected
  await expect(
    sidebar(page).getByRole("link", { name: /^Talebeler/ })
  ).toHaveAttribute("aria-current", "page");

  const target = waiting[0];
  await page
    .getByRole("button", {
      name: `Onayla: ${target?.name}, ${target?.courseTitle}`,
    })
    .click();
  await expect(rows).toHaveCount(waiting.length - 1);
  await expect(tabs.getByRole("tab", { name: /^Kayıtlı/ })).toContainText("1");
  expect(await fixture.status(target?.id ?? "", course?.id ?? "")).toBe(
    "ENROLLED"
  );
});

test.describe("the phone menus (390 x 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("nizam/52 [seed] — Köşk nazımı: the sheet opens on the head, has the groups of the canvas and no 'Çıkış yap', closes on Esc, on a followed link and at 768", async ({
    page,
  }) => {
    test.skip(!seedable, "no köşk nazım account");
    await signIn(page, KOSK_NAZIM);
    await page.goto(`/tr/kosks/${fixture.koskId}/basvurular`);

    await page.getByRole("button", { name: "Menü" }).click();
    await expect(sheet(page)).toBeVisible();
    // focus opens on the head row: the logo and the close button
    await expect(sheet(page).locator(".mds-sheet__head :focus")).toHaveCount(1);
    await expect(sheet(page)).toContainText(fixture.koskName);
    expect(await navTexts(sheet(page).locator("nav"))).toEqual([
      "GENEL",
      "Ana sayfa",
      "Bildirimler",
      "KÖŞK",
      "Dersler",
      "Celseler",
      "Talebeler",
      expect.stringMatching(/^Başvurular\s*5/) as unknown as string,
      "Ders talepleri",
      "Ders kayıtları",
      "Köşk desteleri",
      "Yasaklamalar",
      "Arşiv",
      "YÖNETİM",
      "İzinler",
      "Köşk ayarları",
    ]);
    // "Çıkış yap" is not in the sheet (canvas rule 18), as text or as a control
    await expect(sheet(page)).not.toContainText(/çıkış/i);
    await expect(sheet(page).getByText("Çıkış yap")).toHaveCount(0);
    await expect(
      sheet(page).getByRole("button", { name: /Çıkış/ })
    ).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(sheet(page)).toBeHidden();

    // a followed link goes there and closes the sheet
    await page.getByRole("button", { name: "Menü" }).click();
    await sheet(page)
      .getByRole("link", { name: /^Arşiv/ })
      .click();
    await page.waitForURL(new RegExp(`/kosks/${fixture.koskId}/arsiv$`));
    await expect(sheet(page)).toBeHidden();

    // widening to 768 closes an open sheet
    await page.getByRole("button", { name: "Menü" }).click();
    await expect(sheet(page)).toBeVisible();
    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(sheet(page)).toBeHidden();
    await expect(page.locator("aside nav")).toBeVisible();
  });

  test("nizam/50 — Medaris başnazımı: the platform's whole menu", async ({
    page,
  }) => {
    test.skip(!SYSTEM_ADMIN.password, "no SYSTEM_ADMIN account");
    await signIn(page, SYSTEM_ADMIN);
    await page.goto("/tr");
    await page.getByRole("button", { name: "Menü" }).click();
    expect(await navTexts(sheet(page).locator("nav"))).toEqual([
      "GENEL",
      "Ana sayfa",
      "Bildirimler",
      "PLATFORM",
      "Medreseler",
      "Köşkler",
      "Medaris nazımları",
      "İzin grupları",
      "Pasif kapsamlar",
      "TALEPLER",
      "Köşk başvuruları",
      "Deste yayın istekleri",
      "İtirazlar",
      "Kalıcı yasak talepleri",
      "DENETİM",
      "Yasaklamalar",
      "Denetim kaydı",
      "Arşiv",
      "AYARLAR",
      "YouTube bağlantısı",
      "Platform ayarları",
    ]);
    await expect(sheet(page)).toContainText("Medaris başnazımı");
    // the platform has no scope to pick
    await expect(sheet(page)).not.toContainText("Köşk değiştir");
  });

  test("nizam/51 — Medaris nazımı: the same menu without the başnazım's", async ({
    page,
  }) => {
    test.skip(!MEDARIS_NAZIM.password, "no Medaris nazımı account");
    await signIn(page, MEDARIS_NAZIM);
    await page.goto("/tr");
    await page.getByRole("button", { name: "Menü" }).click();
    expect(await navTexts(sheet(page).locator("nav"))).toEqual([
      "GENEL",
      "Ana sayfa",
      "Bildirimler",
      "PLATFORM",
      "Medreseler",
      "Köşkler",
      "TALEPLER",
      "Köşk başvuruları",
      "Deste yayın istekleri",
      "Kalıcı yasak talepleri",
      "DENETİM",
      "Yasaklamalar",
    ]);
    await expect(sheet(page)).toContainText("Medaris nazımı");
  });
});
