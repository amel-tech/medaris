import type { Page } from "@playwright/test";
import { account, canSignIn, expect, test } from "./accounts";
import { type CoursesFixture, seedCourses } from "./courses-seed";
import { type NazirFixture, seedPortal } from "./seed";

/**
 * Design nazir/08 (Medrese dersi aç) against the running app and API with real
 * Keycloak sign-ins (MDRS-186). The müderris search goes to the real realm
 * directory through tedrisat's admin client, so the müderrisler added are the
 * TALEBE and DERS_NAZIR accounts; the course they are added to is removed with
 * its roles afterwards. The refusal of a MEDRESE_NAZIR is in courses.e2e.ts.
 */
const BASMUDERRIS = account("MEDRESE_BASMUDERRIS");
const TALEBE = account("TALEBE");
const DERS_NAZIR = account("DERS_NAZIR");

let base: NazirFixture | undefined;
let courses: CoursesFixture | undefined;

test.beforeAll(async () => {
  if (!BASMUDERRIS.sub) return;
  base = await seedPortal({ basmuderris: BASMUDERRIS.sub });
});

test.afterAll(async () => {
  await base?.remove();
});

// A course opened here changes the list the next spec reads, so each has its own.
test.beforeEach(async () => {
  if (base && BASMUDERRIS.sub)
    courses = await seedCourses(base, BASMUDERRIS.sub);
});

test.afterEach(async () => {
  await courses?.remove();
  courses = undefined;
});

const ready = () => Boolean(base && courses && canSignIn(BASMUDERRIS));
const directory = () => ready() && canSignIn(TALEBE) && Boolean(TALEBE.sub);

const open = async (page: Page) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/medrese/${base?.madrasah.id}/dersler/yeni`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Medrese dersi aç" })
  ).toBeVisible();
};

const search = async (page: Page, email: string) => {
  const field = page.getByLabel("Müderris", { exact: true });
  await field.fill(email);
  await field.press("Enter");
};

const name = (page: Page) => page.getByLabel("Ders adı");
const submit = (page: Page) => page.getByRole("button", { name: "Dersi aç" });

test("nazir/08 — only the köşks that host the medrese can be chosen, the first is chosen, and the way back is Dersler (criterion 1)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/medrese/${base?.madrasah.id}/dersler`);
  await page.getByRole("link", { name: "Medrese dersi aç" }).click();
  await expect(page).toHaveURL(/\/dersler\/yeni$/);

  const radios = page
    .getByRole("radiogroup", { name: /^Köşk/ })
    .getByRole("radio");
  await expect(radios).toHaveCount(2);
  await expect(radios.first()).toBeChecked();
  await expect(
    page.getByRole("radio", { name: courses?.kosk.name ?? "" })
  ).toBeVisible();
  await expect(page.getByText("medresenin burada 3 dersi var")).toBeVisible();
  await expect(page.getByText("medresenin burada 1 dersi var")).toBeVisible();
  await expect(page.getByText(courses?.noRight.name ?? "")).toHaveCount(0);
  await expect(page.getByText(courses?.hiddenKosk.name ?? "")).toHaveCount(0);
  await expect(
    page.getByText(
      "Yalnız medresenizin barındırma hakkı olan köşkler listelenir."
    )
  ).toBeVisible();

  const crumbs = page.getByRole("navigation", { name: "Sayfa yolu" });
  await expect(crumbs).toContainText("Dersler");
  await expect(
    page.getByTestId("open-course-form").getByRole("link", { name: "Vazgeç" })
  ).toHaveAttribute("href", `/medrese/${base?.madrasah.id}/dersler`);
});

test("nazir/08 — 'Dersi aç' without a name and a müderris says what is missing under the fields and opens nothing (criterion 2)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  await submit(page).click();

  await expect(page.getByText("Ders adı boş olamaz.")).toBeVisible();
  await expect(
    page.getByText("En az bir müderris seçin.").last()
  ).toBeVisible();
  await expect(name(page)).toBeFocused();
  expect(await courses?.created()).toHaveLength(0);

  await name(page).fill("Maksûd şerhi");
  await submit(page).click();
  await expect(page.getByText("Ders adı boş olamaz.")).toHaveCount(0);
  await expect(page.getByLabel("Müderris", { exact: true })).toBeFocused();
  expect(await courses?.created()).toHaveLength(0);
});

test("nazir/08 — köşk, name and a müderris's e-mail open a draft of the medrese, which is in Dersler as 'Taslak' (criterion 4)", async ({
  as,
}) => {
  test.skip(!directory(), "no TALEBE account");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  // not the seeded draft's title, which the list has a row for already
  const title = `E2E Akaid-i Nesefî ${courses?.tail}`;

  await page.getByRole("radio", { name: courses?.fatih.name ?? "" }).check();
  await name(page).fill(`  ${title} `);
  await search(page, TALEBE.email ?? "");
  const picker = page.getByTestId("muderris-picker");
  await expect(picker).toContainText(TALEBE.email ?? "");
  // criterion 3: a lone müderris is the imam, with nothing to choose
  await expect(picker.getByText("Dersin imamı", { exact: true })).toBeVisible();
  await expect(picker.getByRole("radio")).toHaveCount(0);
  await submit(page).click();

  await expect(page).toHaveURL(/\/dersler$/);
  await expect(page.getByText("Ders taslak olarak açıldı")).toBeVisible();
  const row = page
    .locator("[data-testid=courses] tbody tr:visible")
    .filter({ hasText: title });
  await expect(row).toContainText("Taslak");
  await expect(row).toContainText(courses?.fatih.name ?? "");
  await expect(row).toContainText("bugün açıldı");
  await expect(row).toContainText("Dersin imamı");

  const [created] = (await courses?.created()) ?? [];
  expect(created?.title).toBe(title);
  expect(created?.status).toBe("DRAFT");
  expect(created?.madrasahId).toBe(base?.madrasah.id);
  expect(created?.koskId).toBe(courses?.fatih.id);
  expect(created?.requiresApproval).toBe(false);
  expect(created?.closed).toBe(false);
  const held = await courses?.muderrisOf(created?.id ?? "");
  expect(held).toEqual([{ userId: TALEBE.sub, isImam: true }]);
  expect(await courses?.audits("course.open", created?.id ?? "")).toBe(1);
});

