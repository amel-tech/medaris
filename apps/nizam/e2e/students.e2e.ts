import { expect, type Page, test } from "@playwright/test";
import { type StudentFixture, seedStudents } from "./student-seed";

/**
 * Design nizam/58 (Talebeler → Kayıtlı, Dersten çıkar, Erişimi kaldırılanlar)
 * against the running app and API, with real Keycloak sign-ins (MDRS-178). A
 * spec whose account is not in the environment (E2E_<ROLE>_EMAIL, _PASSWORD,
 * _SUB) is skipped.
 */
const account = (role: string) => ({
  email: process.env[`E2E_${role}_EMAIL`],
  password: process.env[`E2E_${role}_PASSWORD`],
  sub: process.env[`E2E_${role}_SUB`],
});
const KOSK_NAZIM = account("KOSK_NAZIM");
const MUDERRIS = account("MUDERRIS");

const seedable = Boolean(KOSK_NAZIM.sub && KOSK_NAZIM.password && MUDERRIS.sub);
let fixture: StudentFixture;

test.beforeEach(async () => {
  if (!seedable) return;
  fixture = await seedStudents({
    nazim: KOSK_NAZIM.sub as string,
    muderris: MUDERRIS.sub as string,
  });
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

const studentsUrl = () =>
  `/tr/kosks/${fixture.koskId}/courses/${fixture.course.id}/students`;
const openTab = async (page: Page, name: RegExp) => {
  await page.goto(studentsUrl());
  await page.getByRole("tab", { name }).click();
};
const person = (index: number) =>
  fixture.enrolled[index] as StudentFixture["enrolled"][number];
const bodyRows = (page: Page) => page.locator("tbody tr");

test("nizam/58 — the tabs carry the counts: Kayıtlı 8, Tamamlayanlar 1, Erişimi kaldırılanlar 0", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(studentsUrl());
  const tabs = page.getByRole("tablist");
  await expect(tabs.getByRole("tab", { name: /^Başvurular/ })).toBeVisible();
  await expect(tabs.getByRole("tab", { name: /^Kayıtlı/ })).toContainText("8");
  await expect(tabs.getByRole("tab", { name: /^Tamamlayanlar/ })).toContainText(
    "1"
  );
  await expect(
    tabs.getByRole("tab", { name: /^Erişimi kaldırılanlar/ })
  ).toContainText("0");
});

test("nizam/58 — Kayıtlı shows six rows with the total, and 'Daha fazla göster' brings the rest (criterion 1)", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await openTab(page, /^Kayıtlı/);

  await expect(bodyRows(page)).toHaveCount(6);
  await expect(
    page.getByTestId("roster-showing").filter({ visible: true })
  ).toHaveText("8 talebeden 6 tanesi gösteriliyor");
  await page.getByRole("button", { name: "Daha fazla göster" }).click();
  await expect(bodyRows(page)).toHaveCount(8);
  await expect(
    page.getByTestId("roster-showing").filter({ visible: true })
  ).toHaveText("8 talebeden 8 tanesi gösteriliyor");
  await expect(
    page.getByRole("button", { name: "Daha fazla göster" })
  ).toHaveCount(0);
});

test("nizam/58 — the search narrows by name and by e-mail (criterion 2)", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await openTab(page, /^Kayıtlı/);
  const search = page.getByRole("searchbox", { name: "Talebe ara" });

  await search.fill("furkan");
  await expect(bodyRows(page)).toHaveCount(1);
  await expect(bodyRows(page).first()).toContainText("Furkan Yurtsever");
  await search.fill(person(1).email.toUpperCase());
  await expect(bodyRows(page)).toHaveCount(1);
  await expect(bodyRows(page).first()).toContainText("Bilal Yurtsever");
  await search.fill("kimse yok");
  await expect(
    page.getByText("Aramaya uyan talebe yok").filter({ visible: true })
  ).toBeVisible();
});

test("nizam/58 — the progress bar shows the value the talebe entered (criterion 3)", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await openTab(page, /^Kayıtlı/);

  for (const p of fixture.enrolled.slice(0, 6)) {
    const bar = bodyRows(page)
      .filter({ hasText: p.name })
      .getByRole("progressbar");
    await expect(bar).toHaveAttribute("aria-valuenow", String(p.progress));
    await expect(bar).toHaveAccessibleName(
      `Talebenin girdiği ilerleme: ${p.name}`
    );
  }
  await expect(
    page
      .getByText(
        "İlerlemeyi talebe kendisi girer; dersi tamamladığını ders kadrosu onaylar."
      )
      .filter({ visible: true })
  ).toBeVisible();
});

