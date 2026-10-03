import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { type DiscoverFixture, seedDiscover } from "./discover-seed";
import { pgClient } from "./pg-client";

/**
 * Designs tedris/09 (Keşfet), 10 (köşk page), 11 (medrese page) and 45 (phone
 * menu) for a visitor with no account (MDRS-160), against the running app and
 * API. Nothing here signs in: every context is cookie-less, and "giriş yap" is
 * followed only as far as Keycloak's own URL.
 *
 * `E2E_API_BASE_URL` (default http://localhost:3001) is tedrisat, for the specs
 * that read the API's answer itself.
 */
const api = process.env.E2E_API_BASE_URL ?? "http://localhost:3001";

let fx: DiscoverFixture;
const managerId = randomUUID();
const managerName = "Abdülhamit Karaosmanoğlu";

test.beforeAll(async () => {
  fx = await seedDiscover();
  const client = await pgClient();
  try {
    await client.query(
      "insert into users(id, given_name, family_name) values ($1, 'Abdülhamit', 'Karaosmanoğlu')",
      [managerId]
    );
    await client.query(
      "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by) values ($1, 'KOSK_NAZIM', 'kosk', $2, $1)",
      [managerId, fx.kosks.nur.id]
    );
  } finally {
    await client.end();
  }
});

test.afterAll(async () => {
  const client = await pgClient();
  try {
    await client.query("delete from role_assignments where user_id = $1", [
      managerId,
    ]);
    await client.query("delete from users where id = $1", [managerId]);
  } finally {
    await client.end();
  }
  await fx?.remove();
});

const toKeycloak = /\/realms\//;