test("nazir/08 — with several müderrisler the imam is chosen, and the one chosen is the imam (criterion 3)", async ({
  as,
}) => {
  test.skip(
    !(directory() && canSignIn(DERS_NAZIR) && DERS_NAZIR.sub),
    "no TALEBE and DERS_NAZIR accounts"
  );
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  const title = `E2E Mantığa giriş ${courses?.tail}`;
  await name(page).fill(title);
  await search(page, TALEBE.email ?? "");
  await search(page, DERS_NAZIR.email ?? "");

  const picker = page.getByTestId("muderris-picker");
  await expect(picker.getByRole("radio")).toHaveCount(2);
  // the first is the imam until another is chosen
  await expect(picker.getByRole("radio").first()).toBeChecked();
  await picker.getByRole("radio").nth(1).check();
  await submit(page).click();
  await expect(page).toHaveURL(/\/dersler$/);

  const [created] = (await courses?.created()) ?? [];
  const held = await courses?.muderrisOf(created?.id ?? "");
  expect(held?.map((m) => m.userId).sort()).toEqual(
    [TALEBE.sub, DERS_NAZIR.sub].sort()
  );
  expect(held?.find((m) => m.isImam)?.userId).toBe(DERS_NAZIR.sub);
});

test("nazir/08 — where the medrese always approves, 'Kayıt onayı gereksin' is on and off limits, and the course is opened that way (criterion 5)", async ({
  as,
}) => {
  test.skip(!directory(), "no TALEBE account");
  await courses?.setPolicies({ alwaysApproval: true });
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);

  const approval = page.getByRole("checkbox", { name: "Kayıt onayı gereksin" });
  await expect(approval).toBeChecked();
  await expect(approval).toBeDisabled();
  await expect(
    page.getByRole("checkbox", { name: "Kapalı ders" })
  ).not.toBeDisabled();
  const lock = page.getByTestId("policy-lock");
  await expect(lock).toContainText(
    "Medresenin “Kayıt her zaman onaylı” politikası bu ayarı kilitler."
  );
  await expect(
    lock.getByRole("link", { name: "Medrese ayarları" })
  ).toHaveAttribute("href", `/medrese/${base?.madrasah.id}/ayarlar`);

  await name(page).fill(`E2E Mantığa giriş ${courses?.tail}`);
  await search(page, TALEBE.email ?? "");
  await page.getByRole("checkbox", { name: "Kapalı ders" }).check();
  await submit(page).click();
  await expect(page).toHaveURL(/\/dersler$/);

  const [created] = (await courses?.created()) ?? [];
  expect(created?.requiresApproval).toBe(true);
  expect(created?.closed).toBe(true);
});

test("nazir/08 — where the medrese requires closed courses, 'Kapalı ders' is locked on", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  await courses?.setPolicies({ closedCourseRequired: true });
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  const closed = page.getByRole("checkbox", { name: "Kapalı ders" });
  await expect(closed).toBeChecked();
  await expect(closed).toBeDisabled();
  await expect(
    page.getByRole("checkbox", { name: "Kayıt onayı gereksin" })
  ).not.toBeDisabled();
  await expect(page.getByTestId("policy-lock")).toContainText(
    "“Kapalı ders zorunlu”"
  );
});

test("nazir/08 — a köşk that took its right back after the page opened refuses the course, and says why", async ({
  as,
}) => {
  test.skip(!directory(), "no TALEBE account");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  // the köşks are listed by name and the first is chosen: choose the one that leaves
  await page.getByRole("radio", { name: courses?.kosk.name ?? "" }).check();
  await name(page).fill(`E2E Mantığa giriş ${courses?.tail}`);
  await search(page, TALEBE.email ?? "");
  await expect(page.getByTestId("muderris-picker")).toContainText(
    TALEBE.email ?? ""
  );
  await courses?.revokeHosting(courses?.kosk.id ?? "");
  await submit(page).click();

  // the toast, not the live region that repeats it for screen readers
  await expect(
    page
      .locator(".mds-toast__desc")
      .getByText("Bu köşk artık medresenize barındırma hakkı vermiyor.")
  ).toBeVisible();
  await expect(page).toHaveURL(/\/dersler\/yeni$/);
  expect(await courses?.created()).toHaveLength(0);
  // the page read the köşks again: the one that left is no choice any more
  await expect(
    page.getByRole("radio", { name: courses?.kosk.name ?? "" })
  ).toHaveCount(0);
});
