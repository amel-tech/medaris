import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import {
  type Account,
  account,
  canSignIn,
  directGrant,
  expect,
  test,
} from "./accounts";
import { type CourseAdminFixture, seedCourseAdmin } from "./course-admin-seed";

/**
 * Ders nazırları of a course (MDRS-270) against the running app and API with
 * real Keycloak sign-ins. MEDRESE_BASMUDERRIS holds both seeded courses as
 * müderris, so he gives; DERS_NAZIR is seeded on the first course with no
 * permission; TALEBE, who holds nothing in either course, is the person
 * appointed, changed and dismissed again; SISTEM_ADMIN opens the first course
 * by its address. The specs run in order and share the second course's post.
 * The API calls take the direct grant of `accounts.ts`; what the course routes
 * write is taken out by the seed's `remove`.
 */
const BASMUDERRIS = account("MEDRESE_BASMUDERRIS");
const DERS_NAZIR = account("DERS_NAZIR");
const TALEBE = account("TALEBE");
const MUDERRIS = account("MUDERRIS");
const ADMIN = account("SISTEM_ADMIN");
const API = process.env.E2E_TEDRISAT_URL ?? "http://localhost:3001";

let fixture: CourseAdminFixture | undefined;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  if (!BASMUDERRIS.sub) return;
  fixture = await seedCourseAdmin({
    basmuderris: BASMUDERRIS.sub,
    dersNazir: DERS_NAZIR.sub,
  });
});

