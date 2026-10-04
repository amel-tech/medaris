import { expect, type Page, test } from "@playwright/test";
import { type PermissionsFixture, seedPermissions } from "./permissions-seed";

/**
 * Designs nizam/11 (Medaris nazımları), nizam/12 (İzin ver) and nizam/13 (İzin
 * grupları) against the running app and API, with real Keycloak sign-ins
 * (MDRS-171). A spec whose account is not in the environment
 * (E2E_<ROLE>_EMAIL, _PASSWORD, _SUB) is skipped. These pages are the Medaris
 * başnazımı's, so those specs sign in as the account that holds the
 * SYSTEM_ADMIN realm role; the e-mail lookup of the appointment goes to the
 * real realm directory through `tedrisat-admin`.
 */
const account = (role: string) => ({
  email: process.env[`E2E_${role}_EMAIL`],
  password: process.env[`E2E_${role}_PASSWORD`],
  sub: process.env[`E2E_${role}_SUB`],
});
const SYSTEM_ADMIN = account("SYSTEM_ADMIN");
const MEDARIS_NAZIM = account("MEDARIS_NAZIM");
const KOSK_NAZIM = account("KOSK_NAZIM");

const seedable = Boolean(process.env.E2E_DATABASE_URL);
let fixture: PermissionsFixture;

// The screen shows moments in the browser's zone unless the account has one:
// pinned, the end dates below mean the same instant on any machine (MDRS-254).
test.use({ timezoneId: "Europe/Istanbul" });

