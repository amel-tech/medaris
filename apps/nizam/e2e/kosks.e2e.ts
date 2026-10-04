import { expect, type Page, test } from "@playwright/test";
import { type KoskFixture, seedKosks } from "./kosk-seed";

/**
 * Designs nizam/09 (Köşkler), nizam/10 (Köşk aç), nizam/24 (Köşk ayarları),
 * nizam/25 (Köşk nazımları) and nizam/21 (Köşk nazımı ekle) against the running
 * app and API, with real Keycloak sign-ins (MDRS-174). A spec whose account is
 * not in the environment (E2E_<ROLE>_EMAIL, _PASSWORD, _SUB) is skipped. The
 * table, "Köşk aç" and "Köşk nazımı ekle" are the Medaris başnazımı's, so
 * those specs sign in as the account that holds the SYSTEM_ADMIN realm role;
 * the settings and the nazım list are a köşk nazımı's. The e-mail lookups go
 * to the real realm directory through `tedrisat-admin`, and the account they
 * find is the talebe test account.
 */
const account = (role: string) => ({
  email: process.env[`E2E_${role}_EMAIL`],
  password: process.env[`E2E_${role}_PASSWORD`],
  sub: process.env[`E2E_${role}_SUB`],
});
const SYSTEM_ADMIN = account("SYSTEM_ADMIN");
const KOSK_NAZIM = account("KOSK_NAZIM");
const TALEBE = account("TALEBE");
const API = process.env.E2E_API_URL ?? "http://localhost:3001";

const seedable = Boolean(process.env.E2E_DATABASE_URL);
let fixture: KoskFixture;

// The screen shows moments in the browser's zone unless the account has one:
// pinned, the end dates below mean the same instant on any machine (MDRS-254).
test.use({ timezoneId: "Europe/Istanbul" });