test.afterAll(async () => {
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
const SETTINGS = "Ders ayarlarını ve kapalı ders bayrağını değiştir";
const PUBLISH = "Dersi yayımla ya da taslağa çek";
const FORBIDDEN = "Bu sayfaya izniniz yok";

/** tedrisat as `who`, with a token of their own. */
async function api(
  who: Account,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; code?: string }> {
  const token = (await directGrant(who)).access_token;
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { status: res.status, code: data?.code ?? data?.error?.code };
}

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
const istanbulInstant = (local: string) => new Date(`${local}:00+03:00`);
const longDay = (local: string) =>
  new Intl.DateTimeFormat("tr", {
    dateStyle: "long",
    timeZone: "Europe/Istanbul",
  }).format(istanbulInstant(local));

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
/**
 * A sentence on screen. While Next streams a page in it keeps a hidden copy
 * beside the one shown, so a text can briefly match twice: only what is seen counts.
 */
const seen = (page: Page, text: string) =>
  page.getByText(text).filter({ visible: true });
const shot = (page: Page, name: string) =>
  page.screenshot({ path: test.info().outputPath(`${name}.png`) });

/** Opens "Ders nazırı ata" and searches `email`; the dialog is returned with what it found. */
const searchIn = async (page: Page, email: string) => {
  await page.getByRole("button", { name: "Ders nazırı ata" }).click();
  const appoint = dialog(page, "Ders nazırı ata");
  const field = appoint.getByRole("textbox", { name: /^E-posta adresi/ });
  await field.fill(email);
  await field.press("Enter");
  return appoint;
};

/** The pages of a course a ders nazırı is let into, and those they are refused. */
const expectPages = async (
  page: Page,
  courseId: string | undefined,
  pages: { open: Record<string, string>; refused: readonly string[] }
) => {
  const refusal = seen(page, FORBIDDEN);
  for (const [section, title] of Object.entries(pages.open)) {
    await page.goto(`/ders/${courseId}/${section}`);
    await expect(
      page.getByRole("heading", { level: 1, name: title }),
      section
    ).toBeVisible();
    await expect(refusal, section).toHaveCount(0);
  }
  for (const section of pages.refused) {
    await page.goto(`/ders/${courseId}/${section}`);
    await expect(refusal, section).toBeVisible();
  }
};

test("the menu's Ders nazırları and Ders ayarları open their pages, not the placeholder", async ({
  as,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await page.setViewportSize(desktop);
  await page.goto(`/ders/${fixture?.second.id}/celseler`);
  const menu = page.locator("aside");

  await menu.getByRole("link", { name: /^Ders nazırları/ }).click();
  await page.waitForURL(`**/ders/${fixture?.second.id}/nazirlar`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Ders nazırları" })
  ).toBeVisible();
  await expect(page.getByText("Bu sayfa henüz hazır değil.")).toHaveCount(0);

  await menu.getByRole("link", { name: /^Ders ayarları/ }).click();
  await page.waitForURL(`**/ders/${fixture?.second.id}/ayarlar`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Ders ayarları" })
  ).toBeVisible();
  await expect(page.getByText("Bu sayfa henüz hazır değil.")).toHaveCount(0);
  await expect(
    menu.getByRole("link", { name: /^Ders ayarları/ })
  ).toHaveAttribute("aria-current", "page");
});

test("the müderris opens Ders nazırları of a course with none yet, under the course's menu", async ({
  as,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page, fixture?.second.id);
  await expect(page.getByText("Bu sayfa henüz hazır değil.")).toHaveCount(0);
  await expect(seen(page, "Bu derste henüz ders nazırı yok.")).toBeVisible();
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
  const appoint = await searchIn(page, TALEBE.email as string);
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

  // the post and its permissions end at the one moment chosen
  const ends = istanbulInstant(end).getTime();
  const posts = (await fixture?.postsOf(
    TALEBE.sub as string,
    fixture.second.id
  )) as Array<{ expires_at: Date | null }>;
  expect(posts.map((p) => p.expires_at?.getTime())).toEqual([ends]);
  const grants = (await fixture?.grantsOf(
    TALEBE.sub as string,
    fixture.second.id
  )) as Array<{ permission: string; expires_at: Date | null }>;
  expect(grants.map((g) => [g.permission, g.expires_at?.getTime()])).toEqual([
    ["recording.manage", ends],
    ["session.manage", ends],
  ]);
});

test("the person appointed opens exactly the pages those two permissions allow (criterion 1)", async ({
  as,
}) => {
  test.skip(!seeded() || !canSignIn(TALEBE), "no talebe to appoint");
  const page = await as("TALEBE");
  await page.setViewportSize(desktop);
  await page.goto(`/ders/${fixture?.second.id}/kayitlar`);
  // the user row's role line, not the menu's "Ders nazırları"
  await expect(
    page.locator("aside .mds-nav-user__role").filter({ visible: true })
  ).toHaveText(/^Ders nazırı(,|$)/);
  // session.manage opens Celseler, Müfredat and Ders ayarları (PAGE_CODES),
  // recording.manage Ders kayıtları; neither opens the other three
  await expectPages(page, fixture?.second.id, {
    open: {
      celseler: "Celseler",
      mufredat: "Müfredat",
      kayitlar: "Ders kayıtları",
      ayarlar: "Ders ayarları",
    },
    refused: ["talebeler", "sorular", "nazirlar"],
  });
});

test("the müderris takes a permission and then the end away, and the page it opened shuts (criterion 3)", async ({
  as,
}) => {
  test.skip(!seeded() || !canSignIn(TALEBE), "no talebe to appoint");
  const page = await as("MEDRESE_BASMUDERRIS");
  const course = fixture?.second.id as string;
  await open(page, course);
  const [held] = (await fixture?.postsOf(
    TALEBE.sub as string,
    course
  )) as Array<{ expires_at: Date | null }>;
  const edit = dialog(page, "İzinleri düzenle");
  const row = rowOf(page, TALEBE.email as string);

  // the end is left as it was: it goes back as the stored instant
  await page.getByRole("button", { name: /^İzinleri düzenle: / }).click();
  await expect(edit.getByRole("checkbox", { name: SESSION })).toBeChecked();
  await edit.getByRole("checkbox", { name: SESSION }).click();
  await shot(page, "course-nazirs-edit-1440");
  await edit.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("İzinler kaydedildi").first()).toBeVisible();
  await expect(row).toContainText("1 izin");
  expect(await fixture?.grantsOf(TALEBE.sub as string, course)).toEqual([
    { permission: "recording.manage", expires_at: held.expires_at },
  ]);

  await page.getByRole("button", { name: /^İzinleri düzenle: / }).click();
  await edit.locator("input[name=endsAt]").fill("");
  await edit.getByRole("button", { name: "Kaydet" }).click();
  await expect(row).toContainText("Süresiz");
  expect(await fixture?.grantsOf(TALEBE.sub as string, course)).toEqual([
    { permission: "recording.manage", expires_at: null },
  ]);
  expect(
    (await fixture?.postsOf(TALEBE.sub as string, course))?.map(
      (p) => p.expires_at
    )
  ).toEqual([null]);

  const talebe = await as("TALEBE");
  await talebe.setViewportSize(desktop);
  await expectPages(talebe, fixture?.second.id, {
    open: { kayitlar: "Ders kayıtları" },
    refused: ["celseler", "mufredat", "ayarlar"],
  });
});

test("a person who holds the post already is refused in the dialog before sending, and by the API (409)", async ({
  as,
}) => {
  test.skip(!seeded() || !canSignIn(TALEBE), "no talebe to appoint");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page, fixture?.second.id);
  const appoint = await searchIn(page, TALEBE.email as string);
  await expect(appoint).toContainText("bu dersin ders nazırı zaten.");
  await expect(appoint.getByRole("button", { name: "Kaydet" })).toBeDisabled();
  await appoint.getByRole("button", { name: "Vazgeç" }).click();

  const again = await api(
    BASMUDERRIS,
    "POST",
    `/courses/${fixture?.second.id}/nazirs`,
    { userId: TALEBE.sub, permissions: ["session.manage"] }
  );
  expect([again.status, again.code]).toEqual([409, "COURSE_NAZIR_EXISTS"]);
  expect(
    await fixture?.postsOf(TALEBE.sub as string, fixture.second.id)
  ).toHaveLength(1);
  expect(
    await fixture?.grantsOf(TALEBE.sub as string, fixture.second.id)
  ).toEqual([{ permission: "recording.manage", expires_at: null }]);
});

test("a person appointed elsewhere while the dialog is open is worded from the API's 409, and the list is read again", async ({
  as,
}) => {
  test.skip(
    !seeded() || !canSignIn(DERS_NAZIR) || !DERS_NAZIR.sub,
    "no ders nazırı to appoint"
  );
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page, fixture?.second.id);
  const appoint = await searchIn(page, DERS_NAZIR.email as string);
  await expect(
    appoint.getByRole("heading", { name: "Seçilen ders nazırı" })
  ).toBeVisible();

  const made = await api(
    BASMUDERRIS,
    "POST",
    `/courses/${fixture?.second.id}/nazirs`,
    { userId: DERS_NAZIR.sub, permissions: [] }
  );
  expect(made.status).toBe(201);
  await appoint.getByRole("button", { name: "Kaydet" }).click();

  await expect(page.locator(".mds-toast--error")).toContainText(
    "Bu kişi bu dersin ders nazırı zaten."
  );
  await expect(appoint).toHaveCount(0);
  await expect(rowOf(page, DERS_NAZIR.email as string)).toContainText(
    "İzin yok"
  );
  const posts = (await fixture?.postsOf(
    DERS_NAZIR.sub as string,
    fixture.second.id
  )) as Array<{ id: string }>;
  expect(posts).toHaveLength(1);

  // and a post ended elsewhere while its dialog is open (404)
  await rowOf(page, DERS_NAZIR.email as string)
    .getByRole("button", { name: /^İzinleri düzenle: / })
    .click();
  const edit = dialog(page, "İzinleri düzenle");
  await edit.getByRole("checkbox", { name: RECORDING }).click();
  const ended = await api(
    BASMUDERRIS,
    "DELETE",
    `/courses/${fixture?.second.id}/nazirs/${posts[0].id}`
  );
  expect(ended.status).toBe(204);
  await edit.getByRole("button", { name: "Kaydet" }).click();
  await expect(
    page
      .locator(".mds-toast--error")
      .filter({ hasText: "İzinler kaydedilemedi" })
  ).toContainText("Bu ders nazırı artık yok; liste yenilendi.");
  await expect(edit).toHaveCount(0);
  await expect(rowOf(page, DERS_NAZIR.email as string)).toHaveCount(0);
  expect(
    await fixture?.grantsOf(
      DERS_NAZIR.sub as string,
      fixture?.second.id as string
    )
  ).toEqual([]);
});

