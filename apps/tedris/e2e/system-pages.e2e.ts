import { expect, type Page, test } from "@playwright/test";
import { pgClient } from "./pg-client";
import { type SystemFixture, seedSystemPages } from "./system-seed";

/**
 * Designs medaris/16 (sign-out), tedris/07 (application received), 14 (draft
 * preview), 38 (not found), 39 (forbidden) and 40 (something went wrong),
 * against the running app and API with real Keycloak sign-ins (MDRS-156).
 * Accounts come from E2E_<ROLE>_EMAIL / _PASSWORD / _SUB; a spec whose account
 * is missing is skipped.
 */
const account = (role: string) => ({
  email: process.env[`E2E_${role}_EMAIL`],
  password: process.env[`E2E_${role}_PASSWORD`],
  sub: process.env[`E2E_${role}_SUB`],
});
const TALEBE = account("TALEBE");
const MUDERRIS = account("MUDERRIS");
const ready = Boolean(TALEBE.password && MUDERRIS.sub && MUDERRIS.password);
const NAZIR_URL = process.env.E2E_NAZIR_URL ?? "http://localhost:4002";

let fixture: SystemFixture;

test.beforeAll(async () => {
  if (!ready) return;
  fixture = await seedSystemPages(MUDERRIS.sub as string);
});

