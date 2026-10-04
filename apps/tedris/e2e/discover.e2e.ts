import { expect, type Page, test } from "@playwright/test";
import { type DiscoverFixture, seedDiscover } from "./discover-seed";

/**
 * Designs tedris/02 (Keşfet), tedris/04 (köşk page) and tedris/20 (Derslerim)
 * against the running app and API (MDRS-159). All three are behind the sign-in
 * middleware, so the specs sign in through Keycloak as the `e2e-talebe` user:
 * E2E_TALEBE_EMAIL, E2E_TALEBE_PASSWORD and E2E_TALEBE_SUB, skipped when they
 * are unset. The deck-block spec needs a second account that belongs to none of
 * the fixture's köşks: E2E_OTHER_EMAIL and E2E_OTHER_PASSWORD.
 *
 * Every name carries a random tag, and each spec scopes itself with `?q=<tag>`
 * (or goes straight to the fixture's ids), so what is already in the database
 * does not change a count.
 */
let fx: DiscoverFixture;
const talebe = {
  email: process.env.E2E_TALEBE_EMAIL,
  password: process.env.E2E_TALEBE_PASSWORD,
  sub: process.env.E2E_TALEBE_SUB,
};
const other = {
  email: process.env.E2E_OTHER_EMAIL,
  password: process.env.E2E_OTHER_PASSWORD,
};

test.beforeAll(async () => {
  fx = await seedDiscover();
  if (talebe.sub) await fx.seedTalebe(talebe.sub);
});