test("a person who holds a seat over the course is refused by the API (409), worded, and the dialog stays open", async ({
  as,
}) => {
  const MEDARIS_NAZIM = account("MEDARIS_NAZIM");
  test.skip(!seeded() || !MEDARIS_NAZIM.email, "no Medaris nazımı account");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page, fixture?.second.id);
  const appoint = await searchIn(page, MEDARIS_NAZIM.email as string);
  await expect(
    appoint.getByRole("heading", { name: "Seçilen ders nazırı" })
  ).toBeVisible();
  await appoint.getByRole("checkbox", { name: SETTINGS }).click();
  await appoint.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.locator(".mds-toast--error")).toContainText(
    "Bu kişinin bu derste zaten bir görevi var"
  );
  await expect(appoint).toBeVisible();
  await expect(appoint.getByRole("checkbox", { name: SETTINGS })).toBeChecked();
  await appoint.getByRole("button", { name: "Vazgeç" }).click();
  expect(
    await fixture?.postsOf(
      MEDARIS_NAZIM.sub as string,
      fixture?.second.id as string
    )
  ).toHaveLength(0);
});

test("nobody appoints themselves: the dialog offers no way, and the API refuses (403 SELF_GRANT_REFUSED)", async ({
  as,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page, fixture?.second.id);
  const appoint = await searchIn(page, BASMUDERRIS.email as string);
  await expect(appoint).toContainText("Kendinizi ders nazırı yapamazsınız.");
  await expect(appoint.getByRole("button", { name: "Kaydet" })).toBeDisabled();
  await appoint.getByRole("button", { name: "Vazgeç" }).click();

  const self = await api(
    BASMUDERRIS,
    "POST",
    `/courses/${fixture?.second.id}/nazirs`,
    { userId: BASMUDERRIS.sub, permissions: ["session.manage"] }
  );
  expect([self.status, self.code]).toEqual([403, "SELF_GRANT_REFUSED"]);
  expect(
    await fixture?.postsOf(BASMUDERRIS.sub as string, fixture.second.id)
  ).toHaveLength(0);
});