test.describe("Keşfet (tedris/09)", () => {
  test("opens with no account and lists the köşks without a follow button", async ({
    page,
  }) => {
    const response = await page.goto(`/tr/discover?q=${fx.tag}`);
    expect(response?.status()).toBe(200);
    await expect(page).not.toHaveURL(/signin/);
    const main = page.getByRole("main");
    await expect(
      main.getByRole("heading", { level: 1, name: "Keşfet" })
    ).toBeVisible();
    await expect(main.getByText(fx.kosks.nur.name)).toBeVisible();
    await expect(main.getByText(fx.kosks.fatih.name)).toBeVisible();
    await expect(main.getByRole("button", { name: /Takip/ })).toHaveCount(0);
  });

  test("lists only the medreses that have opened a course, and counts them", async ({
    page,
  }) => {
    await page.goto(`/tr/discover?q=${fx.tag}`);
    const main = page.getByRole("main");
    await expect(main.getByText("3 köşk ve 1 medrese")).toBeVisible();
    await expect(main.getByText(fx.madrasahs.suleymaniye.name)).toBeVisible();
    await expect(main.getByText(fx.madrasahs.zeyrek.name)).toHaveCount(0);
  });

  test("counts only published courses", async ({ page }) => {
    await page.goto(`/tr/discover?q=${fx.tag}`);
    const card = page
      .locator(".mds-card")
      .filter({ hasText: fx.kosks.nur.name })
      .first();
    // emsile, avamil and bina are published; the draft is not counted
    await expect(card.getByText("3 ders")).toBeVisible();
  });

  test("invites the visitor to sign in or register instead of offering a köşk application", async ({
    page,
  }) => {
    await page.goto(`/tr/discover?q=${fx.tag}`);
    const main = page.getByRole("main");
    await expect(
      main.getByText("hesap açmadan da göz atabilirsin")
    ).toBeVisible();
    await expect(
      main.getByRole("link", { name: "Köşk açma başvurusu" })
    ).toHaveCount(0);
    await expect(main.getByRole("link", { name: "giriş yap" })).toHaveAttribute(
      "href",
      /callbackUrl=%2Fdiscover/
    );
  });

  test("goes to the köşk page without signing in", async ({ page }) => {
    await page.goto(`/tr/discover?q=${fx.tag}`);
    await page
      .getByRole("main")
      .getByRole("link", { name: fx.kosks.nur.name })
      .click();
    await expect(page).toHaveURL(new RegExp(`/kosks/${fx.kosks.nur.id}`));
    await expect(
      page.getByRole("heading", { level: 1, name: fx.kosks.nur.name })
    ).toBeVisible();
  });

  test("sends 'giriş yap' to Keycloak", async ({ page }) => {
    await page.goto(`/tr/discover?q=${fx.tag}`);
    await page
      .getByRole("main")
      .getByRole("link", { name: "giriş yap" })
      .click();
    await page.waitForURL(toKeycloak, { timeout: 30_000 });
  });

  test("sends 'kayıt ol' to Keycloak's registration form", async ({ page }) => {
    await page.goto(`/tr/discover?q=${fx.tag}`);
    await page
      .getByRole("main")
      .getByRole("link", { name: "kayıt ol" })
      .click();
    await page.waitForURL(toKeycloak, { timeout: 30_000 });
  });

  // Needs a real Keycloak login: E2E_TALEBE_EMAIL and E2E_TALEBE_PASSWORD.
  test("brings the visitor back to Keşfet after 'giriş yap'", async ({
    page,
  }) => {
    test.skip(
      !(process.env.E2E_TALEBE_EMAIL && process.env.E2E_TALEBE_PASSWORD),
      "no Keycloak talebe in the environment"
    );
    await page.goto(`/tr/discover?q=${fx.tag}`);
    await page
      .getByRole("main")
      .getByRole("link", { name: "giriş yap" })
      .click();
    await page.waitForURL(toKeycloak, { timeout: 30_000 });
    await page.locator("#username").fill(process.env.E2E_TALEBE_EMAIL ?? "");
    await page.locator("#password").fill(process.env.E2E_TALEBE_PASSWORD ?? "");
    await page.locator("button[type=submit]").click();
    await page.waitForURL(/localhost:4000/, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/tr\/discover/);
    // signed in now: the follow button is back, the invitation is gone
    await expect(
      page.getByRole("main").getByRole("button", { name: /Takip/ }).first()
    ).toBeVisible();
    await expect(
      page.getByText("hesap açmadan da göz atabilirsin")
    ).toHaveCount(0);
  });

  test("keeps the other pages behind sign-in", async ({ page }) => {
    for (const path of ["/tr/my-courses", "/tr/learning"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/signin|\/realms\//);
    }
  });
});

test.describe("köşk page (tedris/10)", () => {
  const koskPage = (id: string) => `/tr/kosks/${id}`;

  test("shows the köşk, its manager and its published courses, with no follow button and no decks", async ({
    page,
  }) => {
    const response = await page.goto(koskPage(fx.kosks.nur.id));
    expect(response?.status()).toBe(200);
    const main = page.getByRole("main");
    await expect(
      main.getByRole("heading", { level: 1, name: fx.kosks.nur.name })
    ).toBeVisible();
    await expect(main.getByText(`Köşk nazımı ${managerName}`)).toBeVisible();
    for (const key of ["emsile", "avamil", "bina"] as const) {
      await expect(
        main.getByRole("link", { name: fx.courses[key].title })
      ).toBeVisible();
    }
    await expect(main.getByText(fx.courses.draft.title)).toHaveCount(0);
    await expect(main.getByRole("button", { name: /Takip/ })).toHaveCount(0);
    await expect(main.getByText("Köşk desteleri")).toHaveCount(0);
  });

  test("labels the course a medrese opened, and invites the visitor", async ({
    page,
  }) => {
    await page.goto(koskPage(fx.kosks.nur.id));
    const main = page.getByRole("main");
    await expect(
      main.getByText(`${fx.madrasahs.suleymaniye.name} dersi`)
    ).toBeVisible();
    await expect(main.getByText("Bir derse başvurmak için")).toBeVisible();
    await expect(main.getByRole("link", { name: "giriş yap" })).toHaveAttribute(
      "href",
      new RegExp(
        `callbackUrl=${encodeURIComponent(`/kosks/${fx.kosks.nur.id}`)}`
      )
    );
  });

  test("opens a course from the köşk page without signing in", async ({
    page,
  }) => {
    await page.goto(koskPage(fx.kosks.nur.id));
    await page.getByRole("link", { name: fx.courses.emsile.title }).click();
    await expect(page).toHaveURL(
      new RegExp(`/courses/${fx.courses.emsile.id}`)
    );
  });

  test("answers a köşk that does not exist with the not-found page", async ({
    page,
  }) => {
    // streamed: the status line is already sent, so the page says it
    await page.goto(koskPage(randomUUID()));
    await expect(page.getByText("Sayfa bulunamadı")).toBeVisible();
  });
});

test.describe("medrese page (tedris/11)", () => {
  const madrasahPage = (id: string) => `/tr/madrasahs/${id}`;

  test("shows the medrese with no enrollment badge, and invites the visitor", async ({
    page,
  }) => {
    const response = await page.goto(madrasahPage(fx.madrasahs.suleymaniye.id));
    expect(response?.status()).toBe(200);
    const main = page.getByRole("main");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: fx.madrasahs.suleymaniye.name,
      })
    ).toBeVisible();
    await expect(
      main.getByText("Medresenin bütün dersleri, açıldıkları köşkle birlikte")
    ).toBeVisible();
    await expect(main.getByText("Onay bekliyor")).toHaveCount(0);
    await expect(main.getByText("Devam ediyor")).toHaveCount(0);
    await expect(main.getByText("Bir derse başvurmak için")).toBeVisible();
  });

  test("goes from a course row to the course page, and from a köşk to its page", async ({
    page,
  }) => {
    await page.goto(madrasahPage(fx.madrasahs.suleymaniye.id));
    await page.getByRole("link", { name: fx.courses.bina.title }).click();
    await expect(page).toHaveURL(new RegExp(`/courses/${fx.courses.bina.id}`));
    await page.goBack();
    await page
      .getByRole("complementary")
      .getByRole("link", { name: fx.kosks.nur.name })
      .click();
    await expect(page).toHaveURL(new RegExp(`/kosks/${fx.kosks.nur.id}`));
  });

  test("answers a medrese that does not exist with 404", async ({ page }) => {
    const response = await page.goto(madrasahPage(randomUUID()));
    expect(response?.status()).toBe(404);
  });
});