test.afterAll(async () => {
  await fx?.remove();
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

const needsTalebe = () =>
  test.skip(
    !(talebe.email && talebe.password && talebe.sub),
    "no Keycloak talebe in the environment"
  );

const card = (page: Page, title: string) =>
  page.locator(".mds-card").filter({ hasText: title }).first();

// Keşfet is open to a visitor since MDRS-160 (anonymous.e2e.ts); Derslerim is
// the talebe's own.
test("sends a signed-out visitor of Derslerim to sign in", async ({ page }) => {
  await page.goto("/tr/my-courses");
  await expect(page).toHaveURL(/signin/);
});

test.describe("Keşfet", () => {
  test.beforeEach(async ({ page }) => {
    needsTalebe();
    await signIn(page, talebe);
  });

  test("lists the köşks and the medreses under their own headings, with the count line", async ({
    page,
  }) => {
    await page.goto(`/tr/discover?q=${fx.tag}`);
    const main = page.getByRole("main");
    await expect(
      main.getByRole("heading", { level: 1, name: "Keşfet" })
    ).toBeVisible();
    await expect(main.getByText("3 köşk ve 2 medrese")).toBeVisible();
    await expect(
      main.getByRole("heading", { level: 2, name: "Köşkler" })
    ).toBeVisible();
    await expect(
      main.getByRole("heading", { level: 2, name: "Medreseler" })
    ).toBeVisible();
    for (const k of Object.values(fx.kosks)) {
      await expect(main.getByRole("link", { name: k.name })).toBeVisible();
    }
    const nur = card(page, fx.kosks.nur.name);
    await expect(nur).toContainText("3 ders");
    await expect(nur).not.toContainText(fx.kosks.nur.field);
    await expect(nur).not.toContainText("Başlangıç seviyesi");
    await expect(card(page, fx.kosks.fatih.name)).not.toContainText(
      "Orta seviye"
    );
  });

  test("shows a medrese's başmüderris and courses, and says so when it has none", async ({
    page,
  }) => {
    await page.goto(`/tr/discover?q=${fx.tag}`);
    const suleymaniye = card(page, fx.madrasahs.suleymaniye.name);
    await expect(suleymaniye).toContainText(
      `Başmüderris ${fx.madrasahs.suleymaniye.headName}`
    );
    await expect(
      suleymaniye.getByRole("link", { name: fx.courses.bina.title })
    ).toBeVisible();
    await expect(
      suleymaniye.getByRole("link", { name: fx.courses.isagoji.title })
    ).toBeVisible();
    await expect(suleymaniye).toContainText("2 ders");
    await expect(card(page, fx.madrasahs.zeyrek.name)).toContainText(
      "Bu medrese henüz ders açmadı."
    );
  });

  test("leaves a draft out of the course count and an unlisted köşk out of the list", async ({
    page,
  }) => {
    await page.goto(`/tr/discover?q=${fx.tag}`);
    await expect(card(page, fx.kosks.nur.name)).toContainText("3 ders");
    await expect(page.getByText(fx.courses.draft.title)).toHaveCount(0);
  });

  test("has no level select and no alan chips: a köşk is not filtered by them (MDRS-252)", async ({
    page,
  }) => {
    await page.goto(`/tr/discover?q=${fx.tag}`);
    await expect(page.getByRole("combobox", { name: "Medrese" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Seviye" })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: fx.kosks.fatih.field, exact: true })
    ).toHaveCount(0);
    await page.goto(`/tr/discover?q=${fx.tag}&level=INTERMEDIATE`);
    await expect(
      page.getByRole("main").getByText("3 köşk ve 2 medrese")
    ).toBeVisible();
  });

  test("a medrese chosen in the select keeps the köşks it hosts courses in", async ({
    page,
  }) => {
    await page.goto(`/tr/discover?q=${fx.tag}`);
    await page.getByRole("combobox", { name: "Medrese" }).click();
    await page
      .getByRole("option", { name: fx.madrasahs.zeyrek.name, exact: true })
      .click();
    await expect(page).toHaveURL(/madrasah=/);
    await expect(
      page.getByRole("main").getByText("0 köşk ve 1 medrese")
    ).toBeVisible();
  });

  test("a search that matches nothing says '0 köşk ve 0 medrese' and can be cleared", async ({
    page,
  }) => {
    await page.goto(`/tr/discover?q=yok-${fx.tag}`);
    const main = page.getByRole("main");
    await expect(main.getByText("0 köşk ve 0 medrese")).toBeVisible();
    await expect(
      main.getByText("Bu aramaya uyan köşk ya da medrese yok.")
    ).toBeVisible();
    await main.getByRole("link", { name: "Filtreleri temizle" }).click();
    await expect(page).not.toHaveURL(/q=/);
  });

  test("typing in the search filters after a pause", async ({ page }) => {
    await page.goto("/tr/discover");
    await page
      .getByRole("searchbox", { name: "Köşk ya da medrese ara" })
      .fill(fx.kosks.beyazit.name);
    await expect(page).toHaveURL(/q=/);
    await expect(
      page.getByRole("main").getByText(/^1 köşk ve \d+ medrese$/)
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByRole("link", { name: fx.kosks.beyazit.name })
    ).toBeVisible();
  });

  test("'Takip et' turns into 'Takip ediliyor' and stays so after a reload", async ({
    page,
  }) => {
    await page.goto(`/tr/discover?q=${fx.tag}`);
    const beyazit = card(page, fx.kosks.beyazit.name);
    const nur = card(page, fx.kosks.nur.name);
    await expect(
      nur.getByRole("button", { name: /^Takip ediliyor/ })
    ).toBeVisible();
    await beyazit.getByRole("button", { name: /^Takip et:/ }).click();
    await expect(
      beyazit.getByRole("button", { name: /^Takip ediliyor/ })
    ).toBeVisible();
    await page.reload();
    await expect(
      card(page, fx.kosks.beyazit.name).getByRole("button", {
        name: /^Takip ediliyor/,
      })
    ).toBeVisible();
    // and back, so the next spec starts from the seeded state
    await card(page, fx.kosks.beyazit.name)
      .getByRole("button", { name: /^Takip ediliyor/ })
      .click();
    await expect(
      card(page, fx.kosks.beyazit.name).getByRole("button", {
        name: /^Takip et:/,
      })
    ).toBeVisible();
  });

  test("the köşk card leads to the köşk, the medrese card to the medrese", async ({
    page,
  }) => {
    await page.goto(`/tr/discover?q=${fx.tag}`);
    await page
      .getByRole("main")
      .getByRole("link", { name: fx.kosks.fatih.name })
      .click();
    await expect(page).toHaveURL(new RegExp(`/kosks/${fx.kosks.fatih.id}$`));
    await page.goBack();
    await page
      .getByRole("main")
      .getByRole("link", { name: fx.madrasahs.zeyrek.name })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/madrasahs/${fx.madrasahs.zeyrek.id}$`)
    );
  });

  test("pages the köşks 12 at a time and keeps the filter in the pager", async ({
    page,
  }) => {
    await page.goto(`/tr/discover?q=${fx.pageTag}`);
    const main = page.getByRole("main");
    await expect(main.getByText("13 köşk ve 0 medrese")).toBeVisible();
    await expect(main.locator(".mds-card--interactive")).toHaveCount(12);
    await main.getByRole("link", { name: "Sonraki" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page).toHaveURL(new RegExp(`q=${fx.pageTag}`));
    await expect(main.locator(".mds-card--interactive")).toHaveCount(1);
    await expect(main.getByText("2 / 2")).toBeVisible();
  });

  test("ends with the way to ask for a köşk", async ({ page }) => {
    await page.goto(`/tr/discover?q=${fx.tag}`);
    await expect(
      page
        .getByRole("main")
        .getByText(
          "Bir ilim için köşk açılmasını istiyorsan başvurabilirsin; başvurunu Medaris yönetimi değerlendirir."
        )
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Köşk açma başvurusu" })
    ).toBeVisible();
  });

  test("the old addresses land on the new ones", async ({ page }) => {
    await page.goto("/tr/learning");
    await expect(page).toHaveURL(/\/tr\/discover$/);
    await page.goto("/tr/learning/my-courses");
    await expect(page).toHaveURL(/\/tr\/my-courses$/);
  });
});

test.describe("the köşk page", () => {
  const koskPath = () => `/tr/kosks/${fx.kosks.nur.id}`;

  test.beforeEach(async ({ page }) => {
    needsTalebe();
    await signIn(page, talebe);
  });

  test("shows the köşk as the API has it, with its three published courses", async ({
    page,
  }) => {
    await page.goto(koskPath());
    const main = page.getByRole("main");
    await expect(
      main.getByRole("heading", { level: 1, name: fx.kosks.nur.name })
    ).toBeVisible();
    await expect(main.getByText(/Başlangıç seviyesi/)).toHaveCount(0);
    await expect(main.locator(".mds-card--interactive")).toHaveCount(4);
    for (const key of ["emsile", "avamil", "bina"] as const) {
      await expect(
        main.getByRole("link", { name: fx.courses[key].title })
      ).toBeVisible();
    }
    // a draft is the manager's, not the talebe's
    await expect(main.getByText(fx.courses.draft.title)).toHaveCount(0);
  });

  test("badges the enrolled courses 'Devam ediyor' and the others not", async ({
    page,
  }) => {
    await page.goto(koskPath());
    await expect(card(page, fx.courses.emsile.title)).toContainText(
      "Devam ediyor"
    );
    await expect(card(page, fx.courses.bina.title)).toContainText(
      "Devam ediyor"
    );
    await expect(card(page, fx.courses.avamil.title)).not.toContainText(
      "Devam ediyor"
    );
  });

  test("names the medrese that opened a course, and the next session", async ({
    page,
  }) => {
    await page.goto(koskPath());
    const bina = card(page, fx.courses.bina.title);
    await expect(
      bina.getByRole("link", { name: fx.madrasahs.suleymaniye.name })
    ).toBeVisible();
    await expect(bina).toContainText("dersi");
    await expect(bina).toContainText(
      `${fx.madrasahs.suleymaniye.headName}, imam`
    );
    await expect(bina).toContainText(
      /Sonraki celse (Paz|Pzt|Sal|Çar|Per|Cum|Cmt) \d{2}:\d{2}/
    );
    await expect(card(page, fx.courses.avamil.title)).toContainText(
      "Planlı celse yok"
    );
  });

  test("shows the köşk's decks to its own talebe, with the collection mark", async ({
    page,
  }) => {
    await page.goto(koskPath());
    const main = page.getByRole("main");
    await expect(
      main.getByRole("heading", { level: 2, name: "Köşk desteleri" })
    ).toBeVisible();
    const deck = card(page, fx.deckTitle);
    await expect(deck).toContainText("Köşk destesi");
    await expect(deck).toContainText("3 ezber kartı");
    await expect(deck).toContainText("Koleksiyonunda");
  });

  test("the follow state is kept after a reload", async ({ page }) => {
    await page.goto(`/tr/kosks/${fx.kosks.fatih.id}`);
    const follow = page.getByRole("button", { name: /^Takip et:/ });
    await follow.click();
    await expect(
      page.getByRole("button", { name: /^Takip ediliyor/ })
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: /^Takip ediliyor/ })
    ).toBeVisible();
    await page.getByRole("button", { name: /^Takip ediliyor/ }).click();
    await expect(
      page.getByRole("button", { name: /^Takip et:/ })
    ).toBeVisible();
  });

  test("an unknown köşk answers 404 with the not-found state", async ({
    page,
  }) => {
    const response = await page.goto(
      "/tr/kosks/a0000000-0000-4000-8000-0000000000ff"
    );
    expect(response?.status()).toBe(404);
    await expect(page.getByText("Sayfa bulunamadı")).toBeVisible();
  });
});

test.describe("the köşk page for someone the köşk does not know", () => {
  test("leaves the deck block out", async ({ page }) => {
    test.skip(
      !(other.email && other.password),
      "no second Keycloak account in the environment"
    );
    await signIn(page, other);
    await page.goto(`/tr/kosks/${fx.kosks.nur.id}`);
    await expect(
      page.getByRole("heading", { level: 1, name: fx.kosks.nur.name })
    ).toBeVisible();
    await expect(page.getByText("Köşk desteleri")).toHaveCount(0);
    await expect(page.getByText(fx.courses.draft.title)).toHaveCount(0);
  });
});

test.describe("Derslerim", () => {
  test.beforeEach(async ({ page }) => {
    needsTalebe();
    await signIn(page, talebe);
  });

  const section = (page: Page, name: string) =>
    page.locator("section").filter({
      has: page.getByRole("heading", { level: 2, name }),
    });

  test("puts each course in the section its status names", async ({ page }) => {
    await page.goto("/tr/my-courses");
    const ongoing = section(page, "Devam eden dersler");
    const applications = section(page, "Başvurularım");
    const completed = section(page, "Tamamladığın dersler");
    for (const key of ["emsile", "bina", "siyer"] as const) {
      await expect(
        ongoing.getByRole("link", { name: fx.courses[key].title })
      ).toBeVisible();
    }
    await expect(
      applications.getByRole("link", { name: fx.courses.isagoji.title })
    ).toBeVisible();
    await expect(
      completed.getByRole("link", { name: fx.courses.tecvid.title })
    ).toBeVisible();
    await expect(
      ongoing.getByRole("link", { name: fx.courses.isagoji.title })
    ).toHaveCount(0);
  });

  test("the counters agree with the lists", async ({ page }) => {
    await page.goto("/tr/my-courses");
    const ongoing = section(page, "Devam eden dersler");
    const count = Number(
      (await ongoing.locator(".mds-caption").first().textContent())?.match(
        /^(\d+) ders$/
      )?.[1]
    );
    expect(count).toBeGreaterThanOrEqual(3);
    await expect(ongoing.locator(".mds-card--interactive")).toHaveCount(count);
    const applications = section(page, "Başvurularım");
    const waiting = Number(
      (await applications.locator(".mds-caption").first().textContent())?.match(
        /^(\d+) başvuru onay bekliyor$/
      )?.[1]
    );
    await expect(applications.locator("li")).toHaveCount(waiting);
  });

  test("draws the progress as a named progress bar and the next session with its week", async ({
    page,
  }) => {
    await page.goto("/tr/my-courses");
    const emsile = card(page, fx.courses.emsile.title);
    const bar = emsile.getByRole("progressbar", { name: "İlerlemen" });
    await expect(bar).toHaveAttribute("aria-valuenow", "40");
    await expect(emsile).toContainText("%40");
    await expect(emsile).toContainText(/Sıradaki celse/);
    await expect(emsile).toContainText("Hafta 5");
    await expect(
      card(page, fx.courses.bina.title).getByRole("progressbar")
    ).toHaveAttribute("aria-valuenow", "15");
  });

  test("writes the application date and the completion date", async ({
    page,
  }) => {
    await page.goto("/tr/my-courses");
    await expect(
      page
        .getByText(
          "Başvurdun: 28 Eylül 2026. Onaylanınca ders, devam eden derslerine geçer."
        )
        .first()
    ).toBeVisible();
    await expect(
      page.getByText(
        "Ders kadrosu 26 Eylül 2026 tarihinde tamamladığını onayladı."
      )
    ).toBeVisible();
    await expect(
      section(page, "Tamamladığın dersler").getByText("Tamamlandı")
    ).toBeVisible();
  });

  test("a card leads to the course, 'Takvim aboneliği' to the subscription page", async ({
    page,
  }) => {
    await page.goto("/tr/my-courses");
    await page
      .getByRole("link", { name: fx.courses.emsile.title })
      .first()
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/courses/${fx.courses.emsile.id}$`)
    );
    await page.goto("/tr/my-courses");
    await page.getByRole("link", { name: "Takvim aboneliği" }).click();
    await expect(page).toHaveURL(/\/learning\/calendar$/);
  });

  test("withdrawing a request takes it off the list at once, and it stays off", async ({
    page,
  }) => {
    await page.goto("/tr/my-courses");
    const applications = section(page, "Başvurularım");
    const row = applications.locator("li").filter({
      hasText: fx.courses.isagoji.title,
    });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: /^Başvuruyu geri çek/ }).click();
    await expect(row).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("link", { name: fx.courses.isagoji.title })
    ).toHaveCount(0);
  });
});