test.afterAll(async () => {
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
  await page.waitForURL(/localhost:4000/);
}

test.describe("medaris/16: the sign-out confirmation", () => {
  test.skip(!ready, "no Keycloak accounts in the environment");

  test("Hesap leads to it, 'Vazgeç' keeps the session, 'Çıkış yap' ends it", async ({
    page,
  }) => {
    await signIn(page, TALEBE);
    await page.goto("/tr/home");

    // Criterion 4: "Çıkış yap" goes to the page, it does not sign out. It lives in
    // Hesap (the header has "Hesabım" and no menu of its own since #179).
    await page.goto("/tr/account");
    await page.getByRole("link", { name: "Çıkış yap" }).click();
    await page.waitForURL(/\/tr\/auth\/signout$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Çıkış yapılsın mı?" })
    ).toBeVisible();
    await expect(
      page
        .getByText("Bu tarayıcıda Medaris’ten çıkarsın.")
        .filter({ visible: true })
    ).toBeVisible();

    // Criterion 3: 'Vazgeç' goes back, to Hesap here, and the session is still open.
    await page.getByRole("button", { name: "Vazgeç" }).click();
    await page.waitForURL(/\/tr\/account$/);
    await page.goto("/tr/account");
    await expect(page).toHaveURL(/\/tr\/account$/);

    // Criterion 2: confirming ends NextAuth's and Keycloak's sessions.
    await page.goto("/tr/auth/signout");
    await page.getByRole("button", { name: "Çıkış yap" }).click();
    await page.waitForURL((url) => !url.pathname.endsWith("/auth/signout"));
    await page.goto("/tr/account");
    await expect(page.locator("#username")).toBeVisible();
  });
});

test.describe("tedris/07: the application window", () => {
  test.skip(!ready, "no Keycloak accounts in the environment");

  test.afterEach(async () => {
    await fixture?.clearEnrollments();
  });

  test("an application that waits opens the window; Esc closes it and the page shows 'Onay bekliyor'", async ({
    page,
  }) => {
    await signIn(page, TALEBE);
    await page.goto(`/tr/courses/${fixture.approval.id}`);
    await page.getByRole("button", { name: "Kayıt başvurusu yap" }).click();

    const dialog = page.getByRole("dialog", { name: "Başvurun alındı" });
    await expect(dialog).toBeVisible();
    // Criterion 5: the course's name over the title, in Turkish capitals.
    await expect(dialog.locator(".mds-eyebrow")).toHaveText(
      fixture.approval.title.toLocaleUpperCase("tr")
    );
    await expect(dialog).toContainText(
      "Ders kadrosu başvurunu değerlendirecek."
    );
    await expect(
      dialog.getByText(
        "Onaylanana kadar başvurunu bu sayfadan geri çekebilirsin."
      )
    ).toBeVisible();
    // Focus opens on "Tamam" and stays inside.
    await expect(dialog.getByRole("button", { name: "Tamam" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.locator(":focus")).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(
      page.getByText("Onay bekliyor").filter({ visible: true })
    ).toBeVisible();
  });

  test("'Tamam' closes it and hands focus to 'Başvuruyu geri çek'", async ({
    page,
  }) => {
    await signIn(page, TALEBE);
    await page.goto(`/tr/courses/${fixture.approval.id}`);
    await page.getByRole("button", { name: "Kayıt başvurusu yap" }).click();
    const dialog = page.getByRole("dialog", { name: "Başvurun alındı" });
    await dialog.getByRole("button", { name: "Tamam" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Başvuruyu geri çek" })
    ).toBeFocused();
  });

  test("a refused application opens no window", async ({ page }) => {
    await signIn(page, TALEBE);
    await page.goto(`/tr/courses/${fixture.approval.id}`);
    // The server action is a POST to the page; refuse it at the network.
    await page.route(`**/tr/courses/${fixture.approval.id}`, (route) =>
      route.request().method() === "POST" ? route.abort() : route.continue()
    );
    await page.getByRole("button", { name: "Kayıt başvurusu yap" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test.describe("tedris/14: the draft preview", () => {
  test.skip(!ready, "no Keycloak accounts in the environment");

  test("an editor sees the banner, the badge and the preview card, and cannot apply", async ({
    page,
  }) => {
    await signIn(page, MUDERRIS);
    await page.goto(`/tr/courses/${fixture.draft.id}`);

    await expect(page.getByText("Önizleme").first()).toBeVisible();
    await expect(
      page
        .getByText(
          "Ders henüz yayında değil; bu önizlemeyi yalnızca yöneticiler görür."
        )
        .filter({ visible: true })
    ).toBeVisible();
    await expect(
      page.locator(".mds-badge:visible", { hasText: "Taslak" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Ders yayımlandığında" })
    ).toBeVisible();
    // Criterion 2: no application button, whatever its label.
    await expect(page.getByRole("button", { name: /Kayıt/ })).toHaveCount(0);
    // Criterion 3: the earliest session, not the later one.
    await expect(
      page.getByText("12 Ekim Pazartesi 21:00").filter({ visible: true })
    ).toBeVisible();
    // Criterion 5: "Düzenlemeye dön" goes to Nazır.
    const back = page.getByRole("link", { name: /Düzenlemeye dön/ });
    await expect(back).toHaveAttribute("href", NAZIR_URL);
  });

  test("anyone who may not edit it gets the not-found page", async ({
    page,
  }) => {
    await signIn(page, TALEBE);
    const response = await page.goto(`/tr/courses/${fixture.draft.id}`);
    expect(response?.status()).toBe(404);
    await expect(
      page.getByText("Sayfa bulunamadı").filter({ visible: true })
    ).toBeVisible();
  });
});

test.describe("tedris/38: not found", () => {
  test.skip(!ready, "no Keycloak accounts in the environment");

  test("an unknown URL answers 404 with the page and its button leads home", async ({
    page,
  }) => {
    await signIn(page, TALEBE);
    const response = await page.goto("/tr/olmayan-sayfa");
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: "Sayfa bulunamadı" })
    ).toBeVisible();
    await expect(
      page
        .getByText(
          "Aradığın sayfa yok ya da artık burada değil. Adresi kontrol et ya da ana sayfadan devam et."
        )
        .filter({ visible: true })
    ).toBeVisible();
    await page.getByRole("link", { name: "Ana sayfaya dön" }).click();
    await expect(page).toHaveURL(/\/tr\/home$/);
  });

  test("a course the API answers 404 for falls onto it", async ({ page }) => {
    await signIn(page, TALEBE);
    const response = await page.goto(
      "/tr/courses/00000000-0000-4000-8000-00000000dead"
    );
    expect(response?.status()).toBe(404);
    await expect(
      page.getByText("Sayfa bulunamadı").filter({ visible: true })
    ).toBeVisible();
  });
});

test.describe("tedris/39: forbidden", () => {
  test.skip(!ready, "no Keycloak accounts in the environment");

  for (const route of ["edit", "cards"]) {
    test(`a non-owner of a public deck opening /${route} gets it, naming the deck`, async ({
      page,
    }) => {
      await signIn(page, TALEBE);
      await page.goto(`/tr/decks/${fixture.deck.id}/${route}`);
      await expect(
        page.getByRole("heading", { name: "Bu sayfayı göremezsin" })
      ).toBeVisible();
      await expect(
        page
          .getByText(
            `${fixture.deck.title} herkese açık bir deste; kartlarını yalnız sahibi düzenler.`
          )
          .filter({ visible: true })
      ).toBeVisible();
      await page.getByRole("link", { name: "Desteye dön" }).click();
      await expect(page).toHaveURL(new RegExp(`/tr/decks/${fixture.deck.id}$`));
    });
  }
});

test.describe("tedris/40: something went wrong", () => {
  test.skip(!ready, "no Keycloak accounts in the environment");

  test("a segment that throws shows it, hides the error, and 'Yeniden dene' reads again", async ({
    page,
  }) => {
    // A zone that no calendar knows: the API stores whatever is in the row,
    // and drawing the preview card's first session throws on the server.
    const db = await pgClient();
    try {
      await db.query(
        "update courses set time_zone = 'Nope/Zone' where id = $1",
        [fixture.draft.id]
      );
      await signIn(page, MUDERRIS);
      await page.goto(`/tr/courses/${fixture.draft.id}`);

      await expect(
        page.getByRole("heading", { name: "Bir şeyler ters gitti" })
      ).toBeVisible();
      await expect(
        page
          .getByText(
            "Sunucuya ulaşılamadı. İnternet bağlantını denetleyip yeniden dene."
          )
          .filter({ visible: true })
      ).toBeVisible();
      // Criterion 3: nothing of the error.
      // (Next's dev overlay, which only a dev server draws, is outside this region.)
      await expect(page.locator(".mds-system-state")).not.toContainText(
        /RangeError|Nope\/Zone|Invalid time zone/
      );

      await db.query(
        "update courses set time_zone = 'Europe/Istanbul' where id = $1",
        [fixture.draft.id]
      );
      await page.getByRole("button", { name: "Yeniden dene" }).click();
      await expect(
        page.getByRole("heading", { name: "Ders yayımlandığında" })
      ).toBeVisible();
    } finally {
      await db.end();
    }
  });
});
