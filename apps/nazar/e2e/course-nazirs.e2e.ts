import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import pg from "pg";
import { account, canSignIn, expect, test } from "./accounts";
import { type NazarFixture, seedPortal } from "./seed";

/**
 * Ders nazırları of a course (MDRS-270) against the running app and API with
 * real Keycloak sign-ins. MEDRESE_BASMUDERRIS holds both seeded courses as
 * müderris, so he gives; DERS_NAZIR is seeded on the first course with no
 * permission; TALEBE is the person appointed on the second course and dismissed
 * again; SISTEM_ADMIN opens the first course by its address. The specs run in
 * order and share the second course's post. What the course routes write
 * (grants and audit rows) is taken out after the seed's own rows.
 */
const BASMUDERRIS = account("MEDRESE_BASMUDERRIS");
const DERS_NAZIR = account("DERS_NAZIR");
const TALEBE = account("TALEBE");
const ADMIN = account("SISTEM_ADMIN");

let fixture: NazarFixture | undefined;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  if (!BASMUDERRIS.sub) return;
  fixture = await seedPortal({
    basmuderris: BASMUDERRIS.sub,
    dersNazir: DERS_NAZIR.sub,
  });
});

test.afterAll(async () => {
  if (fixture) {
    const client = new pg.Client({
      connectionString: process.env.E2E_DATABASE_URL,
    });
    await client.connect();
    try {
      const courses = [fixture.first.id, fixture.second.id];
      await client.query(
        "delete from permission_grants where scope_id = any($1)",
        [courses]
      );
      await client.query("delete from audit_log where entity_id = any($1)", [
        courses,
      ]);
    } finally {
      await client.end();
    }
  }
  await fixture?.remove();
});

// The page shows moments in the account's zone, Istanbul when it has none:
// pinned, the dates below mean the same instant on any machine.
test.use({ timezoneId: "Europe/Istanbul" });

const seeded = () => Boolean(fixture && canSignIn(BASMUDERRIS));
const desktop = { width: 1440, height: 900 };
const phone = { width: 390, height: 844 };

const SESSION =
  "Celse ekle, tarihini değiştir, iptal et; toplantı bağlantısını gir";
const RECORDING = "Ders kaydı ekle, adlandır, gizle; görünürlüğünü değiştir";

/** What the date-and-time picker takes for an instant in Istanbul: YYYY-MM-DDTHH:mm. */
const istanbulMinute = (at: Date): string => {
  const part = (type: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Istanbul",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(at)
      .find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
};
/** 18:00 in Istanbul, thirty days from now. */
const inThirtyDays = () => {
  const day = istanbulMinute(new Date(Date.now() + 30 * 86_400_000));
  return `${day.slice(0, 10)}T18:00`;
};
const longDay = (local: string) =>
  new Intl.DateTimeFormat("tr", {
    dateStyle: "long",
    timeZone: "Europe/Istanbul",
  }).format(new Date(`${local}:00+03:00`));

const open = async (page: Page, courseId: string | undefined) => {
  await page.setViewportSize(desktop);
  await page.goto(`/ders/${courseId}/nazirlar`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Ders nazırları" })
  ).toBeVisible();
};
const rowOf = (page: Page, text: string) =>
  page
    .locator("[data-testid=course-nazirs] tbody tr:visible")
    .filter({ hasText: text });
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name });
const shot = (page: Page, name: string) =>
  page.screenshot({ path: test.info().outputPath(`${name}.png`) });

test("the müderris opens Ders nazırları of a course with none yet, under the course's menu", async ({
  as,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page, fixture?.second.id);
  await expect(page.getByText("Bu sayfa henüz hazır değil.")).toHaveCount(0);
  await expect(
    page.getByText("Bu derste henüz ders nazırı yok.")
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ders nazırı ata" })
  ).toBeVisible();
  await expect(
    page.locator("aside").getByRole("link", { name: /^Ders nazırları/ })
  ).toHaveAttribute("aria-current", "page");
});

test("the müderris appoints a person by e-mail with two permissions and an end (criterion 1)", async ({
  as,
}) => {
  test.skip(!seeded() || !canSignIn(TALEBE), "no talebe to appoint");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page, fixture?.second.id);
  await page.getByRole("button", { name: "Ders nazırı ata" }).click();
  const appoint = dialog(page, "Ders nazırı ata");
  const email = appoint.getByRole("textbox", { name: /^E-posta adresi/ });
  await email.fill(TALEBE.email as string);
  await email.press("Enter");
  await expect(
    appoint.getByRole("heading", { name: "Seçilen ders nazırı" })
  ).toBeVisible();
  await appoint.getByRole("checkbox", { name: RECORDING }).click();
  await appoint.getByRole("checkbox", { name: SESSION }).click();
  const end = inThirtyDays();
  await appoint.locator("input[name=endsAt]").fill(end);
  await shot(page, "course-nazirs-appoint-1440");
  await appoint.getByRole("button", { name: "Kaydet" }).click();

  await expect(page.getByText("Ders nazırı atandı").first()).toBeVisible();
  const row = rowOf(page, TALEBE.email as string);
  await expect(row).toContainText("2 izin");
  await expect(row).toContainText(longDay(end));
  await expect(row).toContainText("(siz)");
  await shot(page, "course-nazirs-list-1440");
  await page.setViewportSize(phone);
  await shot(page, "course-nazirs-list-390");
});

