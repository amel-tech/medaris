import type { BrowserContext, Page } from "@playwright/test";
import { account, canSignIn, expect, test } from "./accounts";
import { type CourseAdminFixture, seedCourseAdmin } from "./course-admin-seed";

/**
 * Ders ayarları of a course (MDRS-270) against the running app and API with
 * real Keycloak sign-ins. MEDRESE_BASMUDERRIS is the müderris of both seeded
 * courses and writes only to them: the seed's `remove` takes them out again.
 * DERS_NAZIR is seeded on the first course with no permission; the specs that
 * need some give them as the müderris would and take them back. SISTEM_ADMIN
 * opens the page by its address. A visitor reads the first course in tedris
 * when E2E_TEDRIS_URL names a running tedris (the address nazar's
 * "Tanıtım sayfasını gör" links to); without it that spec is skipped.
 */
const BASMUDERRIS = account("MEDRESE_BASMUDERRIS");
const DERS_NAZIR = account("DERS_NAZIR");
const ADMIN = account("SISTEM_ADMIN");
const TEDRIS = process.env.E2E_TEDRIS_URL;

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

const seeded = () => Boolean(fixture && canSignIn(BASMUDERRIS));
const withDersNazir = () =>
  Boolean(fixture && canSignIn(DERS_NAZIR) && DERS_NAZIR.sub);
const desktop = { width: 1440, height: 900 };

const open = async (page: Page, courseId: string | undefined) => {
  await page.setViewportSize(desktop);
  await page.goto(`/ders/${courseId}/ayarlar`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Ders ayarları" })
  ).toBeVisible();
};

const closed = (page: Page) =>
  page.getByRole("checkbox", { name: "Kapalı ders" });
const approval = (page: Page) =>
  page.getByRole("checkbox", { name: "Kayıt onayı gereksin" });
const sample = (page: Page) =>
  page.getByRole("combobox", { name: "Örnek ders" });
const zone = (page: Page) =>
  page.getByRole("combobox", { name: "Saat dilimi" });
const save = (page: Page) => page.getByRole("button", { name: "Kaydet" });
const choose = async (select: ReturnType<typeof sample>, option: string) => {
  await select.click();
  await select
    .page()
    .getByRole("option", { name: option, exact: true })
    .click();
};
/** Waits for the save's toast and closes it, so that the next save waits for a toast of its own. */
const saved = async (page: Page) => {
  const toast = page
    .locator(".mds-toast--success")
    .filter({ hasText: "Ders ayarları kaydedildi" });
  await expect(toast).toBeVisible();
  // the kit hides a toast from the accessibility tree until it is expanded
  await toast.locator(".mds-toast__close").click();
  await expect(toast).toHaveCount(0);
};

/** Gives the ders nazırı these codes on the first course for the length of `run`. */
const holding = async (codes: readonly string[], run: () => Promise<void>) => {
  const revoke = await (fixture as CourseAdminFixture).grant(
    DERS_NAZIR.sub as string,
    fixture?.first.id as string,
    codes
  );
  try {
    await run();
  } finally {
    await revoke();
  }
};

test("the müderris finds every control open, and Kaydet waiting for a change", async ({
  as,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page, fixture?.first.id);

  await expect(page.getByText("Bu sayfa henüz hazır değil.")).toHaveCount(0);
  await expect(closed(page)).toBeEnabled();
  await expect(approval(page)).toBeEnabled();
  await expect(sample(page)).toBeEnabled();
  await expect(zone(page)).toBeEnabled();
  await expect(save(page)).toBeDisabled();
  await expect(
    page.locator("aside").getByRole("link", { name: /^Ders ayarları/ })
  ).toHaveAttribute("aria-current", "page");
});