test.beforeEach(async () => {
  if (!seedable || !SYSTEM_ADMIN.sub || !KOSK_NAZIM.sub) return;
  fixture = await seedKosks({ nazim: KOSK_NAZIM.sub, chief: SYSTEM_ADMIN.sub });
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

// `:visible`: while a navigation streams in, Next keeps the finished page in a
// hidden node beside the one on screen, so a row can briefly exist twice.
const rowOf = (page: Page, text: string) =>
  page
    .locator("[data-testid=kosks] tbody tr:visible")
    .filter({ hasText: text });

const openTable = async (page: Page, query = "") => {
  await page.goto(`/tr/kosks${query}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Köşkler" })
  ).toBeVisible();
};

/** A tab's number, read off the tab. */
const tabCount = async (page: Page, label: string) => {
  const tab = page.getByRole("tab", { name: new RegExp(`^${label}`) });
  const text = (await tab.innerText()).replace(/\D+/g, "");
  return Number(text);
};

const chooseOption = async (
  page: Page,
  scope: ReturnType<Page["locator"]>,
  name: string | RegExp
) => {
  await scope.click();
  await page.getByRole("option", { name, exact: true }).click();
};

const dialogOf = (page: Page) => page.getByRole("dialog");

test("nizam/09 — the table lists every köşk with its nazımları, field, courses and status, and the tabs' numbers are the database's (criteria 1, 3, 4)", async ({
  page,
}) => {
  test.skip(!(seedable && SYSTEM_ADMIN.password), "no SYSTEM_ADMIN account");
  await signIn(page, SYSTEM_ADMIN);
  await openTable(page, `?q=${fixture.tail}`);
  await shot(page, "09-koskler");

  await expect(
    page.locator("[data-testid=kosks] tbody tr:visible th")
  ).toHaveCount(4);
  const beyazit = rowOf(page, fixture.beyazit.name);
  await expect(beyazit).toContainText(`@${fixture.beyazit.handle}`);
  await expect(beyazit).toContainText("Hadis");
  await expect(beyazit).toContainText("Etkin");
  await expect(beyazit.locator("td").nth(2)).toHaveText("2");
  await expect(rowOf(page, fixture.fatih.name)).toContainText(
    "Ömer Nasuhi Bilmenoğlu ve Abdullah Nuri Gezginoğlu"
  );
  await expect(rowOf(page, fixture.fatih.name).locator("td").nth(2)).toHaveText(
    "3"
  );

  // the unlisted köşk says so, and the başnazım is its nazımı: "Siz"
  const uskudar = rowOf(page, fixture.uskudar.name);
  await expect(uskudar).toContainText("Listelenmeyen");
  await expect(uskudar).toContainText("Siz");
  await expect(beyazit).not.toContainText("Siz");
  await expect(beyazit).not.toContainText("Listelenmeyen");

  // only the hidden köşk can be brought back
  const kalender = rowOf(page, fixture.kalender.name);
  await expect(kalender).toContainText("Gizli");
  await expect(kalender).toContainText("24 Eylül’den beri");
  await expect(
    kalender.getByRole("button", { name: /^Geri al/ })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Geri al/ })).toHaveCount(1);

  // criterion 1: the tabs' numbers are the totals the database holds
  const counts = await fixture.counts();
  expect(await tabCount(page, "Tümü")).toBe(counts.all);
  expect(await tabCount(page, "Etkin")).toBe(counts.active);
  expect(await tabCount(page, "Pasif")).toBe(counts.passive);
  expect(await tabCount(page, "Gizli")).toBe(counts.hidden);
});

test("nizam/09 — every filter works alone and together, and a reload restores them from the URL (criterion 2)", async ({
  page,
}) => {
  test.skip(!(seedable && SYSTEM_ADMIN.password), "no SYSTEM_ADMIN account");
  await signIn(page, SYSTEM_ADMIN);
  await openTable(page, `?q=${fixture.tail}`);
  // the row headers: an empty table still has one row, the sentence
  const rows = page.locator("[data-testid=kosks] tbody tr:visible th");

  // Seviye
  await chooseOption(
    page,
    page.getByRole("combobox", { name: "Seviye" }),
    "Seviye: Başlangıç"
  );
  await expect(page).toHaveURL(/seviye=baslangic/);
  await expect(rows).toHaveCount(1);
  await expect(rowOf(page, fixture.beyazit.name)).toHaveCount(1);

  // Görünürlük, together with the level
  await page.getByRole("button", { name: "Listelenmeyen" }).click();
  await expect(page).toHaveURL(/gorunurluk=listelenmeyen/);
  await expect(rows).toHaveCount(0);
  await expect(page.getByText("Sonuç yok")).toBeVisible();

  // a reload keeps the filters
  await page.reload();
  await expect(page).toHaveURL(/seviye=baslangic/);
  await expect(page).toHaveURL(/gorunurluk=listelenmeyen/);
  await expect(page.getByText("Sonuç yok")).toBeVisible();

  // Görünürlük alone
  await page.goto(`/tr/kosks?q=${fixture.tail}&gorunurluk=listelenmeyen`);
  await expect(rows).toHaveCount(1);
  await expect(rowOf(page, fixture.uskudar.name)).toHaveCount(1);

  // Alan alone, from the chips
  await page.goto(`/tr/kosks?q=${fixture.tail}`);
  await page.getByRole("button", { name: "Fıkıh", exact: true }).click();
  await expect(page).toHaveURL(/alan=F/);
  await expect(rows).toHaveCount(1);
  await expect(rowOf(page, fixture.fatih.name)).toHaveCount(1);

  // the status tab
  await page.goto(`/tr/kosks?q=${fixture.tail}`);
  await page.getByRole("tab", { name: /^Gizli/ }).click();
  await expect(page).toHaveURL(/durum=gizli/);
  await expect(rows).toHaveCount(1);
  await expect(rowOf(page, fixture.kalender.name)).toHaveCount(1);

  // the search
  await page.goto("/tr/kosks");
  await page
    .getByRole("searchbox", { name: "Köşk ya da köşk nazımı ara" })
    .fill(`Abdullah Nuri Gezginoğlu`);
  await expect(page).toHaveURL(/q=Abdullah/);
  await expect(rowOf(page, fixture.fatih.name)).toHaveCount(1);
  await expect(rowOf(page, fixture.kalender.name)).toHaveCount(1);
  await expect(rowOf(page, fixture.beyazit.name)).toHaveCount(0);
});

test("nizam/09 — 'Geri al' brings a hidden köşk back and it turns Etkin (criterion 3)", async ({
  page,
}) => {
  test.skip(!(seedable && SYSTEM_ADMIN.password), "no SYSTEM_ADMIN account");
  await signIn(page, SYSTEM_ADMIN);
  await openTable(page, `?q=${fixture.tail}`);
  const kalender = rowOf(page, fixture.kalender.name);
  await kalender.getByRole("button", { name: /^Geri al/ }).click();
  await expect(page.getByText("Köşk geri alındı")).toBeVisible();
  await expect(kalender).toContainText("Etkin");
  await expect(kalender.getByRole("button", { name: /^Geri al/ })).toHaveCount(
    0
  );
  expect((await fixture.kosk(fixture.kalender.id))?.hidden).toBe(false);
  expect(await fixture.audits("kosk.restore")).toBe(1);
});

test("nizam/09 — a köşk nazımı sees only their own köşks, and neither 'Köşk aç' nor 'Geri al' (criterion 4 of the e2e list)", async ({
  page,
}) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no KOSK_NAZIM account");
  await signIn(page, KOSK_NAZIM);
  await openTable(page, `?q=${fixture.tail}`);
  await expect(
    page.locator("[data-testid=kosks] tbody tr:visible th")
  ).toHaveCount(1);
  await expect(rowOf(page, fixture.beyazit.name)).toContainText("Siz");
  await expect(page.getByRole("button", { name: "Köşk aç" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Geri al/ })).toHaveCount(0);
});

test("nizam/10 — 'Köşk aç' stays off until name, field, level and a nazım are right, then opens the köşk with its nazım (criteria 1-5)", async ({
  page,
}) => {
  test.skip(
    !(seedable && SYSTEM_ADMIN.password && TALEBE.email),
    "no SYSTEM_ADMIN or TALEBE account"
  );
  await signIn(page, SYSTEM_ADMIN);
  await openTable(page, `?q=${fixture.tail}`);
  await page.getByRole("button", { name: "Köşk aç" }).first().click();
  const dialog = dialogOf(page);
  await expect(dialog).toBeVisible();
  const submit = dialog.getByRole("button", { name: "Köşk aç" });
  await expect(submit).toBeDisabled();
  await shot(page, "10-kosk-ac-bos");

  const name = `E2E Davutpaşa Köşkü ${fixture.tail}`;
  await dialog.getByRole("textbox", { name: "Ad", exact: true }).fill(name);
  await dialog.getByLabel("Kısa ad").fill(`e2e-davutpasa-${fixture.tail}`);
  await expect(submit).toBeDisabled();
  await chooseOption(
    page,
    dialog.getByRole("combobox").nth(0),
    "Akaid ve kelâm"
  );
  await chooseOption(page, dialog.getByRole("combobox").nth(1), "Başlangıç");
  await dialog
    .getByRole("textbox", { name: "Etiketler" })
    .fill("Akaid, Kelâm ,  Akaid-i Nesefî");
  await dialog
    .getByRole("textbox", { name: "Açıklama" })
    .fill("Akaid ve kelâm metinlerini şerhleriyle okuyan bir köşk.");
  await dialog.getByRole("radio", { name: "Zümrüt" }).check();
  await dialog.getByRole("checkbox", { name: "Listelerde gösterme" }).check();
  // everything but the nazım: still off (criterion 1)
  await expect(submit).toBeDisabled();

  // the nazım is found by exact e-mail in the realm's directory
  const search = dialog.getByRole("textbox", {
    name: "Köşk nazımı",
    exact: true,
  });
  await search.fill(TALEBE.email as string);
  await search.press("Enter");
  await expect(dialog.getByTestId("chosen-nazims")).toContainText(
    TALEBE.email as string
  );
  // choosing the same person again adds nobody (criterion 4)
  await search.fill(TALEBE.email as string);
  await search.press("Enter");
  await expect(dialog.getByText("Bu kişi zaten seçildi.")).toBeVisible();
  await expect(dialog.getByTestId("chosen-nazims").locator("li")).toHaveCount(
    1
  );
  await shot(page, "10-kosk-ac-dolu");

  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByText("Köşk açıldı")).toBeVisible();
  await expect(dialog).toBeHidden();

  // criterion 5: the new köşk is in the list, with its nazım; unlisted (criterion 3)
  const row = rowOf(page, name);
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Listelenmeyen");
  await expect(row).toContainText("Akaid ve kelâm");
  await expect(row).not.toContainText("Siz");
  const made = await fixture.koskByName(name);
  expect(made).not.toBeNull();
  const saved = await fixture.kosk((made as { id: string }).id);
  // criterion 2: the tags are a trimmed list
  expect(saved?.tags).toEqual(["Akaid", "Kelâm", "Akaid-i Nesefî"]);
  expect(saved?.isPrivate).toBe(true);
  expect(saved?.level).toBe("BEGINNER");
  const nazims = await fixture.nazims((made as { id: string }).id);
  expect(nazims.map((n) => n.userId)).toEqual([TALEBE.sub]);
  expect(nazims[0]?.grantedBy).toBe(SYSTEM_ADMIN.sub);
  expect(await fixture.audits("kosk.create")).toBe(1);
});

test("nizam/10 — the form says what is missing, and a short name another köşk uses is refused under its own field", async ({
  page,
}) => {
  test.skip(!(seedable && SYSTEM_ADMIN.password), "no SYSTEM_ADMIN account");
  await signIn(page, SYSTEM_ADMIN);
  await openTable(page, `?q=${fixture.tail}`);
  await page.getByRole("button", { name: "Köşk aç" }).first().click();
  const dialog = dialogOf(page);

  // an untouched field is not blamed; leaving it is
  await dialog.getByRole("textbox", { name: "Ad", exact: true }).focus();
  await dialog.getByRole("textbox", { name: "Kısa ad" }).focus();
  await expect(dialog.getByText("Bir ad yazın.")).toBeVisible();
  await dialog.getByRole("textbox", { name: "Kısa ad" }).fill("Davut Paşa");
  await dialog.getByRole("textbox", { name: "Etiketler" }).focus();
  await expect(
    dialog.getByText(/Kısa ad küçük harf, rakam ve tire/)
  ).toBeVisible();
  await dialog.getByRole("textbox", { name: "Kısa ad" }).fill("");

  // a taken short name: the server answers 409
  await dialog
    .getByRole("textbox", { name: "Ad", exact: true })
    .fill(`E2E İkinci Köşk ${fixture.tail}`);
  await dialog
    .getByRole("textbox", { name: "Kısa ad" })
    .fill(fixture.fatih.handle);
  await chooseOption(page, dialog.getByRole("combobox").nth(0), "Fıkıh");
  await chooseOption(page, dialog.getByRole("combobox").nth(1), "Orta");
  const search = dialog.getByRole("textbox", {
    name: "Köşk nazımı",
    exact: true,
  });
  await search.fill(TALEBE.email as string);
  await search.press("Enter");
  await expect(dialog.getByTestId("chosen-nazims")).toBeVisible();
  await dialog.getByRole("button", { name: "Köşk aç" }).click();
  await expect(
    dialog.getByText(
      `@${fixture.fatih.handle} kısa adını başka bir köşk kullanıyor.`
    )
  ).toBeVisible();
  expect(
    await fixture.koskByName(`E2E İkinci Köşk ${fixture.tail}`)
  ).toBeNull();
});

test("nizam/24 — Köşk ayarları opens with the köşk's values and a read-only short name, refuses an empty name without a request and saves what changed (criteria 1-3)", async ({
  page,
}) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no KOSK_NAZIM account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.beyazit.id}/ayarlar`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Köşk ayarları" })
  ).toBeVisible();
  await shot(page, "24-ayarlar");

  const settings = page.getByTestId("kosk-settings");
  const name = settings.getByRole("textbox", { name: "Ad", exact: true });
  await expect(name).toHaveValue(fixture.beyazit.name);
  const handle = settings.getByRole("textbox", { name: "Kısa ad" });
  await expect(handle).toHaveValue(`@${fixture.beyazit.handle}`);
  await expect(handle).toHaveJSProperty("readOnly", true);
  const save = settings.getByRole("button", { name: "Kaydet" });
  await expect(save).toBeDisabled();

  // criterion 2: an empty name is refused and no request is made
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") requests.push(r.url());
  });
  await name.fill("");
  await save.click();
  await expect(settings.getByText("Bir ad yazın.")).toBeVisible();
  expect(requests).toHaveLength(0);
  expect((await fixture.kosk(fixture.beyazit.id))?.name).toBe(
    fixture.beyazit.name
  );

  // criterion 3: what is saved is what is read back
  const renamed = `${fixture.beyazit.name} II`;
  await name.fill(renamed);
  await settings
    .getByRole("textbox", { name: "Etiketler" })
    .fill("Hadis, Mustalah ");
  await settings.getByRole("radio", { name: "Bordo" }).check();
  await settings
    .getByRole("textbox", { name: "Açıklama" })
    .fill("Hadis usûlü okuyan köşk.");
  await settings
    .getByRole("checkbox", { name: "Kayıt her zaman onaylı" })
    .check();
  await settings
    .getByRole("checkbox", { name: "Ders kayıtları herkese açılamaz" })
    .check();
  await save.click();
  await expect(page.getByText("Ayarlar kaydedildi")).toBeVisible();
  await expect(save).toBeDisabled();
  const saved = await fixture.kosk(fixture.beyazit.id);
  expect(saved).toMatchObject({
    name: renamed,
    tags: ["Hadis", "Mustalah"],
    description: "Hadis usûlü okuyan köşk.",
    alwaysRequireApproval: true,
    recordingsNeverPublic: true,
    isPrivate: false,
  });
  expect(saved?.coverHue).toBe(20);

  // a reload shows the same
  await page.reload();
  await expect(name).toHaveValue(renamed);
  await expect(
    settings.getByRole("checkbox", { name: "Kayıt her zaman onaylı" })
  ).toBeChecked();
  await expect(settings.getByRole("radio", { name: "Bordo" })).toBeChecked();

  // 'Vazgeç' puts the köşk's values back
  await name.fill("Başka bir ad");
  await settings.getByRole("button", { name: "Vazgeç" }).click();
  await expect(name).toHaveValue(renamed);
});

