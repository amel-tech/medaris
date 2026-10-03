import { expect, type Page, test } from "@playwright/test";
import { type DeckReviewFixture, seedDeckReview } from "./deck-review-seed";

/**
 * Designs nizam/16 (deste yayın istekleri), nizam/30 (köşk desteleri) and
 * nizam/35 (köşk destesi aç) against the running app and API, with real
 * Keycloak sign-ins (MDRS-180). A spec whose account is not in the
 * environment (E2E_<ROLE>_EMAIL, _PASSWORD, _SUB) is skipped.
 *
 * The same rules are covered against a real Postgres with a minted token in
 * tedrisat's `deck-review.e2e.spec.ts`; this file proves the screens carry
 * them through. `E2E_API_BASE_URL` (default http://localhost:3001) is where
 * the anonymous read of the public decks goes.
 */
const account = (role: string) => ({
  email: process.env[`E2E_${role}_EMAIL`],
  password: process.env[`E2E_${role}_PASSWORD`],
  sub: process.env[`E2E_${role}_SUB`],
});
const KOSK_NAZIM = account("KOSK_NAZIM");
const MUDERRIS = account("MUDERRIS");
const SYSTEM_ADMIN = account("SYSTEM_ADMIN");
const STUDENT = account("STUDENT");
const API = process.env.E2E_API_BASE_URL ?? "http://localhost:3001";

const seedable = Boolean(KOSK_NAZIM.sub && MUDERRIS.sub);
let fixture: DeckReviewFixture;