test("the person appointed holds exactly what was given, and nothing else (criterion 1)", async ({
  as,
}) => {
  test.skip(!seeded() || !canSignIn(TALEBE), "no talebe to appoint");
  const page = await as("TALEBE");
  await page.setViewportSize(desktop);
  await page.goto(`/ders/${fixture?.second.id}/kayitlar`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Ders kayıtları" })
  ).toBeVisible();
  await expect(page.getByText("Bu sayfaya izniniz yok")).toHaveCount(0);
  await expect(page.locator("aside")).toContainText("Ders nazırı");
  for (const section of ["mufredat", "nazirlar"]) {
    await page.goto(`/ders/${fixture?.second.id}/${section}`);
    await expect(
      page.getByText("Bu sayfaya izniniz yok"),
      section
    ).toBeVisible();
  }
});

test("the müderris takes a permission and the end away (criterion 3)", async ({
  as,
}) => {
  test.skip(!seeded() || !canSignIn(TALEBE), "no talebe to appoint");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page, fixture?.second.id);
  await page.getByRole("button", { name: /^İzinleri düzenle: / }).click();
  const edit = dialog(page, "İzinleri düzenle");
  await expect(edit.getByRole("checkbox", { name: SESSION })).toBeChecked();
  await edit.getByRole("checkbox", { name: SESSION }).click();
  await edit.locator("input[name=endsAt]").fill("");
  await shot(page, "course-nazirs-edit-1440");
  await edit.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("İzinler kaydedildi").first()).toBeVisible();
  const row = rowOf(page, TALEBE.email as string);
  await expect(row).toContainText("1 izin");
  await expect(row).toContainText("Süresiz");
});

test("the dialog refuses a person who holds the post already, before sending", async ({
  as,
}) => {
  test.skip(!seeded() || !canSignIn(TALEBE), "no talebe to appoint");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page, fixture?.second.id);
  await page.getByRole("button", { name: "Ders nazırı ata" }).click();
  const appoint = dialog(page, "Ders nazırı ata");
  const email = appoint.getByRole("textbox", { name: /^E-posta adresi/ });
  await email.fill(TALEBE.email as string);
  await email.press("Enter");
  await expect(appoint).toContainText("bu dersin ders nazırı zaten.");
  await expect(appoint.getByRole("button", { name: "Kaydet" })).toBeDisabled();
  await appoint.getByRole("button", { name: "Vazgeç" }).click();
});

test("the müderris dismisses the ders nazırı, asking first (criterion 4)", async ({
  as,
}) => {
  test.skip(!seeded() || !canSignIn(TALEBE), "no talebe to appoint");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page, fixture?.second.id);
  await page.getByRole("button", { name: /^Görevden al: / }).click();
  const ask = dialog(page, "Görevden al");
  await expect(ask.getByRole("button", { name: "Vazgeç" })).toBeFocused();
  await ask.getByRole("button", { name: "Görevden al" }).click();
  await expect(page.getByText("Görevden alındı").first()).toBeVisible();
  await expect(rowOf(page, TALEBE.email as string)).toHaveCount(0);

  const talebe = await as("TALEBE");
  await talebe.goto("/");
  await talebe.waitForURL(/\/erisim-yok$/);
});

test("a ders nazırı with no permission is refused the page and sees no button (criterion 2)", async ({
  as,
}) => {
  test.skip(!seeded() || !canSignIn(DERS_NAZIR), "no ders nazırı");
  const page = await as("DERS_NAZIR");
  await page.setViewportSize(desktop);
  await page.goto(`/ders/${fixture?.first.id}/nazirlar`);
  await expect(page.getByText("Bu sayfaya izniniz yok")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ders nazırı ata" })
  ).toHaveCount(0);
});

test("the başnazım opens any course's Ders nazırları by its address", async ({
  as,
}) => {
  test.skip(!seeded() || !canSignIn(ADMIN), "no başnazım");
  const page = await as("SISTEM_ADMIN");
  await open(page, fixture?.first.id);
  await expect(page.locator("aside")).toContainText("Medaris başnazımı");
  if (DERS_NAZIR.email) {
    const row = rowOf(page, DERS_NAZIR.email);
    await expect(
      row.getByRole("button", { name: /^İzinleri düzenle: / })
    ).toBeVisible();
    await expect(
      row.getByRole("button", { name: /^Görevden al: / })
    ).toBeVisible();
  }
  await page.goto(`/ders/${randomUUID()}/nazirlar`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Ders nazırları" })
  ).toHaveCount(0);
});