test("nizam/24 — 'Listelerde gösterme' takes the köşk out of the open list (criterion 4)", async ({
  page,
  request,
}) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no KOSK_NAZIM account");
  const listed = async () => {
    const res = await request.get(`${API}/kosks?limit=50`);
    const body = (await res.json()) as { items: { id: string }[] };
    return body.items.some((k) => k.id === fixture.beyazit.id);
  };
  expect(await listed()).toBe(true);
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.beyazit.id}/ayarlar`);
  const settings = page.getByTestId("kosk-settings");
  await settings.getByRole("checkbox", { name: "Listelerde gösterme" }).check();
  await settings.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Ayarlar kaydedildi")).toBeVisible();
  expect(await listed()).toBe(false);
  expect((await fixture.kosk(fixture.beyazit.id))?.isPrivate).toBe(true);
});

test("nizam/24 — 'Köşkü gizle' asks first, hides the köşk with its courses and leaves it with the başnazım to bring back (criterion 6)", async ({
  page,
  request,
}) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no KOSK_NAZIM account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.beyazit.id}/ayarlar`);
  await page.getByRole("button", { name: "Köşkü gizle" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText(
    `${fixture.beyazit.name} talebelerden, müderrislerden, medreselerden ve ziyaretçilerden gizlenecek`
  );
  await shot(page, "24-gizle");
  // "Vazgeç" has the focus, and cancelling hides nothing
  await expect(confirm.getByRole("button", { name: "Vazgeç" })).toBeFocused();
  await confirm.getByRole("button", { name: "Vazgeç" }).click();
  expect((await fixture.kosk(fixture.beyazit.id))?.hidden).toBe(false);

  await page.getByRole("button", { name: "Köşkü gizle" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Gizle" })
    .click();
  await expect(page).toHaveURL(/\/tr\/kosks(\?|$)/);
  expect((await fixture.kosk(fixture.beyazit.id))?.hidden).toBe(true);
  expect(await fixture.audits("kosk.hide")).toBe(1);

  // nobody but its nazımları finds it: not in the open list, a 404 by link
  const open = await request.get(`${API}/kosks?limit=50`);
  const body = (await open.json()) as { items: { id: string }[] };
  expect(body.items.some((k) => k.id === fixture.beyazit.id)).toBe(false);
  expect(
    (await request.get(`${API}/kosks/${fixture.beyazit.id}`)).status()
  ).toBe(404);

  // the nazım sees it among the hidden ones, and brings back what they hid themselves
  // (a köşk Medaris yönetimi hid would show who hid it instead of a button, MDRS-143)
  await page.goto(`/tr/kosks?q=${fixture.tail}&durum=gizli`);
  await expect(rowOf(page, fixture.beyazit.name)).toContainText("Gizli");
  await expect(page.getByRole("button", { name: /^Geri al/ })).toHaveCount(1);
});

test("nizam/25 — the nazım list is read-only: who, who gave the post, when, until when, and 'Siz' (criteria 1-3)", async ({
  page,
}) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no KOSK_NAZIM account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.beyazit.id}/ayarlar/nazimlar`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Köşk nazımları" })
  ).toBeVisible();
  await shot(page, "25-nazimlar");

  const view = page.getByTestId("kosk-nazims");
  const rows = view.locator("tbody tr:visible");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Siz");
  await expect(rows.first()).toContainText("Medaris başnazımı");
  await expect(rows.first()).toContainText("25 Ağustos 2026");
  await expect(rows.first()).toContainText("Süresiz");

  // criterion 2: nothing to add or remove
  await expect(
    view
      .getByText(
        "Köşk nazımlarını Medaris yönetimi atar; bu listeyi buradan değiştiremezsiniz."
      )
      .first()
  ).toBeVisible();
  await expect(
    view.getByRole("button", { name: "Köşk nazımı ekle" })
  ).toHaveCount(0);
  await expect(view.getByRole("button", { name: /Çıkar/ })).toHaveCount(0);

  // what a köşk nazımı can do, and the tab strip
  await expect(
    view.getByRole("heading", { name: "Köşk nazımı bu köşkte" })
  ).toBeVisible();
  await expect(view.getByRole("link", { name: /Genel/ })).toHaveAttribute(
    "href",
    `/tr/kosks/${fixture.beyazit.id}/ayarlar`
  );
});

test("nizam/25 — a köşk nazımı who does not manage the köşk gets the 403 screen (criterion 4)", async ({
  page,
}) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no KOSK_NAZIM account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.fatih.id}/ayarlar/nazimlar`);
  await expect(page.getByText("Bu bölüm için izniniz yok")).toBeVisible();
  await page.goto(`/tr/kosks/${fixture.fatih.id}/ayarlar`);
  await expect(page.getByText("Bu bölüm için izniniz yok")).toBeVisible();
});