test.beforeEach(async () => {
  if (!seedable) return;
  fixture = await seedDeckReview({
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

// By role, which skips the hidden copy React streams in before it swaps the page.
const requestItem = (page: Page, title: string) =>
  page.getByRole("button", { name: title });

test("nizam/16 — the tab counts are the table's, and a request shows its owner and sample cards (criterion 1)", async ({
  page,
}) => {
  test.skip(!seedable || !SYSTEM_ADMIN.password, "no başnazım account");
  await signIn(page, SYSTEM_ADMIN);
  await page.goto("/tr/talepler/deste-yayin-istekleri");

  await expect(
    page.getByRole("heading", { level: 1, name: "Deste yayın istekleri" })
  ).toBeVisible();
  const counts = await fixture.counts();
  await expect(
    page.getByRole("tab", { name: /^Bekleyen/ }).locator(".mds-tab__count")
  ).toHaveText(String(counts.pending));
  await expect(
    page
      .getByRole("tab", { name: /^Karara bağlanan/ })
      .locator(".mds-tab__count")
  ).toHaveText(String(counts.decided));

  await requestItem(page, fixture.request.title).click();
  const detail = page.getByTestId("deck-request-detail");
  await expect(detail).toContainText(fixture.request.title);
  await expect(detail).toContainText(fixture.ownerName);
  await expect(detail).toContainText("5 ezber kartı");
  await expect(detail).toContainText("Karar bekliyor");
  await expect(page.getByTestId("card-sample")).toContainText("ön 1");
  await expect(page.getByTestId("card-sample").locator("article")).toHaveCount(
    3
  );
});

test("nizam/16 — looking at the sample and at every card writes an audit row each time (criterion 4)", async ({
  page,
}) => {
  test.skip(!seedable || !SYSTEM_ADMIN.password, "no başnazım account");
  await signIn(page, SYSTEM_ADMIN);
  await page.goto("/tr/talepler/deste-yayin-istekleri");
  await requestItem(page, fixture.request.title).click();
  await expect(page.getByTestId("card-sample")).toBeVisible();
  const afterSample = await fixture.auditReads();
  expect(afterSample).toBeGreaterThanOrEqual(1);

  await page.getByTestId("all-cards").click();
  await expect(page.getByTestId("card-sample").locator("article")).toHaveCount(
    5
  );
  await expect(page.getByTestId("cards-total")).toContainText(
    "Bütün kartlar: 5 ezber kartı"
  );
  expect(await fixture.auditReads()).toBeGreaterThan(afterSample);
});

test("nizam/16 — Yayımla makes the deck public: the open list carries it and the request leaves (criterion 2)", async ({
  page,
  request,
}) => {
  test.skip(!seedable || !SYSTEM_ADMIN.password, "no başnazım account");
  const before = await (await request.get(`${API}/flashcard/decks`)).json();
  expect(
    (before as { id: string }[]).some((d) => d.id === fixture.request.id)
  ).toBe(false);

  await signIn(page, SYSTEM_ADMIN);
  await page.goto("/tr/talepler/deste-yayin-istekleri");
  await requestItem(page, fixture.request.title).click();
  await page.getByRole("button", { name: "Yayımla" }).click();
  await expect(page.getByText("Deste yayımlandı")).toBeVisible();
  await expect(requestItem(page, fixture.request.title)).toHaveCount(0);

  expect(await fixture.deckRow(fixture.request.id)).toMatchObject({
    is_public: true,
    publish_status: "PUBLISHED",
  });
  const after = await (await request.get(`${API}/flashcard/decks`)).json();
  expect(
    (after as { id: string }[]).some((d) => d.id === fixture.request.id)
  ).toBe(true);
});

test("nizam/16 — Reddet cannot be sent without a reason, then keeps the deck private with it (criterion 3)", async ({
  page,
}) => {
  test.skip(!seedable || !SYSTEM_ADMIN.password, "no başnazım account");
  await signIn(page, SYSTEM_ADMIN);
  await page.goto("/tr/talepler/deste-yayin-istekleri");
  await requestItem(page, fixture.request.title).click();
  await page.getByRole("button", { name: "Reddet" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Ret gerekçesi")).toBeVisible();
  const submit = dialog.getByRole("button", { name: "Reddet" });
  await expect(submit).toBeDisabled();
  await dialog.getByRole("textbox").fill("   ");
  await expect(submit).toBeDisabled();
  await dialog.getByRole("textbox").fill("Kartlarda kaynak gösterilmemiş.");
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page.getByText("İstek reddedildi")).toBeVisible();
  expect(await fixture.deckRow(fixture.request.id)).toMatchObject({
    is_public: false,
    publish_status: "REJECTED",
    reject: "Kartlarda kaynak gösterilmemiş.",
  });

  await page.getByRole("tab", { name: /^Karara bağlanan/ }).click();
  const refused = page
    .getByTestId("deck-request-item")
    .filter({ hasText: fixture.refused.title });
  await expect(refused).toContainText("Reddedildi");
  await refused.click();
  await expect(page.getByTestId("deck-request-detail")).toContainText(
    fixture.refused.reason
  );
});

test("nizam/16 — a köşk nazımı is shown the 'Bu bölüm için izniniz yok' screen", async ({
  page,
}) => {
  test.skip(!seedable || !KOSK_NAZIM.password, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await page.goto("/tr/talepler/deste-yayin-istekleri");
  await expect(
    page.getByRole("heading", { name: "Bu bölüm için izniniz yok" })
  ).toBeVisible();
});

test("nizam/30 — the köşk's decks come with the count of proposals waiting (criteria 1 and 2)", async ({
  page,
}) => {
  test.skip(!seedable || !KOSK_NAZIM.password, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.koskId}/desteler`);

  await expect(
    page.getByRole("heading", { level: 1, name: "Köşk desteleri" })
  ).toBeVisible();
  await expect(page.getByTestId("proposals-count")).toHaveText(
    "2 öneri kararınızı bekliyor"
  );
  await expect(page.getByTestId("proposal")).toHaveCount(2);
  await expect(page.getByTestId("proposal").first()).toContainText("Öneren");
  await expect(page.getByTestId("decks-count")).toHaveText("1 deste");
  await expect(
    page.locator("tbody tr").filter({ hasText: fixture.deck.title })
  ).toContainText("Kartları düzenle");
});

test("nizam/30 and 35 — Kabul et opens the form filled in, Desteyi aç lists the deck and drops the proposal (criteria 3 and 4)", async ({
  page,
}) => {
  test.skip(!seedable || !KOSK_NAZIM.password, "no köşk nazım account");
  const proposal = fixture.proposals[0];
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.koskId}/desteler`);
  await page
    .getByRole("link", { name: `${proposal.title} önerisini kabul et` })
    .click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Köşk destesi aç" })
  ).toBeVisible();
  await expect(page.getByTestId("proposal-banner")).toContainText(
    proposal.title
  );
  await expect(page.getByLabel(/^Deste adı/)).toHaveValue(proposal.title);
  await expect(page.getByLabel("Açıklama")).toHaveValue(
    "Tek bir köşk destesi iki derse yeter."
  );

  await page.getByRole("radio", { name: /Hadis/ }).check();
  await expect(page.getByTestId("card-preview")).toContainText(
    "Ameller niyetlere göredir."
  );
  await page.getByRole("button", { name: "Desteyi aç" }).click();

  await page.waitForURL(`**/kosks/${fixture.koskId}/desteler`);
  await expect(
    page.locator("tbody tr").filter({ hasText: proposal.title })
  ).toHaveCount(1);
  await expect(page.getByTestId("proposals-count")).toHaveText(
    "1 öneri kararınızı bekliyor"
  );
  expect(await fixture.proposalRow(proposal.id)).toMatchObject({
    status: "ACCEPTED",
  });
  const opened = (await fixture.koskDecks()).find(
    (d) => d.title === proposal.title
  );
  expect(opened).toBeTruthy();
});

test("nizam/35 — an empty name is refused before anything is sent; a deck from scratch is listed (criteria 2 and 5)", async ({
  page,
}) => {
  test.skip(!seedable || !KOSK_NAZIM.password, "no köşk nazım account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.koskId}/desteler`);
  await page.getByRole("link", { name: "Köşk destesi aç" }).click();

  await expect(page.getByTestId("proposal-banner")).toHaveCount(0);
  const before = (await fixture.koskDecks()).length;
  await page.getByRole("button", { name: "Desteyi aç" }).click();
  await expect(page.getByText("Bir deste adı yazın.")).toBeVisible();
  expect((await fixture.koskDecks()).length).toBe(before);

  const name = `E2E sıfırdan deste ${Date.now()}`;
  await page.getByLabel(/^Deste adı/).fill(name);
  await page.getByRole("radio", { name: /Hadis/ }).check();
  await page.getByRole("button", { name: "Desteyi aç" }).click();
  await page.waitForURL(`**/kosks/${fixture.koskId}/desteler`);
  await expect(
    page.locator("tbody tr").filter({ hasText: name })
  ).toContainText("Hadis");
});

test("nizam/30 — Reddet needs a reason and closes the proposal; Gizle moves the deck to the archive (criteria 4 and 5)", async ({
  page,
}) => {
  test.skip(!seedable || !KOSK_NAZIM.password, "no köşk nazım account");
  const proposal = fixture.proposals[1];
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.koskId}/desteler`);

  await page
    .getByRole("button", { name: `${proposal.title} önerisini reddet` })
    .click();
  const dialog = page.getByRole("dialog");
  const submit = dialog.getByRole("button", { name: "Reddet" });
  await expect(submit).toBeDisabled();
  await dialog.getByRole("textbox").fill("Bu konu zaten bir destede var.");
  await submit.click();
  await expect(page.getByText("Öneri reddedildi")).toBeVisible();
  await expect(page.getByTestId("proposal")).toHaveCount(1);
  expect(await fixture.proposalRow(proposal.id)).toMatchObject({
    status: "REJECTED",
    reason: "Bu konu zaten bir destede var.",
  });

  await page
    .getByRole("button", { name: `${fixture.deck.title} destesini gizle` })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Gizle" })
    .click();
  await expect(page.getByText("Deste gizlendi")).toBeVisible();
  await expect(
    page.locator("tbody tr").filter({ hasText: fixture.deck.title })
  ).toHaveCount(0);
  expect((await fixture.deckRow(fixture.deck.id))?.archived_at).not.toBeNull();

  await page.goto(`/tr/kosks/${fixture.koskId}/arsiv`);
  await expect(
    page.locator("[data-testid=archive] tbody tr").filter({
      hasText: fixture.deck.title,
    })
  ).toHaveCount(1);
});

test("nizam/30 and 35 — a person who is no nazım gets the 'Bu bölüm için izniniz yok' screen (criteria 6)", async ({
  page,
}) => {
  test.skip(!seedable || !STUDENT.password, "no outsider account");
  await signIn(page, STUDENT);
  await page.goto(`/tr/kosks/${fixture.koskId}/desteler`);
  await expect(
    page.getByRole("heading", { name: "Bu bölüm için izniniz yok" })
  ).toBeVisible();
  await page.goto(`/tr/kosks/${fixture.koskId}/desteler/yeni`);
  await expect(
    page.getByRole("heading", { name: "Bu bölüm için izniniz yok" })
  ).toBeVisible();
});