test("nizam/58 — 'Dersten çıkar' needs a reason; the talebe leaves Kayıtlı and appears under Erişimi kaldırılanlar with it (criterion 4)", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await openTab(page, /^Kayıtlı/);
  const target = person(0);

  await page
    .getByRole("button", { name: `Dersten çıkar: ${target.name}` })
    .click();
  const dialog = page.getByRole("dialog", { name: "Dersten çıkar" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(`${target.name} adlı talebe`);
  await expect(dialog).toContainText(fixture.course.title);
  await expect(dialog).toContainText(
    "Talebe yeniden başvurabilir. Yeniden başvurmasını da engellemek gerekiyorsa “Yasakla”yı kullanın."
  );
  await expect(dialog.getByText("Çıkarma gerekçesi")).toBeVisible();
  // a form: the window opens on its first field
  const reason = dialog.getByRole("textbox");
  await expect(reason).toBeFocused();

  const submit = dialog.getByRole("button", {
    name: "Dersten çıkar",
    exact: true,
  });
  await expect(submit).toBeDisabled();
  await reason.fill("   ");
  await expect(submit).toBeDisabled();
  await reason.fill("Dört celsedir haber vermeden katılmıyor.");
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(dialog).toBeHidden();
  await expect(
    page.getByTestId("roster-enrolled").filter({ visible: true })
  ).not.toContainText(target.name);
  const tabs = page.getByRole("tablist");
  await expect(tabs.getByRole("tab", { name: /^Kayıtlı/ })).toContainText("7");
  await expect(
    tabs.getByRole("tab", { name: /^Erişimi kaldırılanlar/ })
  ).toContainText("1");

  await tabs.getByRole("tab", { name: /^Erişimi kaldırılanlar/ }).click();
  const removed = page.getByTestId("roster-removed").filter({ visible: true });
  await expect(removed).toContainText(target.name);
  await expect(removed).toContainText(
    "Dört celsedir haber vermeden katılmıyor."
  );

  // the seat is kept as the record of the removal, not deleted (MDRS-161)
  expect(await fixture.enrollment(target.id)).toMatchObject({
    status: "REVOKED",
  });
  const audit = await fixture.removals();
  expect(audit).toHaveLength(1);
  expect(audit[0]).toMatchObject({
    userId: target.id,
    reason: "Dört celsedir haber vermeden katılmıyor.",
    actor: KOSK_NAZIM.sub,
  });
});

test("nizam/58 — the scrim does not close 'Dersten çıkar'; 'Vazgeç' does, and nothing is removed", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await openTab(page, /^Kayıtlı/);
  const target = person(2);
  await page
    .getByRole("button", { name: `Dersten çıkar: ${target.name}` })
    .click();
  const dialog = page.getByRole("dialog", { name: "Dersten çıkar" });
  await dialog.getByRole("textbox").fill("Yarım kalacak.");
  await page.mouse.click(5, 5);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Vazgeç" }).click();
  await expect(dialog).toBeHidden();
  expect(await fixture.enrollment(target.id)).toMatchObject({
    status: "ENROLLED",
  });
  expect(await fixture.removals()).toEqual([]);
});

test("nizam/58 — 'Tamamladı say' moves the talebe to Tamamlayanlar (criterion 6)", async ({
  page,
}) => {
  test.skip(!seedable, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await openTab(page, /^Kayıtlı/);
  const target = person(1);

  await page
    .getByRole("button", { name: `Tamamladı say: ${target.name}` })
    .click();
  const tabs = page.getByRole("tablist");
  await expect(tabs.getByRole("tab", { name: /^Kayıtlı/ })).toContainText("7");
  await expect(tabs.getByRole("tab", { name: /^Tamamlayanlar/ })).toContainText(
    "2"
  );
  await tabs.getByRole("tab", { name: /^Tamamlayanlar/ }).click();
  await expect(
    page.getByTestId("roster-completed").filter({ visible: true })
  ).toContainText(target.name);
  expect(await fixture.enrollment(target.id)).toMatchObject({
    status: "COMPLETED",
  });
});
