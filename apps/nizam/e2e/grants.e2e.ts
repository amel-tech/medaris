import { expect, type Page, test } from "@playwright/test";
import { type GrantsFixture, seedGrants } from "./grants-seed";

/**
 * Design nizam/38 (köşk kapsamında izin ver) against the running app and API,
 * with real Keycloak sign-ins (MDRS-172). A spec whose account is not in the
 * environment (E2E_<ROLE>_EMAIL, _PASSWORD, _SUB) is skipped. The page is the
 * köşk nazımı's; the e-mail search of "Ders nazırı ata" goes to the real realm
 * directory through `tedrisat-admin`.
 */
const account = (role: string) => ({
  email: process.env[`E2E_${role}_EMAIL`],
  password: process.env[`E2E_${role}_PASSWORD`],
  sub: process.env[`E2E_${role}_SUB`],
});
const KOSK_NAZIM = account("KOSK_NAZIM");
const MEDARIS_NAZIM = account("MEDARIS_NAZIM");
const TALEBE = account("TALEBE");

const seedable = Boolean(KOSK_NAZIM.sub && process.env.E2E_DATABASE_URL);
let fixture: GrantsFixture;

// The screen shows moments in the browser's zone unless the account has one:
// pinned, the end dates below mean the same instant on any machine (MDRS-254).
test.use({ timezoneId: "Europe/Istanbul" });

test.beforeEach(async () => {
  if (!seedable) return;
  fixture = await seedGrants({ nazim: KOSK_NAZIM.sub as string });
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

// `:visible`: while a navigation streams in, Next keeps the finished page in a
// hidden node beside the one on screen, so a row can briefly exist twice.
const rowOf = (page: Page, text: string) =>
  page
    .locator("[data-testid=grants] tbody tr:visible")
    .filter({ hasText: text });

const openGrants = async (page: Page, koskId = fixture.kosk.id) => {
  await page.goto(`/tr/kosks/${koskId}/izinler`);
  await expect(
    page.getByRole("heading", { level: 1, name: "İzinler" })
  ).toBeVisible();
};

const box = (scope: ReturnType<Page["locator"]>, name: string) =>
  scope.getByRole("checkbox", { name, exact: true });

const SESSION_MANAGE =
  "Celse ekle, tarihini değiştir, iptal et; toplantı bağlantısını gir";
const LIVE_LINK = "Canlı yayın bağlantısını celseye ekle";
const WEEK_HIDE = "Hafta ve celse gizle, geri al";
const RECORDING = "Ders kaydı ekle, adlandır, gizle; görünürlüğünü değiştir";
const ENROLLMENT = "Başvuruyu onayla ya da reddet";

const daysFromNow = (n: number) => {
  const d = new Date(Date.now() + n * 24 * 3600 * 1000);
  return `${d.toISOString().slice(0, 10)}T12:00`;
};

test("nizam/38 — the list shows each ders nazırı with course, permission summary, end and giver, and names the medrese courses (criterion 1)", async ({
  page,
}) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no KOSK_NAZIM account");
  await signIn(page, KOSK_NAZIM);
  await openGrants(page);

  const row = rowOf(page, fixture.existing.name);
  await expect(rowOf(page, "")).toHaveCount(1);
  await expect(row).toContainText(fixture.existing.email);
  await expect(row).toContainText(fixture.courses.emsile.title);
  await expect(row.getByTestId("permission-count")).toHaveText("3 izin");
  await expect(row.getByTestId("permission-names")).toHaveText(
    "Celseler, canlı yayın, hafta ve celse gizleme"
  );
  await expect(row).toContainText("31 Aralık 2026");
  await expect(row).toContainText("Görev ve izinler aynı gün biter.");
  await expect(row).toContainText("(siz)");
  await expect(row).toContainText("14 Eylül 2026");
  await expect(page.getByTestId("grant-count")).toHaveText("1 kişi");

  // the medrese's course is not a post to make: it is named in the note
  const note = page.getByTestId("madrasah-note");
  await expect(note).toContainText(fixture.courses.medrese.title);
  await expect(note).toContainText("medrese kadrosu verir");

  // the menu's İzinler is the page
  await expect(
    page.locator("nav a", { hasText: "İzinler" }).first()
  ).toHaveAttribute("aria-current", "page");
});

test("nizam/38 — a Medaris nazımı gets the 'izniniz yok' screen, not the list", async ({
  page,
}) => {
  test.skip(
    !(seedable && MEDARIS_NAZIM.sub && MEDARIS_NAZIM.password),
    "no MEDARIS_NAZIM account"
  );
  await fixture.makeMedarisNazim(MEDARIS_NAZIM.sub as string);
  await signIn(page, MEDARIS_NAZIM);
  await page.goto(`/tr/kosks/${fixture.kosk.id}/izinler`);
  await expect(page.getByText("Bu bölüm için izniniz yok")).toBeVisible();
  await expect(page.getByTestId("grants")).toHaveCount(0);
});

test("nizam/38 — a köşk that is not there looks the same", async ({ page }) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no KOSK_NAZIM account");
  await signIn(page, KOSK_NAZIM);
  await page.goto("/tr/kosks/00000000-0000-4000-8000-0000000000ff/izinler");
  await expect(page.getByText("Bu bölüm için izniniz yok")).toBeVisible();
});