test("nizam/21 — the başnazım adds a köşk nazımı by e-mail: the dialog, the row, the audit entry, and nothing twice (criteria 1-5)", async ({
  page,
}) => {
  test.skip(
    !(seedable && SYSTEM_ADMIN.password && TALEBE.email),
    "no SYSTEM_ADMIN or TALEBE account"
  );
  await signIn(page, SYSTEM_ADMIN);
  await page.goto(`/tr/kosks/${fixture.beyazit.id}/ayarlar/nazimlar`);
  const view = page.getByTestId("kosk-nazims");
  await expect(view.locator("tbody tr:visible")).toHaveCount(1);

  // criterion 1: the dialog opens with the first field ready, 'Ekle' off
  await view.getByRole("button", { name: "Köşk nazımı ekle" }).click();
  const dialog = dialogOf(page);
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(fixture.beyazit.name, { exact: true })
  ).toBeVisible();
  const add = dialog.getByRole("button", { name: "Ekle" });
  await expect(add).toBeDisabled();
  await shot(page, "21-dialog-bos");

  // an address no account has
  const search = dialog.getByRole("textbox", {
    name: "Köşk nazımı",
    exact: true,
  });
  await search.fill(`kimse.${fixture.tail}@example.test`);
  await search.press("Enter");
  await expect(
    dialog.getByText("Bu e-posta adresiyle kayıtlı bir hesap bulunamadı.")
  ).toBeVisible();
  await expect(add).toBeDisabled();

  // criterion 2: a real account is found, listed, and 'Ekle' turns on
  await search.fill(TALEBE.email as string);
  await search.press("Enter");
  await expect(dialog.getByTestId("chosen-nazims")).toContainText(
    TALEBE.email as string
  );
  await expect(add).toBeEnabled();
  await shot(page, "21-dialog-dolu");

  // criterion 4: no end date means 'Süresiz'
  await add.click();
  await expect(page.getByText("Köşk nazımı eklendi")).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(view.locator("tbody tr:visible")).toHaveCount(2);
  const added = view.locator("tbody tr:visible").nth(1);
  await expect(added).toContainText("Süresiz");
  await expect(added).toContainText("Medaris başnazımı");

  // criterion 3: persisted, with one audit entry
  const nazims = await fixture.nazims(fixture.beyazit.id);
  expect(nazims.map((n) => n.userId)).toContain(TALEBE.sub);
  expect(nazims.find((n) => n.userId === TALEBE.sub)?.endsAt).toBeNull();
  expect(await fixture.audits("kosk.nazim.add")).toBe(1);
  await page.reload();
  await expect(view.locator("tbody tr:visible")).toHaveCount(2);

  // criterion 5: the same person cannot be added twice
  await view.getByRole("button", { name: "Köşk nazımı ekle" }).click();
  const again = dialogOf(page);
  await again
    .getByRole("textbox", { name: "Köşk nazımı", exact: true })
    .fill(TALEBE.email as string);
  await again
    .getByRole("textbox", { name: "Köşk nazımı", exact: true })
    .press("Enter");
  await again.getByRole("button", { name: "Ekle" }).click();
  await expect(
    page.getByText("Seçilen kişi zaten bu köşkün nazımı.")
  ).toBeVisible();
  expect((await fixture.nazims(fixture.beyazit.id)).length).toBe(2);
});