test("an address no account has is not found in the dialog, and an unknown account is refused by the API (404)", async ({
  as,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page, fixture?.second.id);
  const appoint = await searchIn(
    page,
    `e2e-nobody-${randomUUID().slice(0, 8)}@example.test`
  );
  await expect(appoint).toContainText("Bu adresle bir hesap bulunamadı.");
  await expect(appoint.getByRole("button", { name: "Kaydet" })).toBeDisabled();
  await appoint.getByRole("button", { name: "Vazgeç" }).click();

  const ghost = randomUUID();
  const res = await api(
    BASMUDERRIS,
    "POST",
    `/courses/${fixture?.second.id}/nazirs`,
    { userId: ghost, permissions: [] }
  );
  expect([res.status, res.code]).toEqual([404, "COURSE_NAZIR_UNKNOWN_ACCOUNT"]);
  expect(await fixture?.postsOf(ghost, fixture.second.id)).toHaveLength(0);
});

test("the müderris dismisses the ders nazırı, asking first, and post and permissions end together (criterion 4)", async ({
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
  expect(
    await fixture?.postsOf(TALEBE.sub as string, fixture.second.id)
  ).toHaveLength(0);
  expect(
    await fixture?.grantsOf(TALEBE.sub as string, fixture.second.id)
  ).toEqual([]);

  const talebe = await as("TALEBE");
  await talebe.goto("/");
  await talebe.waitForURL(/\/erisim-yok$/);
});

test("a ders nazırı without course_nazir.assign is refused the page and sees no button; the API refuses the list and the appointment (403)", async ({
  as,
}) => {
  test.skip(
    !seeded() || !canSignIn(DERS_NAZIR) || !DERS_NAZIR.sub,
    "no ders nazırı"
  );
  const page = await as("DERS_NAZIR");
  await page.setViewportSize(desktop);
  await page.goto(`/ders/${fixture?.first.id}/nazirlar`);
  await expect(seen(page, FORBIDDEN)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ders nazırı ata" })
  ).toHaveCount(0);

  const list = await api(
    DERS_NAZIR,
    "GET",
    `/courses/${fixture?.first.id}/nazirs`
  );
  expect([list.status, list.code]).toEqual([403, "AUTHZ_FORBIDDEN"]);
  const made = await api(
    DERS_NAZIR,
    "POST",
    `/courses/${fixture?.first.id}/nazirs`,
    { userId: TALEBE.sub, permissions: [] }
  );
  expect([made.status, made.code]).toEqual([403, "AUTHZ_FORBIDDEN"]);
  expect(
    await fixture?.postsOf(TALEBE.sub as string, fixture.first.id)
  ).toHaveLength(0);
});

test("given course_nazir.assign, a ders nazırı appoints with no permission and ends only their own appointee; their own post stays out of reach", async ({
  as,
}) => {
  test.skip(
    !seeded() || !canSignIn(DERS_NAZIR) || !DERS_NAZIR.sub || !TALEBE.sub,
    "no ders nazırı"
  );
  const course = fixture?.first.id as string;
  const revoke = await (fixture as CourseAdminFixture).grant(
    DERS_NAZIR.sub as string,
    course,
    ["course_nazir.assign"]
  );
  try {
    // the müderris reads the list before the appointment below
    const muderris = await as("MEDRESE_BASMUDERRIS");
    await open(muderris, course);
    const appointer = rowOf(muderris, DERS_NAZIR.email as string);
    await expect(
      appointer.getByRole("button", { name: /^Görevden al: / })
    ).toBeEnabled();

    const page = await as("DERS_NAZIR");
    await open(page, course);
    await expect(seen(page, "Ders nazırı atayabilirsiniz.")).toBeVisible();
    const own = rowOf(page, DERS_NAZIR.email as string);
    await expect(own).toContainText("(siz)");
    await expect(own.getByRole("button")).toHaveCount(0);

    const appoint = await searchIn(page, TALEBE.email as string);
    await expect(
      appoint.getByRole("heading", { name: "Seçilen ders nazırı" })
    ).toBeVisible();
    await expect(appoint.getByRole("checkbox")).toHaveCount(0);
    await expect(appoint.getByTestId("appoint-only")).toBeVisible();
    await appoint.getByRole("button", { name: "Kaydet" }).click();
    await expect(page.getByText("Ders nazırı atandı").first()).toBeVisible();
    const row = rowOf(page, TALEBE.email as string);
    await expect(row).toContainText("İzin yok");
    await expect(
      row.getByRole("button", { name: /^İzinleri düzenle: / })
    ).toHaveCount(0);
    await expect(
      row.getByRole("button", { name: /^Görevden al: / })
    ).toBeEnabled();
    expect(await fixture?.grantsOf(TALEBE.sub as string, course)).toEqual([]);

    // the API: nothing given, no change of one's own post, no self-appointment
    if (MUDERRIS.sub) {
      const gift = await api(DERS_NAZIR, "POST", `/courses/${course}/nazirs`, {
        userId: MUDERRIS.sub,
        permissions: ["recording.manage"],
      });
      expect([gift.status, gift.code]).toEqual([403, "PERMISSION_NOT_GIVABLE"]);
      expect(await fixture?.postsOf(MUDERRIS.sub, course)).toHaveLength(0);
    }
    const [post] = (await fixture?.postsOf(
      DERS_NAZIR.sub as string,
      course
    )) as Array<{ id: string }>;
    const widen = await api(
      DERS_NAZIR,
      "PATCH",
      `/courses/${course}/nazirs/${post.id}`,
      { permissions: ["course_nazir.assign", "week.hide"], endsAt: null }
    );
    expect([widen.status, widen.code]).toEqual([403, "SELF_GRANT_REFUSED"]);
    const self = await api(DERS_NAZIR, "POST", `/courses/${course}/nazirs`, {
      userId: DERS_NAZIR.sub,
      permissions: [],
    });
    expect([self.status, self.code]).toEqual([403, "SELF_GRANT_REFUSED"]);
    expect(await fixture?.grantsOf(DERS_NAZIR.sub as string, course)).toEqual([
      { permission: "course_nazir.assign", expires_at: null },
    ]);

    // the müderris dismisses the appointer only after their appointee: his
    // list was read before, so the API's 409 says it and the list is read again
    await appointer.getByRole("button", { name: /^Görevden al: / }).click();
    await dialog(muderris, "Görevden al")
      .getByRole("button", { name: "Görevden al" })
      .click();
    await expect(muderris.locator(".mds-toast--error")).toContainText(
      "Bu ders nazırının atadığı ders nazırları var; önce onları görevden alın."
    );
    await expect(
      appointer.getByRole("button", { name: /^Görevden al: / })
    ).toBeDisabled();
    await expect(appointer).toContainText(
      "Önce bu kişinin atadığı 1 ders nazırını görevden alın."
    );
    expect(
      await fixture?.postsOf(DERS_NAZIR.sub as string, course)
    ).toHaveLength(1);

    await row.getByRole("button", { name: /^Görevden al: / }).click();
    const ask = dialog(page, "Görevden al");
    await ask.getByRole("button", { name: "Görevden al" }).click();
    await expect(page.getByText("Görevden alındı").first()).toBeVisible();
    await expect(rowOf(page, TALEBE.email as string)).toHaveCount(0);
    expect(await fixture?.postsOf(TALEBE.sub as string, course)).toHaveLength(
      0
    );
  } finally {
    await revoke();
  }
});

test("on a passive course the müderris hands on only what he still holds: the boxes are off and the API refuses the rest (ceiling, 403)", async ({
  as,
}) => {
  test.skip(!seeded() || !canSignIn(TALEBE), "no talebe to appoint");
  const course = fixture?.second.id as string;
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page, course);
  const opened = await searchIn(page, TALEBE.email as string);
  await opened.getByRole("checkbox", { name: RECORDING }).click();
  // the medrese's başmüderris leaves: its courses turn passive, and their
  // content codes close to the müderris (MDRS-136)
  const reseat = await (fixture as CourseAdminFixture).makeMedresePassive();
  try {
    // a dialog opened before that meets the ceiling at Kaydet
    await opened.getByRole("button", { name: "Kaydet" }).click();
    await expect(page.locator(".mds-toast--error")).toContainText(
      "Kendinizde olmayan bir izni veremezsiniz."
    );
    await expect(opened).toBeVisible();
    await opened.getByRole("button", { name: "Vazgeç" }).click();
    expect(await fixture?.postsOf(TALEBE.sub as string, course)).toHaveLength(
      0
    );

    await page.reload();
    const appoint = await searchIn(page, TALEBE.email as string);
    await expect(
      appoint.getByRole("heading", { name: "Seçilen ders nazırı" })
    ).toBeVisible();
    await expect(
      appoint.getByRole("checkbox", { name: RECORDING })
    ).toBeDisabled();
    await expect(
      appoint.getByRole("checkbox", { name: SESSION })
    ).toBeDisabled();
    await expect(
      appoint.getByRole("checkbox", { name: SETTINGS })
    ).toBeEnabled();
    await expect(
      appoint.getByRole("checkbox", { name: PUBLISH })
    ).toBeEnabled();
    await shot(page, "course-nazirs-passive-1440");

    const over = await api(BASMUDERRIS, "POST", `/courses/${course}/nazirs`, {
      userId: TALEBE.sub,
      permissions: ["course.settings", "recording.manage"],
    });
    expect([over.status, over.code]).toEqual([403, "GRANT_EXCEEDS_GIVER"]);
    expect(await fixture?.postsOf(TALEBE.sub as string, course)).toHaveLength(
      0
    );

    await appoint.getByRole("checkbox", { name: SETTINGS }).click();
    await appoint.getByRole("button", { name: "Kaydet" }).click();
    await expect(page.getByText("Ders nazırı atandı").first()).toBeVisible();
    await expect(rowOf(page, TALEBE.email as string)).toContainText("1 izin");
    expect(await fixture?.grantsOf(TALEBE.sub as string, course)).toEqual([
      { permission: "course.settings", expires_at: null },
    ]);

    // what was given opens Ders ayarları, shut without "Dersi düzenle"
    const talebe = await as("TALEBE");
    await talebe.setViewportSize(desktop);
    await expectPages(talebe, course, {
      open: { ayarlar: "Ders ayarları" },
      refused: ["kayitlar", "celseler"],
    });
    await talebe.goto(`/ders/${course}/ayarlar`);
    await expect(
      seen(
        talebe,
        "Bu ayarları değiştirmek için “Dersi düzenle” izni de gerekir."
      )
    ).toBeVisible();
    await expect(
      talebe.getByRole("checkbox", { name: "Kapalı ders" })
    ).toBeDisabled();
    await expect(talebe.getByRole("button", { name: "Kaydet" })).toHaveCount(0);
  } finally {
    await reseat();
    const posts = (await fixture?.postsOf(TALEBE.sub as string, course)) ?? [];
    for (const post of posts) {
      await api(BASMUDERRIS, "DELETE", `/courses/${course}/nazirs/${post.id}`);
    }
  }
});

test("the başnazım opens any course's Ders nazırları by its address, gives from the whole catalog, and cannot pick himself", async ({
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
  const appoint = await searchIn(page, ADMIN.email as string);
  await expect(appoint).toContainText("Kendinizi ders nazırı yapamazsınız.");
  await expect(appoint.getByRole("button", { name: "Kaydet" })).toBeDisabled();
  for (const box of [RECORDING, SESSION, SETTINGS, PUBLISH]) {
    await expect(appoint.getByRole("checkbox", { name: box })).toBeEnabled();
  }
  await appoint.getByRole("button", { name: "Vazgeç" }).click();

  // a course that is not there is the portal's 404, not the retry state
  await page.goto(`/ders/${randomUUID()}/nazirlar`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Sayfa bulunamadı" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Ders nazırları" })
  ).toHaveCount(0);
});