test.beforeEach(async () => {
  if (!seedable) return;
  fixture = await seedPermissions();
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
    .locator("[data-testid=nazims] tbody tr:visible")
    .filter({ hasText: text });

const openNazims = async (page: Page) => {
  await page.goto("/tr/medaris-nazimlari");
  await expect(
    page.getByRole("heading", { level: 1, name: "Medaris nazımları" })
  ).toBeVisible();
};

const openGroups = async (page: Page, query = "") => {
  await page.goto(`/tr/izin-gruplari${query}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "İzin grupları" })
  ).toBeVisible();
};

const formOf = (page: Page) => page.locator("[data-testid=group-form]:visible");

const groupItem = (page: Page, name: string) =>
  page.locator("[data-testid=group-item]:visible").filter({ hasText: name });

const box = (scope: ReturnType<Page["locator"]>, name: string) =>
  scope.getByRole("checkbox", { name, exact: true });

const chooseOption = async (
  page: Page,
  scope: ReturnType<Page["locator"]>,
  name: string | RegExp
) => {
  await scope.getByRole("combobox").first().click();
  await page.getByRole("option", { name }).click();
};

const daysFromNow = (n: number) => {
  const d = new Date(Date.now() + n * 24 * 3600 * 1000);
  return `${d.toISOString().slice(0, 10)}T12:00`;
};

test("nizam/11 — the list shows who is in office, in order, with their groups, single permissions, end and giver (criteria 1, 2, 3)", async ({
  page,
}) => {
  test.skip(!(seedable && SYSTEM_ADMIN.password), "no SYSTEM_ADMIN account");
  await signIn(page, SYSTEM_ADMIN);
  await openNazims(page);

  const hasan = rowOf(page, fixture.hasan.name);
  const rabia = rowOf(page, fixture.rabia.name);
  const seyyid = rowOf(page, fixture.seyyid.name);

  // the lapsed appointment is not in the list
  await expect(rowOf(page, fixture.lapsed.name)).toHaveCount(0);
  await expect(hasan).toHaveCount(1);

  // the API's order: appointed 14, 15, 22 September
  const names = await page
    .locator("[data-testid=nazims] tbody tr:visible th")
    .allInnerTexts();
  const mine = names
    .map((n) =>
      [fixture.hasan, fixture.rabia, fixture.seyyid].findIndex((p) =>
        n.includes(p.name)
      )
    )
    .filter((i) => i >= 0);
  expect(mine).toEqual([0, 1, 2]);

  await expect(hasan).toContainText(fixture.hasan.email);
  await expect(hasan).toContainText(fixture.groups.koskIsleri.name);
  await expect(hasan).toContainText(fixture.groups.dersDenetimi.name);
  await expect(hasan).toContainText("her ders");
  await expect(hasan).toContainText(
    "ve Medrese aç, Desteyi herkese yayımla, Platformdan yasakla"
  );
  await expect(hasan).toContainText("31 Aralık 2026");
  await expect(hasan).toContainText("Yusuf Ziya Ertuğrul");
  await expect(hasan).toContainText("14 Eylül 2026");

  await expect(rabia).toContainText(fixture.groups.denetim.name);
  await expect(rabia.getByTestId("days-left")).toHaveText(/^1[34] gün kaldı$/);

  await expect(seyyid).toContainText("Süresiz");
  await expect(seyyid).toContainText(
    "Pasif kapsamları yönet, YouTube bağlantısını yönet"
  );
  await expect(page.getByTestId("nazim-count")).toContainText(/\d kişi/);
});

test("nizam/11 — a Medaris nazımı gets the 'izniniz yok' screen on both pages, not the list (criterion 4)", async ({
  page,
}) => {
  test.skip(
    !(seedable && MEDARIS_NAZIM.sub && MEDARIS_NAZIM.password),
    "no MEDARIS_NAZIM account"
  );
  await fixture.makeMedarisNazim(MEDARIS_NAZIM.sub as string);
  await signIn(page, MEDARIS_NAZIM);
  for (const path of ["/tr/medaris-nazimlari", "/tr/izin-gruplari"]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: "Bu bölüm için izniniz yok" })
    ).toBeVisible();
    await expect(page.getByTestId("nazims")).toHaveCount(0);
    await expect(page.getByTestId("groups")).toHaveCount(0);
  }
});

test("nizam/11 — before 4 Ekim 'Görevden al' is off on every row, and nothing is said about why", async ({
  page,
}) => {
  test.skip(!(seedable && SYSTEM_ADMIN.password), "no SYSTEM_ADMIN account");
  // the real clock of the run is 2 Ekim 2026; pin it so the spec says what it means
  await page.clock.setFixedTime(new Date("2026-10-02T09:00:00+03:00"));
  await signIn(page, SYSTEM_ADMIN);
  await openNazims(page);
  for (const person of [fixture.hasan, fixture.rabia, fixture.seyyid]) {
    await expect(
      page.getByRole("button", { name: `Görevden al: ${person.name}` })
    ).toBeDisabled();
  }
  await expect(page.getByText(/4 Ekim|sürüm/i)).toHaveCount(0);
});

test("nizam/11 — after the gate 'Görevden al' asks what to do with what the person handed on, and removes them (criterion 5)", async ({
  page,
}) => {
  test.skip(
    !(seedable && SYSTEM_ADMIN.sub && SYSTEM_ADMIN.password),
    "no SYSTEM_ADMIN account"
  );
  await page.clock.setFixedTime(new Date("2026-10-05T10:00:00+03:00"));
  await signIn(page, SYSTEM_ADMIN);
  await openNazims(page);

  const before = await fixture.audits("medaris_nazim.dismiss");
  await page
    .getByRole("button", { name: `Görevden al: ${fixture.hasan.name}` })
    .click();
  const dialog = page.getByRole("dialog", { name: "Görevden al" });
  const submit = dialog.getByRole("button", {
    name: "Görevden al",
    exact: true,
  });

  // Vazgeç has the focus; the scrim does not close it; nothing is chosen for the başnazım
  await expect(dialog.getByRole("button", { name: "Vazgeç" })).toBeFocused();
  await page.mouse.click(5, 5);
  await expect(dialog).toBeVisible();
  const item = dialog.getByTestId("given-item");
  await expect(item).toHaveCount(1);
  await expect(item).toContainText("Köşk nazımı");
  await expect(item).toContainText(fixture.handedOn.name);
  await expect(item).toContainText(fixture.koskName);
  await expect(submit).toBeDisabled();

  await item.getByRole("button", { name: "Devral" }).click();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(dialog).toBeHidden();

  await expect(rowOf(page, fixture.hasan.name)).toHaveCount(0);
  await expect(rowOf(page, fixture.rabia.name)).toHaveCount(1);
  expect(await fixture.heldNazim(fixture.hasan.id)).toBe(false);
  expect(
    (await fixture.grantsOf(fixture.hasan.id)).every((g) => g.revoked)
  ).toBe(true);
  const handed = await fixture.roleGrantedBy(fixture.handedOn.roleRowId);
  expect(handed).toEqual({ grantedBy: SYSTEM_ADMIN.sub, revoked: false });
  expect(await fixture.audits("medaris_nazim.dismiss")).toBe(before + 1);
});

test("nizam/11 — dropping what was handed on revokes it, and 'Vazgeç' changes nothing", async ({
  page,
}) => {
  test.skip(!(seedable && SYSTEM_ADMIN.password), "no SYSTEM_ADMIN account");
  await page.clock.setFixedTime(new Date("2026-10-05T10:00:00+03:00"));
  await signIn(page, SYSTEM_ADMIN);
  await openNazims(page);
  const open = () =>
    page
      .getByRole("button", { name: `Görevden al: ${fixture.hasan.name}` })
      .click();

  await open();
  const dialog = page.getByRole("dialog", { name: "Görevden al" });
  await dialog.getByRole("button", { name: "Vazgeç" }).click();
  await expect(dialog).toBeHidden();
  expect(await fixture.heldNazim(fixture.hasan.id)).toBe(true);

  await open();
  await dialog
    .getByTestId("given-item")
    .getByRole("button", { name: "Düşür" })
    .click();
  await dialog
    .getByRole("button", { name: "Görevden al", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  expect(await fixture.roleGrantedBy(fixture.handedOn.roleRowId)).toMatchObject(
    {
      revoked: true,
    }
  );
});

test("nizam/12 — 'İzinleri düzenle' opens with what the person holds, locks the group's boxes and counts them (criteria 1, 2, 6)", async ({
  page,
}) => {
  test.skip(!(seedable && SYSTEM_ADMIN.password), "no SYSTEM_ADMIN account");
  await signIn(page, SYSTEM_ADMIN);
  await openNazims(page);
  await rowOf(page, fixture.hasan.name)
    .getByRole("button", { name: /İzinleri düzenle/ })
    .click();

  const dialog = page.getByRole("dialog", { name: "İzinleri düzenle" });
  await expect(dialog).toBeVisible();
  // the scrim does not close it
  await page.mouse.click(5, 5);
  await expect(dialog).toBeVisible();

  const card = dialog.getByTestId("nazim-card");
  await expect(card).toContainText(fixture.hasan.name);
  await expect(card).toContainText(fixture.hasan.email);
  await expect(card).toContainText(
    "Medaris nazımı · Veren: Yusuf Ziya Ertuğrul · 14 Eylül 2026"
  );
  await expect(dialog.getByRole("combobox").first()).toContainText(
    fixture.groups.koskIsleri.name
  );
  await expect(dialog.getByTestId("course-group-note")).toContainText(
    `${fixture.groups.dersDenetimi.name} grubu (her ders) bu kişiye ayrıca verilmiş; ders izinleri bu pencerede görünmez.`
  );

  // the group's four are ticked and locked, the single ones ticked and free
  for (const title of [
    "Köşk aç ve köşk nazımını seç",
    "Köşk nazımı ekle ya da çıkar",
    "Barındırma hakkı ver ya da geri al",
    "Köşk başvurularını karara bağla",
  ]) {
    await expect(box(dialog, title)).toBeChecked();
    await expect(box(dialog, title)).toBeDisabled();
  }
  await expect(dialog.getByText("Gruptan gelir.")).toHaveCount(4);
  for (const title of [
    "Medrese aç ve başmüderrisini seç",
    "Desteyi herkese yayımla",
    "Platformdan yasakla, yasağı kaldır",
  ]) {
    await expect(box(dialog, title)).toBeChecked();
    await expect(box(dialog, title)).toBeEnabled();
  }
  await expect(
    box(dialog, "Köşkü düzenle, gizle ya da geri al")
  ).not.toBeChecked();
  await expect(dialog).toContainText("Verilme zamanı: 30 Eylül 2026 16:12");
  await expect(dialog.locator(".mds-dialog__meta")).toHaveText(
    "Gruptan 4 izin ve 3 ek izin"
  );

  // 'Grup yok' unlocks (the group's boxes lose their tick, they were not single permissions)
  await chooseOption(page, dialog, "Grup yok");
  await expect(box(dialog, "Köşk aç ve köşk nazımını seç")).toBeEnabled();
  await expect(box(dialog, "Köşk aç ve köşk nazımını seç")).not.toBeChecked();
  await expect(dialog.getByText("Gruptan gelir.")).toHaveCount(0);
  await expect(dialog.locator(".mds-dialog__meta")).toHaveText("3 izin");

  // a group ticks and locks its own again, and swallows a single permission it carries
  await box(dialog, "Denetim kaydını oku").click();
  await chooseOption(page, dialog, fixture.groups.denetim.name);
  await expect(box(dialog, "Denetim kaydını oku")).toBeChecked();
  await expect(box(dialog, "Denetim kaydını oku")).toBeDisabled();
  await expect(dialog.locator(".mds-dialog__meta")).toHaveText(
    "Gruptan 2 izin ve 3 ek izin"
  );

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("nizam/12 — saving changes the group and the single permissions, keeps what stays, and writes the audit log (criteria 4, 5)", async ({
  page,
}) => {
  test.skip(!(seedable && SYSTEM_ADMIN.password), "no SYSTEM_ADMIN account");
  await signIn(page, SYSTEM_ADMIN);
  await openNazims(page);
  const grantAudits = await fixture.audits("permission.grant");
  const revokeAudits = await fixture.audits("permission.revoke");

  await rowOf(page, fixture.hasan.name)
    .getByRole("button", { name: /İzinleri düzenle/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "İzinleri düzenle" });
  await chooseOption(page, dialog, fixture.groups.denetim.name);
  await box(dialog, "Platformdan yasakla, yasağı kaldır").click();
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(dialog).toBeHidden();

  const hasan = rowOf(page, fixture.hasan.name);
  await expect(hasan).toContainText(fixture.groups.denetim.name);
  await expect(hasan).not.toContainText(fixture.groups.koskIsleri.name);
  await expect(hasan).toContainText(fixture.groups.dersDenetimi.name);
  await expect(hasan.getByTestId("single-permissions")).toHaveText(
    "ve Medrese aç, Desteyi herkese yayımla"
  );
  const rows = await fixture.grantsOf(fixture.hasan.id);
  const live = rows.filter((r) => !r.revoked);
  expect(
    live.filter((r) => r.groupId === fixture.groups.denetim.id)
  ).toHaveLength(1);
  expect(
    live.filter((r) => r.groupId === fixture.groups.koskIsleri.id)
  ).toHaveLength(0);
  expect(
    live
      .map((r) => r.permission)
      .filter(Boolean)
      .sort()
  ).toEqual(["platform.deck_publish", "platform.madrasah_create"]);
  // the course-wide group was not touched
  expect(
    live.filter((r) => r.groupId === fixture.groups.dersDenetimi.id)
  ).toHaveLength(1);
  expect(await fixture.audits("permission.grant")).toBe(grantAudits + 1);
  expect(await fixture.audits("permission.revoke")).toBe(revokeAudits + 1);
});

test("nizam/12 — an end date after the appointment's, or not in the future, is refused where it is typed (criterion 3)", async ({
  page,
}) => {
  test.skip(!(seedable && SYSTEM_ADMIN.password), "no SYSTEM_ADMIN account");
  await signIn(page, SYSTEM_ADMIN);
  await openNazims(page);
  await rowOf(page, fixture.hasan.name)
    .getByRole("button", { name: /İzinleri düzenle/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "İzinleri düzenle" });
  const end = dialog.getByLabel("Bitiş tarihi ve saati (isteğe bağlı)");
  const save = dialog.getByRole("button", { name: "Kaydet" });

  await expect(end).toHaveValue("2026-12-31T23:59");
  await expect(dialog).toContainText(
    "Atamanız 31 Aralık 2026 23:59 tarihinde bittiği için izin de en geç o zaman biter."
  );

  await end.fill("2027-01-01T00:00");
  await expect(
    dialog.getByText(
      "Bitiş zamanı atamanın bitişinden (31 Aralık 2026 23:59) sonra olamaz."
    )
  ).toBeVisible();
  await expect(save).toBeDisabled();

  await end.fill("2020-01-01T12:00");
  await expect(
    dialog.getByText("Bitiş zamanı şu andan sonra olmalı.")
  ).toBeVisible();
  await expect(save).toBeDisabled();

  // the appointment ends at 23:59:59 and the picker has minutes: its own
  // minute is not after it, the next one is
  await end.fill("2026-12-31T23:59");
  await expect(save).toBeEnabled();
  await end.fill("2026-12-15T12:00");
  await expect(save).toBeEnabled();
  await save.click();
  await expect(dialog).toBeHidden();
  await expect(rowOf(page, fixture.hasan.name)).toContainText("15 Aralık 2026");
});

test("nizam/12 — appointing finds the person by e-mail in the realm, gives a group, a single permission and an end, and the list shows it (criteria 4, 5)", async ({
  page,
}) => {
  test.skip(
    !(seedable && SYSTEM_ADMIN.password && KOSK_NAZIM.email && KOSK_NAZIM.sub),
    "no SYSTEM_ADMIN or KOSK_NAZIM account"
  );
  await fixture.forget(KOSK_NAZIM.sub as string);
  await signIn(page, SYSTEM_ADMIN);
  await openNazims(page);

  const appointAudits = await fixture.audits("medaris_nazim.appoint");
  const grantAudits = await fixture.audits("permission.grant");
  await page
    .getByRole("button", { name: "Medaris nazımı ata", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Medaris nazımı ata" });
  const save = dialog.getByRole("button", { name: "Kaydet" });

  // nobody is chosen yet
  await expect(save).toBeDisabled();
  const email = dialog.locator("input[name=nazimEmail]");
  await email.fill("kimse-yok-boyle@example.test");
  await email.press("Enter");
  await expect(
    dialog.getByText("Bu e-posta adresiyle kayıtlı bir hesap bulunamadı.")
  ).toBeVisible();
  await expect(save).toBeDisabled();

  await email.fill(KOSK_NAZIM.email as string);
  await email.press("Enter");
  await expect(dialog.getByTestId("chosen-nazim")).toBeVisible();
  await expect(dialog.getByTestId("chosen-nazim")).toContainText(
    KOSK_NAZIM.email as string
  );
  await expect(save).toBeEnabled();

  await chooseOption(page, dialog, fixture.groups.koskIsleri.name);
  await box(dialog, "Denetim kaydını oku").click();
  await dialog
    .getByLabel("Bitiş tarihi ve saati (isteğe bağlı)")
    .fill(daysFromNow(60));
  await expect(dialog.locator(".mds-dialog__meta")).toHaveText(
    "Gruptan 4 izin ve 1 ek izin"
  );
  await save.click();
  await expect(dialog).toBeHidden();

  const row = rowOf(page, KOSK_NAZIM.email as string);
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(fixture.groups.koskIsleri.name);
  await expect(row).toContainText("Denetim kaydını oku");

  const held = await fixture.grantsOf(KOSK_NAZIM.sub as string);
  expect(
    held.filter((g) => g.groupId === fixture.groups.koskIsleri.id)
  ).toHaveLength(1);
  expect(held.map((g) => g.permission).filter(Boolean)).toEqual([
    "platform.audit_read",
  ]);
  expect(await fixture.heldNazim(KOSK_NAZIM.sub as string)).toBe(true);
  expect(await fixture.audits("medaris_nazim.appoint")).toBe(appointAudits + 1);
  expect(await fixture.audits("permission.grant")).toBe(grantAudits + 1);

  // opened again, the values are there
  await row.getByRole("button", { name: /İzinleri düzenle/ }).click();
  const again = page.getByRole("dialog", { name: "İzinleri düzenle" });
  await expect(again.getByRole("combobox").first()).toContainText(
    fixture.groups.koskIsleri.name
  );
  await expect(box(again, "Denetim kaydını oku")).toBeChecked();
  await expect(
    again.getByLabel("Bitiş tarihi ve saati (isteğe bağlı)")
  ).toHaveValue(daysFromNow(60));
  // appointing the same person again is refused by the API; the list holds one row
  await again.getByRole("button", { name: "Vazgeç" }).click();
  await expect(rowOf(page, KOSK_NAZIM.email as string)).toHaveCount(1);
});

test("nizam/13 — the list gives each group's scope, permission count and users (criterion 1)", async ({
  page,
}) => {
  test.skip(!(seedable && SYSTEM_ADMIN.password), "no SYSTEM_ADMIN account");
  await signIn(page, SYSTEM_ADMIN);
  await openGroups(page, `?grup=${fixture.groups.koskIsleri.id}`);

  const kosk = groupItem(page, fixture.groups.koskIsleri.name);
  await expect(kosk).toContainText("Platform · 4 izin");
  await expect(
    kosk.getByRole("img", { name: "1 kişi kullanıyor" })
  ).toBeVisible();
  await expect(kosk).toHaveAttribute("aria-current", "page");
  const denetim = groupItem(page, fixture.groups.denetim.name);
  await expect(denetim).toContainText("Platform · 2 izin");
  await expect(
    denetim.getByRole("img", { name: "1 kişi kullanıyor" })
  ).toBeVisible();
  const ders = groupItem(page, fixture.groups.dersDenetimi.name);
  await expect(ders).toContainText("Her ders · 3 izin");
  await expect(
    ders.getByRole("img", { name: "2 kişi kullanıyor" })
  ).toBeVisible();

  const form = formOf(page);
  await expect(
    form.getByRole("heading", { name: fixture.groups.koskIsleri.name })
  ).toBeVisible();
  await expect(form.locator("input[name=name]")).toHaveValue(
    fixture.groups.koskIsleri.name
  );
  await expect(form.getByTestId("users-count")).toHaveText("1 kişi");
  await expect(form.getByTestId("group-users")).toContainText(
    fixture.hasan.name
  );
  await expect(form.getByTestId("group-users")).toContainText(
    "Medaris nazımı · bitiş 31 Aralık 2026"
  );

  await denetim.click();
  await expect(page).toHaveURL(new RegExp(`grup=${fixture.groups.denetim.id}`));
  await expect(formOf(page).locator("input[name=name]")).toHaveValue(
    fixture.groups.denetim.name
  );
  await expect(page.locator("[data-testid=group-users]:visible")).toContainText(
    fixture.rabia.name
  );
});

test("nizam/13 — the scope decides which boxes the form offers (criterion 2), and one course cannot be chosen yet", async ({
  page,
}) => {
  test.skip(!(seedable && SYSTEM_ADMIN.password), "no SYSTEM_ADMIN account");
  await signIn(page, SYSTEM_ADMIN);
  await openGroups(page, "?grup=yeni");
  const form = formOf(page);

  await expect(form.getByRole("heading", { name: "Yeni grup" })).toBeVisible();
  await expect(box(form, "Köşk aç ve köşk nazımını seç")).toBeVisible();
  await expect(box(form, "Platform politikalarını değiştir")).toBeVisible();

  await box(form, "Denetim kaydını oku").click();
  await form.getByRole("radio", { name: "Her ders" }).click();
  await expect(box(form, "Köşk aç ve köşk nazımını seç")).toHaveCount(0);
  await expect(
    box(form, "Dersi düzenle: başlık, tanıtım, müfredat, saat dilimi")
  ).toBeVisible();
  await expect(form.getByRole("radio", { name: "Bir ders" })).toBeDisabled();

  // back to the platform: the course boxes go and the platform tick that did not fit was dropped
  await form.getByRole("radio", { name: "Platform" }).click();
  await expect(box(form, "Denetim kaydını oku")).not.toBeChecked();
});

test("nizam/13 — creating a group lists it, audits it, and a blank or repeated name is refused (criteria 4, 5)", async ({
  page,
}) => {
  test.skip(!(seedable && SYSTEM_ADMIN.password), "no SYSTEM_ADMIN account");
  await signIn(page, SYSTEM_ADMIN);
  await openGroups(page);
  const created = await fixture.audits("permission_group.create");
  await page.getByRole("link", { name: "Grup oluştur" }).click();
  const form = formOf(page);
  const name = form.locator("input[name=name]");
  const save = form.getByRole("button", { name: "Kaydet" });

  await save.click();
  await expect(form.getByText("Bir grup adı yazın.")).toBeVisible();

  await name.fill(fixture.groups.denetim.name.toLocaleLowerCase("tr"));
  await expect(form.getByText("Bu adda bir grup var.")).toBeVisible();
  await save.click();
  expect(await fixture.audits("permission_group.create")).toBe(created);

  const mine = `E2E Yayın ve bağlantılar ${fixture.tail}`;
  await name.fill(mine);
  await save.click();
  await expect(form.getByText("En az bir izin seçin.")).toBeVisible();
  await box(form, "Desteyi herkese yayımla").click();
  await box(form, "YouTube bağlantısını yönet").click();
  await save.click();

  await expect(page).toHaveURL(/grup=/);
  await expect(groupItem(page, mine)).toContainText("Platform · 2 izin");
  const made = await fixture.groupByName(mine);
  expect(made?.items).toEqual([
    "platform.deck_publish",
    "platform.youtube_manage",
  ]);
  expect(await fixture.audits("permission_group.create")).toBe(created + 1);
});

test("nizam/13 — deleting a group somebody uses asks first, with no answer chosen, and 'keep' leaves them single permissions (criterion 3)", async ({
  page,
}) => {
  test.skip(!(seedable && SYSTEM_ADMIN.password), "no SYSTEM_ADMIN account");
  await signIn(page, SYSTEM_ADMIN);
  await openGroups(page, `?grup=${fixture.groups.denetim.id}`);
  const deleted = await fixture.audits("permission_group.delete");

  await page.getByRole("button", { name: /^Grubu sil/ }).click();
  const ask = page.getByRole("alertdialog", {
    name: "Bu grubu 1 kişi kullanıyor",
  });
  const confirm = ask.getByRole("button", { name: "Grubu sil", exact: true });
  // Vazgeç has the focus; the scrim does not close it; the button waits for an answer
  await expect(ask.getByRole("button", { name: "Vazgeç" })).toBeFocused();
  await page.mouse.click(5, 5);
  await expect(ask).toBeVisible();
  await expect(confirm).toBeDisabled();
  await expect(ask.getByRole("radio", { checked: true })).toHaveCount(0);

  // 'Vazgeç' changes nothing
  await ask.getByRole("button", { name: "Vazgeç" }).click();
  await expect(ask).toBeHidden();
  expect(
    (await fixture.groupByName(fixture.groups.denetim.name))?.deleted
  ).toBe(false);

  await page.getByRole("button", { name: /^Grubu sil/ }).click();
  await ask.getByRole("radio", { name: "İzinleri kalsın" }).click();
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(ask).toBeHidden();

  await expect(groupItem(page, fixture.groups.denetim.name)).toHaveCount(0);
  expect(
    (await fixture.groupByName(fixture.groups.denetim.name))?.deleted
  ).toBe(true);
  const rabia = await fixture.grantsOf(fixture.rabia.id);
  expect(rabia.filter((g) => g.groupId && !g.revoked)).toHaveLength(0);
  expect(
    rabia
      .filter((g) => g.permission && !g.revoked)
      .map((g) => g.permission)
      .sort()
  ).toEqual(["platform.audit_read", "platform.policy_edit"]);
  expect(await fixture.audits("permission_group.delete")).toBe(deleted + 1);
});

test("nizam/13 — deleting with 'İzinleri kalksın' takes the group's permissions away", async ({
  page,
}) => {
  test.skip(!(seedable && SYSTEM_ADMIN.password), "no SYSTEM_ADMIN account");
  await signIn(page, SYSTEM_ADMIN);
  await openGroups(page, `?grup=${fixture.groups.koskIsleri.id}`);
  await page.getByRole("button", { name: /^Grubu sil/ }).click();
  const ask = page.getByRole("alertdialog", {
    name: "Bu grubu 1 kişi kullanıyor",
  });
  await ask.getByRole("radio", { name: "İzinleri kalksın" }).click();
  await ask.getByRole("button", { name: "Grubu sil", exact: true }).click();
  await expect(ask).toBeHidden();

  const hasan = (await fixture.grantsOf(fixture.hasan.id)).filter(
    (g) => !g.revoked
  );
  expect(
    hasan.filter((g) => g.groupId === fixture.groups.koskIsleri.id)
  ).toHaveLength(0);
  // what he held singly stays; nothing of the group's was turned into single ones
  expect(
    hasan
      .map((g) => g.permission)
      .filter(Boolean)
      .sort()
  ).toEqual([
    "platform.ban_account",
    "platform.deck_publish",
    "platform.madrasah_create",
  ]);
});

test("nizam/13 — changing a used group's permissions asks too, and 'İzinleri kalsın' keeps the old ones as single permissions", async ({
  page,
}) => {
  test.skip(!(seedable && SYSTEM_ADMIN.password), "no SYSTEM_ADMIN account");
  await signIn(page, SYSTEM_ADMIN);
  await openGroups(page, `?grup=${fixture.groups.denetim.id}`);
  const form = formOf(page);

  // a rename alone asks nothing
  await form
    .locator("input[name=name]")
    .fill(`${fixture.groups.denetim.name} 2`);
  await form.getByRole("button", { name: "Kaydet" }).click();
  await expect(groupItem(page, `${fixture.groups.denetim.name} 2`)).toHaveCount(
    1
  );
  await expect(page.getByRole("alertdialog")).toHaveCount(0);

  await box(form, "YouTube bağlantısını yönet").click();
  await form.getByRole("button", { name: "Kaydet" }).click();
  const ask = page.getByRole("alertdialog", {
    name: "Bu grubu 1 kişi kullanıyor",
  });
  const confirm = ask.getByRole("button", { name: "Kaydet", exact: true });
  await expect(confirm).toBeDisabled();
  await ask.getByRole("radio", { name: "İzinleri kalsın" }).click();
  await confirm.click();
  await expect(ask).toBeHidden();

  await expect(
    groupItem(page, `${fixture.groups.denetim.name} 2`)
  ).toContainText("Platform · 3 izin");
  const rabia = (await fixture.grantsOf(fixture.rabia.id)).filter(
    (g) => !g.revoked
  );
  expect(rabia.filter((g) => g.groupId)).toHaveLength(0);
  expect(
    rabia
      .map((g) => g.permission)
      .filter(Boolean)
      .sort()
  ).toEqual(["platform.audit_read", "platform.policy_edit"]);
});

test("nizam/13 — 'İzinlerini düzenle' on a user opens nizam/12 for that person", async ({
  page,
}) => {
  test.skip(!(seedable && SYSTEM_ADMIN.password), "no SYSTEM_ADMIN account");
  await signIn(page, SYSTEM_ADMIN);
  await openGroups(page, `?grup=${fixture.groups.koskIsleri.id}`);
  await page
    .getByRole("button", { name: `İzinlerini düzenle: ${fixture.hasan.name}` })
    .click();
  const dialog = page.getByRole("dialog", { name: "İzinleri düzenle" });
  await expect(dialog.getByTestId("nazim-card")).toContainText(
    fixture.hasan.name
  );
  await expect(dialog.getByRole("combobox").first()).toContainText(
    fixture.groups.koskIsleri.name
  );
});
