import type { Page } from "@playwright/test";
import pg from "pg";
import { account, canSignIn, expect, test } from "./accounts";
import { type ArchiveFixture, seedArchive } from "./archive-seed";
import { type NazirFixture, seedPortal } from "./seed";

/**
 * Design nazir/12 (Arşiv) against the running app and API with real Keycloak
 * sign-ins (MDRS-185). The archive is the medrese başmüderris's; a MEDRESE_NAZIR
 * is only asked what the open owner decision allows: the API refuses it, and the
 * page says so. The seed hides a course, a week and three sessions by three
 * kinds of hider, so that the same list has a "Geri al" and the two sentences
 * that stand in its place. "Medreseyi gizle" runs on a medrese of its own,
 * because the medrese stays hidden afterwards.
 */
const BASMUDERRIS = account("MEDRESE_BASMUDERRIS");
const MEDRESE_NAZIR = account("MEDRESE_NAZIR");

let base: NazirFixture | undefined;
let archive: ArchiveFixture | undefined;

test.beforeAll(async () => {
  if (!BASMUDERRIS.sub) return;
  base = await seedPortal({
    basmuderris: BASMUDERRIS.sub,
    medreseNazir: MEDRESE_NAZIR.sub,
  });
});

test.afterAll(async () => {
  await base?.remove();
});

// Bringing an item back changes the list the next spec reads, so each has its own.
test.beforeEach(async () => {
  if (base && BASMUDERRIS.sub)
    archive = await seedArchive(base, BASMUDERRIS.sub);
});

test.afterEach(async () => {
  await archive?.remove();
  archive = undefined;
});

const ready = () => Boolean(base && archive && canSignIn(BASMUDERRIS));

const open = async (page: Page, query = "") => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/medrese/${base?.madrasah.id}/arsiv${query}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Arşiv" })
  ).toBeVisible();
};

const rows = (page: Page) =>
  page.locator("[data-testid=archive] tbody tr:visible");
const rowOf = (page: Page, text: string) =>
  rows(page).filter({ hasText: text });

test("nazir/12 — the tabs count what is hidden, and each asks for its own kind", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  const tabs = page.getByRole("navigation", { name: "Arşivdeki öğe türleri" });
  await expect(tabs).toContainText("Tümü5");
  await expect(tabs).toContainText("Dersler1");
  await expect(tabs).toContainText("Haftalar ve celseler4");
  await expect(tabs).toContainText("Ders kayıtları0");
  await expect(rows(page)).toHaveCount(5);

  await tabs.getByRole("link", { name: /^Dersler/ }).click();
  await expect(page).toHaveURL(/tur=ders/);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText(archive?.course.title ?? "");

  await tabs.getByRole("link", { name: /^Haftalar ve celseler/ }).click();
  await expect(rows(page)).toHaveCount(4);

  await tabs.getByRole("link", { name: /^Ders kayıtları/ }).click();
  await expect(
    page.getByText("Bu medresede gizlenmiş bir ders kaydı yok.")
  ).toBeVisible();
});

test("nazir/12 — each row names the item, its kind, who hid it and when, newest first (criterion 4)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);

  // newest hidden first: the köşk nazımı's of yesterday, the account's of two days ago, the course of three, the week of five
  const titles = await rows(page).locator("th").allInnerTexts();
  const order = [
    archive?.sessionOfKosk.title,
    archive?.sessionOfAdmin.title,
    archive?.course.title,
    archive?.sessionOfHead.title,
    archive?.week.title,
  ].map((title) => titles.findIndex((text) => text.includes(title ?? "?")));
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect(order.every((index) => index >= 0)).toBe(true);

  const kosk = rowOf(page, archive?.sessionOfKosk.title ?? "");
  await expect(kosk).toContainText("Celse");
  await expect(kosk).toContainText(base?.first.title ?? "");
  await expect(kosk).toContainText("Hafta 1");
  await expect(kosk).toContainText(archive?.koskNazim.name ?? "");
  await expect(kosk).toContainText("Köşk nazımı");
  await expect(kosk).toContainText(/Dün \d{2}:\d{2}/);

  const course = rowOf(page, archive?.course.title ?? "");
  await expect(course).toContainText("Ders");
  await expect(course).toContainText(base?.first.koskName ?? "");
  await expect(course).toContainText("(siz)");
  await expect(course).toContainText(/\d{1,2} \p{L}+ \d{2}:\d{2}/u);

  await expect(rowOf(page, archive?.week.title ?? "")).toContainText("Hafta");
});

test("nazir/12 — a kademe below the one that hid an item gets the sentence, not the button (criterion 2)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);

  const kosk = rowOf(page, archive?.sessionOfKosk.title ?? "");
  await expect(kosk.getByRole("button", { name: /^Geri al/ })).toHaveCount(0);
  await expect(kosk).toContainText(
    "Bunu köşk nazımı gizledi; yalnız o kademe ya da üstü geri alabilir."
  );
  const admin = rowOf(page, archive?.sessionOfAdmin.title ?? "");
  await expect(admin.getByRole("button", { name: /^Geri al/ })).toHaveCount(0);
  await expect(admin).toContainText(
    "Bunu Medaris yönetimi gizledi; yalnız o kademe ya da üstü geri alabilir."
  );
  await expect(admin).toContainText(archive?.admin.name ?? "");

  // what the başmüderris hid themself is theirs to bring back
  for (const title of [
    archive?.course.title,
    archive?.sessionOfHead.title,
    archive?.week.title,
  ]) {
    await expect(
      rowOf(page, title ?? "").getByRole("button", { name: /^Geri al/ })
    ).toBeVisible();
  }
  // the design's "itiraz edildi" has no field behind it
  await expect(page.getByText("İtiraz edildi")).toHaveCount(0);
});