test.describe("what the API gives a caller with no token", () => {
  test("lists the köşks, and keeps the writes and the köşk's own people to the signed-in", async ({
    request,
  }) => {
    const list = await request.get(`${api}/kosks?q=${fx.tag}`);
    expect(list.status()).toBe(200);
    const body = await list.json();
    expect(body.total).toBe(3);
    for (const item of body.items) {
      expect(item.ownerId).toBeNull();
      expect(item.managerIds).toEqual([]);
      expect(item.isFollowing).toBe(false);
    }
    expect((await request.post(`${api}/kosks`, { data: {} })).status()).toBe(
      401
    );
  });

  test("names the manager and hides who they are", async ({ request }) => {
    const res = await request.get(`${api}/kosks/${fx.kosks.nur.id}`);
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({
      ownerId: null,
      managerIds: [],
      managerName,
    });
    expect(text).not.toContain(managerId);
  });

  test("shows the medrese without who created it and who its nazırs are", async ({
    request,
  }) => {
    const res = await request.get(
      `${api}/madrasahs/${fx.madrasahs.suleymaniye.id}`
    );
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ createdBy: null, nazirIds: [] });
  });

  test("lists only published courses on the köşk's shelf", async ({
    request,
  }) => {
    const res = await request.get(`${api}/kosks/${fx.kosks.nur.id}/courses`);
    expect(res.status()).toBe(200);
    const titles = (await res.json()).map((c: { title: string }) => c.title);
    expect(titles).toContain(fx.courses.emsile.title);
    expect(titles).not.toContain(fx.courses.draft.title);
  });
});

test.describe("phone menu (tedris/45)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  const open = async (page: import("@playwright/test").Page) => {
    await page.goto(`/tr/discover?q=${fx.tag}`);
    await page.getByRole("button", { name: "Menü" }).click();
    return page.getByRole("dialog", { name: "Ana menü" });
  };

  test("opens a sheet of Ana sayfa and Keşfet, with Giriş yap and Kayıt ol at the foot", async ({
    page,
  }) => {
    const sheet = await open(page);
    await expect(sheet).toBeVisible();
    const nav = sheet.getByRole("navigation", { name: "Ana menü" });
    await expect(nav.getByRole("link", { name: "Ana sayfa" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Keşfet" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    for (const absent of ["Derslerim", "Programım", "Desteler", "Çıkış yap"]) {
      await expect(sheet.getByText(absent)).toHaveCount(0);
    }
    await expect(sheet.getByRole("link", { name: "Giriş yap" })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Kayıt ol" })).toBeVisible();
  });

  test("puts focus in the sheet, closes it with Escape and gives focus back", async ({
    page,
  }) => {
    const sheet = await open(page);
    await expect(sheet).toBeVisible();
    expect(
      await sheet.evaluate((el) => el.contains(document.activeElement))
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Menü" })).toBeFocused();
  });

  test("sends 'Giriş yap' to Keycloak", async ({ page }) => {
    const sheet = await open(page);
    await sheet.getByRole("link", { name: "Giriş yap" }).click();
    await page.waitForURL(toKeycloak, { timeout: 30_000 });
  });

  test("is not drawn at 768 px and wider, and an open sheet closes when the window widens", async ({
    page,
  }) => {
    const sheet = await open(page);
    await expect(sheet).toBeVisible();
    await page.setViewportSize({ width: 800, height: 900 });
    await expect(sheet).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Menü" })).toBeHidden();
  });

  test("shows one bar on the phone: the old header steps aside", async ({
    page,
  }) => {
    await page.goto(`/tr/discover?q=${fx.tag}`);
    await expect(page.locator("[data-legacy-header]")).toBeHidden();
    await expect(page.locator("[data-legacy-tabs]")).toBeHidden();
    await expect(page.locator(".mds-appbar")).toBeVisible();
  });
});