test("the müderris changes every setting, and each one is read back after a reload", async ({
  as,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  const course = fixture?.first.id as string;
  await open(page, course);
  const before = await fixture?.courseOf(course);
  expect(before).toMatchObject({
    is_closed: false,
    time_zone: "Europe/Istanbul",
    sample: null,
  });

  await closed(page).check();
  await approval(page).setChecked(!before?.requires_approval);
  await choose(sample(page), "Hafta 1 · Celse 1");
  await choose(zone(page), "Berlin");
  await save(page).click();
  await saved(page);

  await page.reload();
  await expect(closed(page)).toBeChecked();
  await expect(approval(page)).toBeChecked({
    checked: !before?.requires_approval,
  });
  await expect(sample(page)).toHaveText("Hafta 1 · Celse 1");
  await expect(zone(page)).toHaveText("Berlin");
  await expect(save(page)).toBeDisabled();
  expect(await fixture?.courseOf(course)).toMatchObject({
    is_closed: true,
    requires_approval: !before?.requires_approval,
    time_zone: "Europe/Berlin",
    sample: "Celse 1",
  });

  // and back: the course opened again, no sample, Istanbul
  await closed(page).uncheck();
  await approval(page).setChecked(Boolean(before?.requires_approval));
  await choose(sample(page), "Örnek ders yok");
  await choose(zone(page), "İstanbul");
  await save(page).click();
  await saved(page);
  await page.reload();
  await expect(closed(page)).not.toBeChecked();
  await expect(approval(page)).toBeChecked({
    checked: Boolean(before?.requires_approval),
  });
  await expect(sample(page)).toHaveText("Örnek ders yok");
  await expect(zone(page)).toHaveText("İstanbul");
  expect(await fixture?.courseOf(course)).toEqual(before);
});

test("moving the sample session takes it off the old one, and a save on a stale page is worded and read again", async ({
  as,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const course = fixture?.first.id as string;
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page, course);
  // a second tab, read before the first one saves
  const stale = await page.context().newPage();
  await open(stale, course);

  await choose(sample(page), "Hafta 1 · Celse 1");
  await save(page).click();
  await saved(page);
  await choose(sample(page), "Hafta 1 · Celse 2");
  await save(page).click();
  await saved(page);
  expect((await fixture?.courseOf(course))?.sample).toBe("Celse 2");

  await choose(zone(stale), "Berlin");
  await choose(sample(stale), "Hafta 1 · Celse 1");
  await save(stale).click();
  await expect(stale.locator(".mds-toast--error")).toContainText(
    "Ders, bu sayfayı açtığınızdan beri başkası tarafından kaydedildi; ayarlar yeniden okundu. Yeniden deneyin."
  );
  expect(await fixture?.courseOf(course)).toMatchObject({
    sample: "Celse 2",
    time_zone: "Europe/Istanbul",
  });
  // read again, the page shows what is stored, and the next save goes through
  await expect(sample(stale)).toHaveText("Hafta 1 · Celse 2");
  await choose(sample(stale), "Örnek ders yok");
  await save(stale).click();
  await saved(stale);
  expect((await fixture?.courseOf(course))?.sample).toBeNull();
});

test("'Yayımla' and 'Taslağa çek' keep a change that is not saved yet", async ({
  as,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const course = fixture?.second.id as string;
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page, course);
  const before = await fixture?.courseOf(course);
  await approval(page).setChecked(!before?.requires_approval);
  await expect(save(page)).toBeEnabled();

  const card = page.getByTestId("course-publish");
  await card.getByRole("button", { name: "Taslağa çek" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Taslağa çek" })
    .click();
  await expect(card).toContainText("Taslak");
  await card.getByRole("button", { name: "Yayımla" }).click();
  await expect(card).toContainText("Yayında");
  await expect(approval(page)).toBeChecked({
    checked: !before?.requires_approval,
  });
  await expect(save(page)).toBeEnabled();
  expect((await fixture?.courseOf(course))?.requires_approval).toBe(
    before?.requires_approval
  );
  await page.getByRole("button", { name: "Vazgeç" }).click();
  await expect(approval(page)).toBeChecked({
    checked: Boolean(before?.requires_approval),
  });
});

test("'Taslağa çek' asks first with the focus on 'Vazgeç', and each status is read back after a reload", async ({
  as,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  const course = fixture?.second.id as string;
  await open(page, course);

  const card = page.getByTestId("course-publish");
  await expect(card).toContainText("Yayında");
  await card.getByRole("button", { name: "Taslağa çek" }).click();
  const ask = page.getByRole("alertdialog");
  await expect(ask).toContainText("Dersi taslağa çek");
  await expect(ask.getByRole("button", { name: "Vazgeç" })).toBeFocused();
  await ask.getByRole("button", { name: "Taslağa çek" }).click();
  await expect(card).toContainText("Taslak");
  await page.reload();
  await expect(page.getByTestId("course-publish")).toContainText("Taslak");
  expect((await fixture?.courseOf(course))?.status).toBe("DRAFT");

  await page
    .getByTestId("course-publish")
    .getByRole("button", { name: "Yayımla" })
    .click();
  await expect(page.getByTestId("course-publish")).toContainText("Yayında");
  await page.reload();
  await expect(page.getByTestId("course-publish")).toContainText("Yayında");
  expect((await fixture?.courseOf(course))?.status).toBe("PUBLISHED");
});

test("a closed course hides its public recording from a visitor in tedris, and opening it shows it again", async ({
  as,
  browser,
}) => {
  test.skip(!seeded(), "no medrese başmüderris");
  test.skip(!TEDRIS, "E2E_TEDRIS_URL names no running tedris");
  const course = fixture?.first.id as string;
  const title = `E2E herkese açık kayıt ${course.slice(0, 8)}`;
  const removeRecording = await (
    fixture as CourseAdminFixture
  ).addPublicRecording(title);
  let visitor: BrowserContext | undefined;
  try {
    const page = await as("MEDRESE_BASMUDERRIS");
    await open(page, course);
    const href = await page
      .getByRole("link", { name: /^Tanıtım sayfasını gör/ })
      .getAttribute("href");
    expect(href).toBe(`${TEDRIS}/tr/courses/${course}`);

    // a visitor, signed in nowhere; the player's frame is not loaded
    visitor = await browser.newContext();
    await visitor.route(/youtube|youtu\.be|ytimg|googlevideo/, (route) =>
      route.abort()
    );
    const reader = await visitor.newPage();
    const recordings = async () => {
      await reader.goto(`${href}?tab=kayitlar`);
      return reader.getByRole("tabpanel", { name: /^Ders kayıtları/ });
    };
    await expect(await recordings()).toContainText(title);

    await closed(page).check();
    await save(page).click();
    await saved(page);
    const shut = await recordings();
    await expect(shut).toContainText(
      "Bu derste henüz yayımlanmış ders kaydı yok."
    );
    await expect(shut).not.toContainText(title);

    await closed(page).uncheck();
    await save(page).click();
    await saved(page);
    await expect(await recordings()).toContainText(title);
  } finally {
    await visitor?.close();
    await removeRecording();
  }
});

test("a ders nazırı with session.manage alone may change the sample session, and nothing else", async ({
  as,
}) => {
  test.skip(!withDersNazir(), "no ders nazırı");
  await holding(["session.manage"], async () => {
    const page = await as("DERS_NAZIR");
    await open(page, fixture?.first.id);
    await expect(sample(page)).toBeEnabled();
    await expect(closed(page)).toBeDisabled();
    await expect(approval(page)).toBeDisabled();
    await expect(zone(page)).toBeDisabled();
    await expect(
      page.getByTestId("course-publish").getByRole("button")
    ).toHaveCount(0);

    await choose(sample(page), "Hafta 1 · Celse 2");
    await save(page).click();
    await saved(page);
    await page.reload();
    await expect(sample(page)).toHaveText("Hafta 1 · Celse 2");
    expect((await fixture?.courseOf(fixture?.first.id as string))?.sample).toBe(
      "Celse 2"
    );

    await choose(sample(page), "Örnek ders yok");
    await save(page).click();
    await saved(page);
  });
});

test("a ders nazırı with course.edit and course.settings changes the two boxes and the zone, and may not publish", async ({
  as,
}) => {
  test.skip(!withDersNazir(), "no ders nazırı");
  await holding(["course.edit", "course.settings"], async () => {
    const page = await as("DERS_NAZIR");
    const course = fixture?.first.id as string;
    await open(page, course);
    await expect(closed(page)).toBeEnabled();
    await expect(approval(page)).toBeEnabled();
    await expect(zone(page)).toBeEnabled();
    await expect(sample(page)).toBeDisabled();
    await expect(page.getByTestId("course-publish")).toContainText("Yayında");
    await expect(
      page.getByTestId("course-publish").getByRole("button")
    ).toHaveCount(0);

    const before = await fixture?.courseOf(course);
    await approval(page).setChecked(!before?.requires_approval);
    await save(page).click();
    await saved(page);
    await page.reload();
    await expect(approval(page)).toBeChecked({
      checked: !before?.requires_approval,
    });
    expect((await fixture?.courseOf(course))?.requires_approval).toBe(
      !before?.requires_approval
    );
    await approval(page).setChecked(Boolean(before?.requires_approval));
    await save(page).click();
    await saved(page);
  });
});

test("a ders nazırı with course.settings and course.publish but no course.edit sees every control shut and is told why", async ({
  as,
}) => {
  test.skip(!withDersNazir(), "no ders nazırı");
  await holding(["course.settings", "course.publish"], async () => {
    const page = await as("DERS_NAZIR");
    await open(page, fixture?.first.id);
    for (const control of [closed, approval, sample, zone]) {
      await expect(control(page)).toBeDisabled();
    }
    await expect(
      page.getByText(
        "Bu ayarları değiştirmek için “Dersi düzenle” izni de gerekir."
      )
    ).toBeVisible();
    await expect(
      page.getByText(
        "Bu ayarları değiştirme izniniz yok; yalnız görebilirsiniz."
      )
    ).toBeVisible();
    await expect(save(page)).toHaveCount(0);
    await expect(
      page.getByTestId("course-publish").getByRole("button")
    ).toHaveCount(0);
  });
});

test("a save the API refuses is worded as a refusal, and nothing is written", async ({
  as,
}) => {
  test.skip(!withDersNazir(), "no ders nazırı");
  const course = fixture?.first.id as string;
  const page = await as("DERS_NAZIR");
  // the page opens while the codes are held; they are taken back before Kaydet
  await holding(["course.edit", "course.settings"], async () => {
    await open(page, course);
    await closed(page).check();
  });
  await save(page).click();
  const refusal = page.locator(".mds-toast--error");
  await expect(refusal).toContainText("Ayarlar kaydedilemedi");
  await expect(refusal).toContainText("Bunu yapma izniniz yok.");
  expect((await fixture?.courseOf(course))?.is_closed).toBe(false);

  await page.reload();
  await expect(
    page.getByText("Bu sayfaya izniniz yok").filter({ visible: true })
  ).toBeVisible();
});

test("a ders nazırı with no permission is told so, and is shown no control", async ({
  as,
}) => {
  test.skip(!withDersNazir(), "no ders nazırı");
  const page = await as("DERS_NAZIR");
  await open(page, fixture?.first.id);

  await expect(page.getByText("Bu sayfaya izniniz yok")).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(save(page)).toHaveCount(0);
});

test("the başnazım opens the page by its address, with every control open", async ({
  as,
}) => {
  test.skip(!fixture || !canSignIn(ADMIN), "no başnazım");
  const page = await as("SISTEM_ADMIN");
  await open(page, fixture?.first.id);

  await expect(closed(page)).toBeEnabled();
  await expect(zone(page)).toBeEnabled();
  await expect(
    page.getByTestId("course-publish").getByRole("button")
  ).toHaveCount(1);
});