test("nizam/38 — 'Ders nazırı ata' finds the person by e-mail, offers only medrese-free courses and the course permissions, and the post ends on the day typed (criteria 1, 5)", async ({
  page,
}) => {
  test.skip(
    !(seedable && KOSK_NAZIM.password && TALEBE.email && TALEBE.sub),
    "no KOSK_NAZIM or TALEBE account"
  );
  await signIn(page, KOSK_NAZIM);
  await openGrants(page);
  const before = await fixture.audits("course_nazir.assign");

  await page.getByRole("button", { name: "Ders nazırı ata" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Ders nazırı ata" });
  const save = dialog.getByRole("button", { name: "Kaydet" });
  await expect(save).toBeDisabled();

  // only what a köşk nazımı holds is offered: the 18 course permissions
  await expect(dialog.getByRole("checkbox")).toHaveCount(18);

  const email = dialog.getByRole("textbox", { name: /^Ders nazırı/ });
  await email.fill("kimse-yok-boyle@example.test");
  await email.press("Enter");
  await expect(
    dialog.getByText("Bu e-posta adresiyle kayıtlı bir hesap bulunamadı.")
  ).toBeVisible();
  await email.fill(TALEBE.email as string);
  await email.press("Enter");
  await expect(dialog.getByTestId("chosen-head")).toBeVisible();
  await expect(save).toBeDisabled();

  // only the köşk's own courses: the medrese's course is not in the list
  await dialog.getByRole("combobox").click();
  await expect(
    page.getByRole("option", { name: fixture.courses.medrese.title })
  ).toHaveCount(0);
  await expect(
    page.getByRole("option", { name: fixture.courses.emsile.title })
  ).toBeVisible();
  await page.getByRole("option", { name: fixture.courses.nahiv.title }).click();
  await expect(save).toBeDisabled();

  await box(dialog, SESSION_MANAGE).click();
  await box(dialog, ENROLLMENT).click();
  await expect(dialog.locator(".mds-dialog__meta")).toHaveText("2 izin seçili");
  await expect(save).toBeEnabled();

  const end = daysFromNow(45);
  await dialog.getByLabel("Bitiş tarihi ve saati (isteğe bağlı)").fill(end);
  await save.click();
  await expect(dialog).toBeHidden();

  const row = rowOf(page, fixture.courses.nahiv.title);
  await expect(row).toHaveCount(1);
  await expect(row.getByTestId("permission-count")).toHaveText("2 izin");
  await expect(row).toContainText("(siz)");

  const held = await fixture.held(
    TALEBE.sub as string,
    fixture.courses.nahiv.id
  );
  expect(held.post?.grantedBy).toBe(KOSK_NAZIM.sub);
  expect(held.permissions).toEqual(["enrollment.decide", "session.manage"]);
  // the post and each permission end at the same instant, the moment typed
  const endIso = held.post?.expiresAt?.toISOString();
  expect(endIso?.slice(0, 10)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  for (const e of held.grantExpiries) {
    expect(e?.toISOString()).toBe(endIso);
  }
  expect(await fixture.audits("course_nazir.assign")).toBe(before + 1);
});

test("nizam/38 — 'İzinleri düzenle' starts from what the person holds and changes it, keeping the rest (criterion 3)", async ({
  page,
}) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no KOSK_NAZIM account");
  await signIn(page, KOSK_NAZIM);
  await openGrants(page);

  await rowOf(page, fixture.existing.name)
    .getByRole("button", { name: /İzinleri düzenle/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "İzinleri düzenle" });
  await expect(dialog.getByTestId("grant-card")).toContainText(
    fixture.existing.name
  );
  // nothing to pick about the person or the course
  await expect(dialog.getByRole("combobox")).toHaveCount(0);
  for (const title of [SESSION_MANAGE, LIVE_LINK, WEEK_HIDE]) {
    await expect(box(dialog, title)).toBeChecked();
  }
  await expect(
    dialog.getByLabel("Bitiş tarihi ve saati (isteğe bağlı)")
  ).toHaveValue("2026-12-31T23:59");
  await expect(dialog.locator(".mds-dialog__meta")).toHaveText("3 izin seçili");

  await box(dialog, LIVE_LINK).click();
  await box(dialog, RECORDING).click();
  await dialog
    .getByLabel("Bitiş tarihi ve saati (isteğe bağlı)")
    .fill("2026-11-15T12:00");
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(dialog).toBeHidden();

  const row = rowOf(page, fixture.existing.name);
  await expect(row.getByTestId("permission-count")).toHaveText("3 izin");
  await expect(row.getByTestId("permission-names")).toContainText(
    "ders kayıtları"
  );
  await expect(row.getByTestId("permission-names")).not.toContainText(
    "canlı yayın"
  );
  await expect(row).toContainText("15 Kasım 2026");

  const held = await fixture.held(
    fixture.existing.id,
    fixture.courses.emsile.id
  );
  expect(held.permissions).toEqual([
    "recording.manage",
    "session.manage",
    "week.hide",
  ]);
  const endIso = held.post?.expiresAt?.toISOString();
  expect(endIso).toMatch(/^2026-11-15T/);
  for (const e of held.grantExpiries) expect(e?.toISOString()).toBe(endIso);
  expect(await fixture.audits("course_nazir.update")).toBe(1);
});

test("nizam/38 — a stray click on the scrim does not lose the boxes, and an end date that is not in the future is refused where it is typed", async ({
  page,
}) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no KOSK_NAZIM account");
  await signIn(page, KOSK_NAZIM);
  await openGrants(page);
  await rowOf(page, fixture.existing.name)
    .getByRole("button", { name: /İzinleri düzenle/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "İzinleri düzenle" });
  await page.mouse.click(5, 5);
  await expect(dialog).toBeVisible();

  const end = dialog.getByLabel("Bitiş tarihi ve saati (isteğe bağlı)");
  await end.fill("2020-01-01T12:00");
  await expect(
    dialog.getByText("Bitiş zamanı şu andan sonra olmalı.")
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Kaydet" })).toBeDisabled();

  // no permission, no save
  await end.fill("2026-12-31T12:00");
  for (const title of [SESSION_MANAGE, LIVE_LINK, WEEK_HIDE]) {
    await box(dialog, title).click();
  }
  await expect(dialog.getByRole("button", { name: "Kaydet" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("nizam/38 — before 4 Ekim 'Görevden al' is off, and nothing is said about why", async ({
  page,
}) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no KOSK_NAZIM account");
  // the real clock of the run is 2 Ekim 2026; pin it so the spec says what it means
  await page.clock.setFixedTime(new Date("2026-10-02T09:00:00+03:00"));
  await signIn(page, KOSK_NAZIM);
  await openGrants(page);
  await expect(
    page.getByRole("button", {
      name: `Görevden al: ${fixture.existing.name}`,
    })
  ).toBeDisabled();
  await expect(page.getByText(/4 Ekim|sürüm/i)).toHaveCount(0);
});

test("nizam/38 — after the gate 'Görevden al' ends the post and every permission at once, and 'Vazgeç' changes nothing (criterion 4)", async ({
  page,
}) => {
  test.skip(!(seedable && KOSK_NAZIM.password), "no KOSK_NAZIM account");
  await page.clock.setFixedTime(new Date("2026-10-05T10:00:00+03:00"));
  await signIn(page, KOSK_NAZIM);
  await openGrants(page);
  const open = () =>
    page
      .getByRole("button", { name: `Görevden al: ${fixture.existing.name}` })
      .click();

  await open();
  const dialog = page.getByRole("dialog", { name: "Görevden al" });
  // Vazgeç has the focus and the scrim does not close it
  await expect(dialog.getByRole("button", { name: "Vazgeç" })).toBeFocused();
  await page.mouse.click(5, 5);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Vazgeç" }).click();
  await expect(dialog).toBeHidden();
  expect(
    (await fixture.held(fixture.existing.id, fixture.courses.emsile.id)).post
  ).not.toBeNull();

  await open();
  await expect(dialog).toContainText(fixture.courses.emsile.title);
  await dialog
    .getByRole("button", { name: "Görevden al", exact: true })
    .click();
  await expect(dialog).toBeHidden();

  await expect(rowOf(page, fixture.existing.name)).toHaveCount(0);
  await expect(page.getByText("Henüz ders nazırı yok.")).toBeVisible();
  const held = await fixture.held(
    fixture.existing.id,
    fixture.courses.emsile.id
  );
  expect(held.post).toBeNull();
  expect(held.permissions).toEqual([]);
  expect(
    await fixture.posts(fixture.existing.id, fixture.courses.emsile.id)
  ).toEqual([{ revoked: true, revokedBy: KOSK_NAZIM.sub }]);
  expect(await fixture.audits("course_nazir.revoke")).toBe(1);
});
