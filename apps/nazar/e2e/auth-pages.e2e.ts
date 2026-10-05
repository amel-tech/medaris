import { expect, test } from "@playwright/test";

/**
 * Nazır's own auth pages and the gate in front of the rest (MDRS-183). None of
 * this signs in, so it needs `nazar-web` running but neither the API nor an
 * account.
 */
test("a signed-out request for a page is sent to our sign-in page", async ({
  request,
}) => {
  const response = await request.get("/hesap", { maxRedirects: 0 });

  expect(response.status()).toBe(307);
  const location = new URL(
    response.headers().location as string,
    "http://localhost"
  );
  expect(location.pathname).toBe("/auth/signin");
  expect(location.searchParams.get("callbackUrl")).toBe("/hesap");
});

test("the error page says what happened, in Turkish and in the unified system", async ({
  page,
}) => {
  await page.goto("/auth/error?error=AccessDenied");

  const html = page.locator("html");
  await expect(html).toHaveAttribute("lang", "tr");
  await expect(html).toHaveAttribute("data-app", "nazar");

  const heading = page.getByRole("heading", {
    level: 1,
    name: "Giriş yapılamadı",
  });
  await expect(heading).toBeVisible();
  await expect(
    page.getByText("Bu hesabın giriş izni yok.").filter({ visible: true })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Tekrar dene" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Ana sayfaya dön" })
  ).toHaveAttribute("href", "/");

  // The class layer is really loaded: titles are Literata, not the browser's.
  await expect(heading).toHaveCSS("font-family", /Literata/);
});

test("the sign-out page asks first and does not sign out by itself", async ({
  page,
}) => {
  await page.goto("/auth/signout");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Çıkış yapmak istiyor musunuz?",
    })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Çıkış yap" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Vazgeç" })).toHaveAttribute(
    "href",
    "/"
  );
});

test("an unknown page answers 404 in Turkish", async ({ page }) => {
  // `/auth/…` is the one subtree the session gate leaves alone, so a signed-out
  // visitor can reach the 404 there; everywhere else the gate answers first.
  const response = await page.goto("/auth/yok");

  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: "Sayfa bulunamadı" })
  ).toBeVisible();
});