test("nazir/12 — 'Geri al' brings a week back at once: it leaves the list and shows in its place (criterion 1)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  await rowOf(page, archive?.week.title ?? "")
    .getByRole("button", { name: /^Geri al/ })
    .click();

  await expect(page.getByText("Geri alındı")).toBeVisible();
  await expect(rowOf(page, archive?.week.title ?? "")).toHaveCount(0);
  await expect(rows(page)).toHaveCount(4);
  expect(await archive?.isHidden("course_weeks", archive?.week.id ?? "")).toBe(
    false
  );
  // the others stay hidden
  expect(
    await archive?.isHidden("lessons", archive?.sessionOfKosk.id ?? "")
  ).toBe(true);
});

test("nazir/12 — 'Geri al' brings a course back, with the weeks it holds; the tab counts follow", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  await rowOf(page, archive?.course.title ?? "")
    .getByRole("button", { name: /^Geri al/ })
    .click();
  await expect(page.getByText("Geri alındı")).toBeVisible();
  await expect(rowOf(page, archive?.course.title ?? "")).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Arşivdeki öğe türleri" })
  ).toContainText("Dersler0");
  expect(await archive?.isHidden("courses", archive?.course.id ?? "")).toBe(
    false
  );
});

test("nazir/12 — a long list is paged ten at a time", async ({ as }) => {
  test.skip(!ready(), "no medrese başmüderris");
  await archive?.hideWeeks(7);
  const page = await as("MEDRESE_BASMUDERRIS");
  await open(page);
  await expect(rows(page)).toHaveCount(10);
  await expect(page.getByText("1–10 / 12")).toBeVisible();

  await page.getByRole("link", { name: "Sonraki" }).click();
  await expect(page).toHaveURL(/sayfa=2/);
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByText("11–12 / 12")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sonraki" })).toHaveCount(0);
  await page.getByRole("link", { name: "Önceki" }).click();
  await expect(rows(page)).toHaveCount(10);
});

test("nazir/12 — 'Medreseyi gizle' asks first, hides the medrese and its courses together, and deletes nothing (criterion 3)", async ({
  as,
}) => {
  test.skip(!ready(), "no medrese başmüderris");
  // the medrese stays hidden afterwards, so this one is its own
  const own = await seedPortal({ basmuderris: BASMUDERRIS.sub ?? "" });
  const client = new pg.Client({
    connectionString: process.env.E2E_DATABASE_URL,
  });
  await client.connect();
  try {
    const page = await as("MEDRESE_BASMUDERRIS");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/medrese/${own.madrasah.id}/arsiv`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Arşiv" })
    ).toBeVisible();
    await expect(
      page.getByText(
        "Hiçbir şey silinmez; medreseyi, onu gizleyen kademe ya da üstü geri getirir: sizin gizlediğinizi siz ya da Medaris yönetimi."
      )
    ).toBeVisible();

    await page.getByRole("button", { name: "Medreseyi gizle" }).click();
    const ask = page.getByRole("alertdialog", { name: "Medreseyi gizle" });
    await expect(ask).toContainText(own.madrasah.name);
    await expect(ask.getByRole("button", { name: "Vazgeç" })).toBeFocused();
    await ask.getByRole("button", { name: "Vazgeç" }).click();
    const before = await client.query(
      "select archived_at from madrasahs where id = $1",
      [own.madrasah.id]
    );
    expect(before.rows[0].archived_at).toBeNull();

    await page.getByRole("button", { name: "Medreseyi gizle" }).click();
    await ask.getByRole("button", { name: "Gizle" }).click();
    await expect(page.getByText("Medrese gizlendi").first()).toBeVisible();

    const medrese = await client.query(
      "select archived_at, archived_by from madrasahs where id = $1",
      [own.madrasah.id]
    );
    expect(medrese.rows[0].archived_by).toBe(BASMUDERRIS.sub);
    const courses = await client.query(
      "select archived_at from courses where id = any($1)",
      [[own.first.id, own.second.id]]
    );
    expect(courses.rows).toHaveLength(2);
    // the courses are hidden at the same instant: Medaris yönetimi brings them back together
    for (const row of courses.rows) {
      expect(row.archived_at.getTime()).toBe(
        medrese.rows[0].archived_at.getTime()
      );
    }
    await client.query("delete from audit_log where entity_id = $1", [
      own.madrasah.id,
    ]);

    // the başmüderris still opens the archive, and its courses cannot be brought back from here
    await page.reload();
    await expect(rows(page)).toHaveCount(2);
    await rows(page)
      .first()
      .getByRole("button", { name: /^Geri al/ })
      .click();
    await expect(
      page.getByText("Medreseyi, onu gizleyen kademe ya da üstü geri getirir.")
    ).toBeVisible();
  } finally {
    await client.end();
    await own.remove();
  }
});

test("nazir/12 — a medrese nazır is refused: a notice, no list and no way to hide the medrese", async ({
  as,
}) => {
  test.skip(!(ready() && canSignIn(MEDRESE_NAZIR)), "no medrese nazır account");
  const page = await as("MEDRESE_NAZIR");
  await open(page);
  await expect(page.getByText("Bu sayfaya izniniz yok")).toBeVisible();
  await expect(page.getByTestId("archive")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Medreseyi gizle" })
  ).toHaveCount(0);
});
