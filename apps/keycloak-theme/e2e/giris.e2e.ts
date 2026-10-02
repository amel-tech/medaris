import { expect, type Page, test } from "@playwright/test";

const story = (page: Page, id: string) =>
  page.goto(`/iframe.html?id=${id}&viewMode=story`);

test.describe("login.ftl (medaris/01)", () => {
  test("shows the canvas texts and the two links", async ({ page }) => {
    await story(page, "login-login-ftl--default-turkish");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Giriş yap"
    );
    await expect(
      page.getByText("Derslerine kaldığın yerden devam et.")
    ).toBeVisible();
    await expect(page.getByText("* zorunlu alan")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Şifremi unuttum" })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Kayıt ol" })).toBeVisible();
  });

  test("an empty submission is stopped by the browser and nothing is posted", async ({
    page,
  }) => {
    await story(page, "login-login-ftl--default-turkish");
    let posted = false;
    page.on("request", (request) => {
      if (request.method() === "POST") posted = true;
    });
    await page.getByRole("button", { name: "Giriş yap" }).click();
    expect(posted).toBe(false);
    expect(
      await page
        .locator("#username")
        .evaluate((e: HTMLInputElement) => e.validity.valueMissing)
    ).toBe(true);
  });

  test("a filled form posts username and password to loginAction", async ({
    page,
  }) => {
    await story(page, "login-login-ftl--default-turkish");
    await page.locator("#username").fill("zeynep");
    await page.locator("#password").fill("gizli-sifre-1");
    const request = page.waitForRequest((r) => r.method() === "POST");
    await page.getByRole("button", { name: "Giriş yap" }).click();
    const body = (await request).postData() ?? "";
    expect(body).toContain("username=zeynep");
    expect(body).toContain("password=gizli-sifre-1");
  });

  test("the reveal button toggles the password and keeps its name", async ({
    page,
  }) => {
    await story(page, "login-login-ftl--default-turkish");
    const input = page.locator("#password");
    const toggle = page.getByRole("button", { name: "Şifreyi göster" });
    await expect(input).toHaveAttribute("type", "password");
    await toggle.click();
    await expect(input).toHaveAttribute("type", "text");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  test("a wrong password shows one alert and keeps the user name", async ({
    page,
  }) => {
    await story(page, "login-login-ftl--with-invalid-credential");
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator("#username")).toHaveValue("johndoe");
    await expect(page.locator("#username")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
  });

  test("the card has no horizontal scroll at 390 px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await story(page, "login-login-ftl--default-turkish");
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
  });
});

test.describe("register.ftl (medaris/03)", () => {
  test("the rules update as the password is typed and read ', karşılandı'", async ({
    page,
  }) => {
    await story(page, "login-register-ftl--default-turkish");
    const items = page.getByRole("listitem");
    await expect(items).toHaveCount(3);
    await expect(items.filter({ hasText: ", karşılandı" })).toHaveCount(0);
    await page.locator("#email").fill("zeynep@example.com");
    await page.locator("#password").fill("zeynep@example.com");
    // as long as the e-mail address (18 characters): the length and the user name are met, the e-mail is not
    await expect(items.filter({ hasText: ", karşılandı" })).toHaveCount(2);
    await page.locator("#password").fill("uzun-bir-sifre-1");
    await expect(items.filter({ hasText: ", karşılandı" })).toHaveCount(3);
  });

  test("an invalid submission posts nothing and writes the reasons under the fields", async ({
    page,
  }) => {
    await story(page, "login-register-ftl--default-turkish");
    let posted = false;
    page.on("request", (request) => {
      if (request.method() === "POST") posted = true;
    });
    await page.locator("#password").fill("uzun-bir-sifre-1");
    await page.locator("#password-confirm").fill("baska-bir-sifre");
    await page
      .locator("#kc-register-form")
      .getByRole("button", { name: "Kayıt ol" })
      .click();
    expect(posted).toBe(false);
    await expect(
      page.getByText("Şifreler eşleşmiyor. Aynı şifreyi yeniden yaz.")
    ).toBeVisible();
    await expect(
      page.getByText("Devam etmek için metni okuduğunu onayla.")
    ).toBeVisible();
    await expect(page.locator("#firstName")).toBeFocused();
  });

  test("a valid form posts every field, privacy box included", async ({
    page,
  }) => {
    await story(page, "login-register-ftl--default-turkish");
    await page.locator("#firstName").fill("Zeynep");
    await page.locator("#lastName").fill("Karahanlı");
    await page.locator("#username").fill("zeynep.k");
    await page.locator("#email").fill("zeynep@example.com");
    await page.locator("#password").fill("uzun-bir-sifre-1");
    await page.locator("#password-confirm").fill("uzun-bir-sifre-1");
    await page.getByRole("checkbox").check();
    const request = page.waitForRequest((r) => r.method() === "POST");
    await page
      .locator("#kc-register-form")
      .getByRole("button", { name: "Kayıt ol" })
      .click();
    const body = (await request).postData() ?? "";
    for (const part of [
      "firstName=Zeynep",
      "username=zeynep.k",
      "password-confirm=uzun-bir-sifre-1",
      "privacyNoticeRead=yes",
    ]) {
      expect(body).toContain(part);
    }
  });

  test("the privacy notice link opens in a new tab", async ({ page }) => {
    await story(page, "login-register-ftl--default-turkish");
    const link = page.getByRole("link", { name: "Aydınlatma Metni" });
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
  });
});

test.describe("the state pages (medaris/05, 12, 13, 14, 17)", () => {
  test("info shows the verified title and one way on", async ({ page }) => {
    await story(page, "login-info-ftl--email-verified");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "E-posta adresin doğrulandı"
    );
    await expect(
      page.getByRole("link", { name: "Medaris’e devam et" })
    ).toHaveAttribute("href", /tedris/);
  });

  test("email changed (17) is the same page with Keycloak's header", async ({
    page,
  }) => {
    await story(page, "login-info-ftl--email-changed");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "E-posta adresin değişti"
    );
    await expect(
      page.getByText("Yeni adresin hesabına kaydedildi.")
    ).toBeVisible();
  });

  test("error and expired pages send the person to the start", async ({
    page,
  }) => {
    await story(page, "login-error-ftl--default-turkish");
    await expect(
      page.getByRole("link", { name: "Giriş sayfasına dön" })
    ).toBeVisible();
    await story(page, "login-login-page-expired-ftl--default-turkish");
    await expect(
      page.getByRole("link", { name: "Yeniden dene" })
    ).toBeVisible();
  });

  test("logout confirm has its confirm button and a cancel", async ({
    page,
  }) => {
    await story(page, "login-logout-confirm-ftl--default-turkish");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Çıkış yapılsın mı?"
    );
    await expect(page.getByRole("button", { name: "Çıkış yap" })).toBeVisible();
  });
});
