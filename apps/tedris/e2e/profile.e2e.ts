import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { pgClient } from "./pg-client";
import { canUseDirectGrant, directGrant, signIn } from "./sign-in";

/**
 * Designs tedris/34 (Hesap), tedris/35 (Herkese açık profil) and tedris/37
 * (Köşk açma başvurusu) against the running app and API with real Keycloak
 * sign-ins as `e2e-talebe` (MDRS-166): E2E_TALEBE_EMAIL, E2E_TALEBE_PASSWORD and
 * E2E_TALEBE_SUB, skipped when unset. The public-profile call as a second person
 * needs E2E_OTHER_EMAIL / E2E_OTHER_PASSWORD plus the direct-grant variables of
 * `sign-in.ts`, and E2E_TEDRISAT_URL for the API (default http://localhost:3001).
 * What a spec writes is tagged and removed again, and the talebe's profile row
 * and time zone go back to what they were.
 */
const talebe = {
  email: process.env.E2E_TALEBE_EMAIL,
  password: process.env.E2E_TALEBE_PASSWORD,
  sub: process.env.E2E_TALEBE_SUB,
};
const other = {
  email: process.env.E2E_OTHER_EMAIL,
  password: process.env.E2E_OTHER_PASSWORD,
};
const API = process.env.E2E_TEDRISAT_URL ?? "http://localhost:3001";
const tag = randomUUID().slice(0, 6);

const ready = Boolean(talebe.email && talebe.password && talebe.sub);
// The public profile is hidden (MDRS-141): the page shows the not-found page and the API answers
// 404 PUBLIC_PROFILE_UNAVAILABLE. Set this when the constant in
// features/public-profile/availability.ts and API__PUBLIC_PROFILE_ENABLED are on.
const publicProfileShown = process.env.E2E_PUBLIC_PROFILE_ENABLED === "true";

test.beforeAll(async () => {
  if (!ready) return;
  const db = await pgClient();
  await db.query("delete from user_profiles where user_id = $1", [talebe.sub]);
  await db.end();
});

test.afterAll(async () => {
  if (!ready) return;
  const db = await pgClient();
  await db.query("delete from user_profiles where user_id = $1", [talebe.sub]);
  await db.query("update users set time_zone = null where id = $1", [
    talebe.sub,
  ]);
  await db.query("delete from kosk_applications where name like $1", [
    `%${tag}%`,
  ]);
  await db.end();
});

const toast = (page: Page, text: string) =>
  page.getByText(text, { exact: false }).first();

const rows = async (sql: string, args: unknown[]) => {
  const db = await pgClient();
  try {
    return (await db.query(sql, args)).rows;
  } finally {
    await db.end();
  }
};

test("Hesap: names persist, blanks are refused, e-mail and language are read only", async ({
  page,
}) => {
  test.skip(!ready, "no Keycloak talebe in the environment");
  await signIn(page, talebe);
  await page.goto("/tr/account");

  await expect(
    page.getByRole("heading", { name: "Kişisel bilgiler" })
  ).toBeVisible();
  await expect(page.locator('input[name="email"]')).toHaveValue(
    talebe.email as string
  );
  await expect(page.locator('input[name="email"]')).not.toBeEditable();
  await expect(page.locator('input[name="language"]')).toHaveValue("Türkçe");
  await expect(page.locator('input[name="language"]')).not.toBeEditable();

  // Criterion 2: a blank name sends nothing and says so.
  await page.locator('input[name="givenName"]').fill("");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Adını yaz.")).toBeVisible();
  expect(
    await rows("select 1 from user_profiles where user_id = $1", [talebe.sub])
  ).toHaveLength(0);

  // Criterion 1 and the e2e of the spec: change, save, reload, it stays.
  await page.locator('input[name="givenName"]').fill(`Zeynep ${tag}`);
  await page.locator('input[name="familyName"]').fill("Karahanlı");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(toast(page, "Adın ve soyadın kaydedildi.")).toBeVisible();
  await page.reload();
  await expect(page.locator('input[name="givenName"]')).toHaveValue(
    `Zeynep ${tag}`
  );
  await expect(page.locator('input[name="familyName"]')).toHaveValue(
    "Karahanlı"
  );
});

test("Hesap: the time zone saves as it is chosen and survives a reload", async ({
  page,
}) => {
  test.skip(!ready, "no Keycloak talebe in the environment");
  await signIn(page, talebe);
  await page.goto("/tr/account");

  const zone = page.locator("#account-time-zone");
  await expect(zone).toContainText("İstanbul");
  await zone.click();
  await page.getByRole("option", { name: "Berlin" }).click();
  await expect(toast(page, "Saat dilimin kaydedildi.")).toBeVisible();
  expect(
    (await rows("select time_zone from users where id = $1", [talebe.sub]))[0]
      .time_zone
  ).toBe("Europe/Berlin");

  await page.reload();
  await expect(page.locator("#account-time-zone")).toContainText("Berlin");
});

test("Hesap: the calendar card leads to the subscription page and 'Çıkış yap' ends the session", async ({
  page,
}) => {
  test.skip(!ready, "no Keycloak talebe in the environment");
  await signIn(page, talebe);
  await page.goto("/tr/account");

  await page.getByRole("link", { name: "Takvim bağlantını yönet" }).click();
  await expect(page).toHaveURL(/\/account\/calendar/);

  await page.goto("/tr/account");
  await page.getByRole("link", { name: "Çıkış yap" }).click();
  await expect(page).toHaveURL(/\/auth\/signout/);
  await page.getByRole("button", { name: /Çıkış yap/ }).click();
  // Keycloak's end-session page may refuse a callback it does not list; the
  // session cookie is gone either way, so a protected page asks to sign in.
  await page.waitForTimeout(1500);
  await page.goto("/tr/account");
  await expect(page).toHaveURL(/signin|auth\.medaris\.app/);
});