test("nizam/21 — an end date is kept and shown, and one in the past cannot be chosen", async ({
  page,
}) => {
  test.skip(
    !(seedable && SYSTEM_ADMIN.password && TALEBE.email),
    "no SYSTEM_ADMIN or TALEBE account"
  );
  await signIn(page, SYSTEM_ADMIN);
  await page.goto(`/tr/kosks/${fixture.fatih.id}/ayarlar/nazimlar`);
  const view = page.getByTestId("kosk-nazims");
  await view.getByRole("button", { name: "Köşk nazımı ekle" }).click();
  const dialog = dialogOf(page);
  const search = dialog.getByRole("textbox", {
    name: "Köşk nazımı",
    exact: true,
  });
  await search.fill(TALEBE.email as string);
  await search.press("Enter");
  await expect(dialog.getByTestId("chosen-nazims")).toBeVisible();

  // a past moment is refused under the field and 'Ekle' stays off
  const end = dialog.getByRole("textbox", {
    name: "Görev bitiş tarihi ve saati (isteğe bağlı)",
  });
  await end.fill("2020-01-01T12:00");
  await expect(
    dialog.getByText("Bitiş zamanı şu andan sonra olmalı.")
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Ekle" })).toBeDisabled();

  const inThirty = `${new Date(Date.now() + 30 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10)}T12:00`;
  await end.fill(inThirty);
  await dialog.getByRole("button", { name: "Ekle" }).click();
  await expect(page.getByText("Köşk nazımı eklendi")).toBeVisible();
  const row = view
    .locator("tbody tr:visible")
    .filter({ hasText: "Medaris başnazımı" })
    .last();
  await expect(row).not.toContainText("Süresiz");
  const mine = (await fixture.nazims(fixture.fatih.id)).find(
    (n) => n.userId === TALEBE.sub
  );
  expect(mine?.endsAt?.toISOString().slice(0, 10)).toBe(inThirty);
});

// The screen only: the browser holds no bearer token, so this spec cannot call
// the API as the köşk nazımı. That `POST /kosks/:id/nazims` is a 403 for them is
// tedrisat's `kosk-admin.e2e.spec.ts` ("is the başnazım's alone").
test("nizam/21 — a köşk nazımı gets no 'Köşk nazımı ekle' (criterion 6)", async ({
  page,
}) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no KOSK_NAZIM account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.beyazit.id}/ayarlar/nazimlar`);
  await expect(
    page.getByRole("button", { name: "Köşk nazımı ekle" })
  ).toHaveCount(0);
});