test("Herkese açık profil: künye is required, switches persist, and others see only what is open", async ({
  page,
}) => {
  test.skip(!ready, "no Keycloak talebe in the environment");
  test.skip(
    !publicProfileShown,
    "the public profile is hidden (MDRS-141); set E2E_PUBLIC_PROFILE_ENABLED=true once it is switched on"
  );
  await signIn(page, talebe);
  await page.goto("/tr/account/public-profile");

  // Criterion 5: an empty künye sends nothing.
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("İlmî künyeni yaz.")).toBeVisible();

  await page.locator('input[name="kunye"]').fill(`Künye ${tag}`);
  await page.getByText("Kadın", { exact: true }).click();
  await page.locator('input[name="city"]').fill("İstanbul");
  await page.locator('textarea[name="about"]').fill("Sarf ve nahiv okuyorum.");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(toast(page, "Herkese açık profilin kaydedildi.")).toBeVisible();

  // Criterion 2: the optional fields start hidden.
  const preview = page.getByRole("complementary", {
    name: "Başkaları böyle görür",
  });
  await expect(preview).toContainText(`Künye ${tag}`);
  await expect(preview).toContainText(
    "Gizli: ad ve soyad, şehir, hakkında, derslerin."
  );
  await expect(preview).not.toContainText("İstanbul");

  // Criterion 3: a switch saves on its own, drives the preview and survives a reload.
  const citySwitch = page.getByRole("switch").nth(1);
  await citySwitch.locator("xpath=ancestor::label").click();
  await expect(citySwitch).toHaveAttribute("aria-checked", "true");
  await expect(preview).toContainText("İstanbul");
  await expect(preview).toContainText(
    "Gizli: ad ve soyad, hakkında, derslerin."
  );
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByRole("switch").nth(1)).toHaveAttribute(
    "aria-checked",
    "true"
  );

  // Criterion 4: a second person's call returns only the open fields.
  test.skip(
    !(canUseDirectGrant && other.email && other.password),
    "no second account or direct grant in the environment"
  );
  const token = (await directGrant(other)).access_token;
  const read = async () =>
    (
      await fetch(`${API}/users/${talebe.sub}/public-profile`, {
        headers: { authorization: `Bearer ${token}` },
      })
    ).json();
  expect(await read()).toMatchObject({
    kunye: `Künye ${tag}`,
    gender: "FEMALE",
    city: "İstanbul",
  });
  await page
    .getByRole("switch")
    .nth(1)
    .locator("xpath=ancestor::label")
    .click();
  await expect(page.getByRole("switch").nth(1)).toHaveAttribute(
    "aria-checked",
    "false"
  );
  await page.waitForTimeout(500);
  const closed = await read();
  expect(closed).not.toHaveProperty("city");
  expect(closed).not.toHaveProperty("about");
  expect(closed).toMatchObject({ kunye: `Künye ${tag}` });
});

test("Köşk açma başvurusu: validation, 'Vazgeç' writes nothing, a sent form is PENDING", async ({
  page,
}) => {
  test.skip(!ready, "no Keycloak talebe in the environment");
  await signIn(page, talebe);
  await page.goto("/tr/discover");
  await page.getByRole("link", { name: "Köşk açma başvurusu" }).click();
  await expect(page).toHaveURL(/\/kosk-applications\/new/);

  // Criterion 1: the e-mail comes filled and editable; empty required fields block the send.
  await expect(page.locator('input[name="email"]')).toHaveValue(
    talebe.email as string
  );
  await expect(page.locator('input[name="email"]')).toBeEditable();
  await page.getByRole("button", { name: "Başvuruyu gönder" }).click();
  await expect(page.getByText("Köşk adını yaz.")).toBeVisible();
  await expect(page.getByText("Bir alan seç.")).toBeVisible();
  expect(
    await rows("select 1 from kosk_applications where applicant_id = $1", [
      talebe.sub,
    ])
  ).toHaveLength(0);

  // Criterion 2: the eleven fields.
  await page.locator("#application-field").click();
  await expect(page.getByRole("option")).toHaveCount(11);
  await page.getByRole("option", { name: "Akaid ve kelâm" }).click();

  // Criterion 5: Vazgeç goes back and creates nothing.
  await page.getByRole("link", { name: "Vazgeç" }).click();
  await expect(page).toHaveURL(/\/discover/);
  expect(
    await rows("select 1 from kosk_applications where applicant_id = $1", [
      talebe.sub,
    ])
  ).toHaveLength(0);

  // Criteria 3 and 4: a form with no phone is stored as PENDING and the person is told.
  await page.getByRole("link", { name: "Köşk açma başvurusu" }).click();
  await page.locator('input[name="name"]').fill(`Davutpaşa ${tag}`);
  await page.locator("#application-field").click();
  await page.getByRole("option", { name: "Akaid ve kelâm" }).click();
  await page
    .locator('textarea[name="summary"]')
    .fill("Akaid ve kelâm metinlerini şerhleriyle okuyan bir köşk.");
  await page
    .locator('textarea[name="reason"]')
    .fill("Davutpaşa'da yüz yüze yürüyen bir akaid halkamız var.");
  await page.getByRole("button", { name: "Başvuruyu gönder" }).click();
  await expect(page.getByTestId("application-sent")).toBeVisible();

  const stored = await rows(
    "select name, field, phone, status from kosk_applications where applicant_id = $1",
    [talebe.sub]
  );
  expect(stored).toEqual([
    {
      name: `Davutpaşa ${tag}`,
      field: "AQEEDAH_KALAM",
      phone: null,
      status: "PENDING",
    },
  ]);
});
