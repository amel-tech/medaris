import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { type DeckFixture, seedDecks } from "./deck-seed";
import { pgClient } from "./pg-client";
import { signInAsTalebe } from "./sign-in";

/**
 * Designs tedris/25 (Desteler), 26 (Desteleri keşfet), 27 (Deste oluştur), 28
 * (Deste ayrıntısı), 29 (Deste kartları), 31 (okuyan kişinin görünümü) and 33
 * (Desteyi düzenle), against the running app and API with a real Keycloak
 * sign-in as `e2e-talebe` (E2E_TALEBE_EMAIL, _PASSWORD, _SUB). Skipped when the
 * account is missing.
 */
const talebe = {
  email: process.env.E2E_TALEBE_EMAIL,
  password: process.env.E2E_TALEBE_PASSWORD,
  sub: process.env.E2E_TALEBE_SUB,
};
const ready = Boolean(talebe.email && talebe.password && talebe.sub);

let fx: DeckFixture;

test.beforeAll(async () => {
  if (ready) fx = await seedDecks(talebe.sub as string);
});
test.afterAll(async () => {
  await fx?.remove();
});
test.beforeEach(async ({ page }) => {
  test.skip(!ready, "no Keycloak talebe in the environment");
  await signIn(page);
});

const signIn = signInAsTalebe;

/** Text that is on screen: a streamed page keeps a hidden copy of itself in the DOM until it swaps. */
const shown = (page: Page, text: string) =>
  page.getByText(text).filter({ visible: true });

/** A deck's card in a list, found by its name. */
const deckCard = (page: Page, title: string) =>
  page
    .locator(".mds-card", {
      has: page.getByRole("link", { name: title, exact: true }),
    })
    .filter({ visible: true });

/** Rows of the database, for what only the database can say. */
const query = async <T extends Record<string, unknown>>(
  sql: string,
  params: unknown[]
): Promise<T[]> => {
  const db = await pgClient();
  try {
    return (await db.query(sql, params)).rows as T[];
  } finally {
    await db.end();
  }
};

test.describe("Desteler (tedris/25)", () => {
  test("lists the caller's own decks and the ones they collected, with progress and status", async ({
    page,
  }) => {
    const response = await page.goto("/tr/decks");
    expect(response?.status()).toBe(200);
    const main = page.getByRole("main");
    await expect(
      main.getByRole("heading", { level: 1, name: "Desteler" })
    ).toBeVisible();
    await expect(
      main.getByRole("heading", { level: 2, name: "Destelerim" })
    ).toBeVisible();
    await expect(
      main.getByRole("heading", { level: 2, name: "Koleksiyonum" })
    ).toBeVisible();
    await expect(
      main.getByRole("link", { name: "Desteleri keşfet" })
    ).toBeVisible();
    await expect(
      main.getByRole("link", { name: "Deste oluştur" })
    ).toBeVisible();

    const pending = deckCard(page, fx.titles.pending);
    await expect(pending.getByText("Yayın isteği bekliyor")).toBeVisible();
    await expect(pending.getByText("Tamamlanan: 6 / 18 kart")).toBeVisible();
    await expect(pending.getByText("%33")).toBeVisible();
    await expect(pending.getByText("7 kart tekrar bekliyor")).toBeVisible();
    await expect(pending).toContainText("18 kart·Kelime·29 Eylül’de istendi");
    await expect(
      pending.getByRole("link", { name: `Çalış: ${fx.titles.pending}` })
    ).toBeVisible();

    await expect(
      deckCard(page, fx.titles.private).getByText("Özel")
    ).toBeVisible();
    await expect(
      deckCard(page, fx.titles.published).getByText("Yayında")
    ).toBeVisible();

    // The collected deck: somebody else's, no edit action, two of its eight
    // cards were written after it was collected.
    const collected = deckCard(page, fx.titles.collected);
    await expect(collected.getByText("Herkese açık")).toBeVisible();
    await expect(collected.getByText("Tamamlanan: 2 / 8 kart")).toBeVisible();
    await expect(collected.getByText("2 yeni kart")).toBeVisible();
    await expect(
      collected.getByRole("button", { name: /Düzenle/ })
    ).toHaveCount(0);
    // Not collected, not theirs: neither list has it.
    await expect(page.getByText(fx.titles.otherPublic)).toHaveCount(0);
    await expect(page.getByText(fx.titles.strangerPrivate)).toHaveCount(0);
  });

  test("the status chips narrow the caller's own decks and the counts say how many", async ({
    page,
  }) => {
    await page.goto("/tr/decks");
    const chip = (name: string) =>
      page.getByRole("button", { name, exact: true });
    await chip("Yayın isteği bekliyor").click();
    await expect(chip("Yayın isteği bekliyor")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(deckCard(page, fx.titles.pending)).toBeVisible();
    await expect(deckCard(page, fx.titles.private)).toHaveCount(0);
    await expect(deckCard(page, fx.titles.published)).toHaveCount(0);
    // The collection is not filtered by status.
    await expect(deckCard(page, fx.titles.collected)).toBeVisible();

    await chip("Özel").click();
    await expect(deckCard(page, fx.titles.private)).toBeVisible();
    await expect(deckCard(page, fx.titles.pending)).toHaveCount(0);
    await chip("Yayında").click();
    await expect(deckCard(page, fx.titles.published)).toBeVisible();
    await chip("Tümü").click();
    await expect(deckCard(page, fx.titles.pending)).toBeVisible();
    const mine = page.getByRole("region", { name: "Destelerim" });
    const items = mine.locator("ul > li");
    await expect(mine.getByText(`${await items.count()} deste`)).toBeVisible();
  });

  test("the search box narrows both lists", async ({ page }) => {
    await page.goto("/tr/decks");
    await page
      .getByRole("searchbox", { name: "Destelerinde ara" })
      .fill(fx.tag);
    await expect(deckCard(page, fx.titles.pending)).toBeVisible();
    await page
      .getByRole("searchbox", { name: "Destelerinde ara" })
      .fill(`Mehmûz ${fx.tag}`);
    await expect(deckCard(page, fx.titles.pending)).toBeVisible();
    await expect(deckCard(page, fx.titles.private)).toHaveCount(0);
    await expect(deckCard(page, fx.titles.collected)).toHaveCount(0);
    await page
      .getByRole("searchbox", { name: "Destelerinde ara" })
      .fill("böyle bir deste yok");
    await expect(page.getByText("Aramana uyan deste yok.")).toHaveCount(2);
  });

  test("'Çalış' opens the study page of that deck", async ({ page }) => {
    await page.goto("/tr/decks");
    await page
      .getByRole("link", { name: `Çalış: ${fx.titles.private}` })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/tr/decks/study/${fx.ids.private}$`)
    );
  });

  test("a signed-out visitor is sent to sign in", async ({ browser }) => {
    const context = await browser.newContext();
    const anonymous = await context.newPage();
    await anonymous.goto("/tr/decks");
    await expect(anonymous).toHaveURL(/signin|api\/auth/);
    await context.close();
  });
});

test.describe("Desteleri keşfet (tedris/26)", () => {
  test("shows the decks of the caller's courses and the published ones, with counts", async ({
    page,
  }) => {
    await page.goto("/tr/decks/explore");
    const main = page.getByRole("main");
    await expect(
      main.getByRole("heading", { level: 1, name: "Desteleri keşfet" })
    ).toBeVisible();
    await expect(
      main.getByRole("navigation", { name: "Sayfa yolu" })
    ).toBeVisible();

    const course = deckCard(page, fx.titles.courseDeck);
    await expect(course.getByText("Ders destesi")).toBeVisible();
    await expect(
      course.getByText(`${fx.courseTitle}·Müderris ${fx.muderrisName}`)
    ).toBeVisible();
    await expect(
      course.getByRole("button", {
        name: `Koleksiyona ekle: ${fx.titles.courseDeck}`,
      })
    ).toBeVisible();

    await expect(
      deckCard(page, fx.titles.collected).getByText("Koleksiyonunda")
    ).toBeVisible();
    await expect(
      deckCard(page, fx.titles.otherPublic).getByRole("button", {
        name: `Koleksiyona ekle: ${fx.titles.otherPublic}`,
      })
    ).toBeVisible();
    const own = deckCard(page, fx.titles.published);
    await expect(own.getByText("Senin desten")).toBeVisible();
    await expect(own.getByRole("button", { name: /Koleksiyon/ })).toHaveCount(
      0
    );

    // Another user's private deck is never listed.
    await expect(page.getByText(fx.titles.strangerPrivate)).toHaveCount(0);
    await expect(page.getByText(fx.titles.private)).toHaveCount(0);

    // A section's count is the number of decks it lists.
    for (const [name, list] of [
      ["Derslerinin desteleri", "Derslerinin desteleri"],
      ["Herkese açık desteler", "Herkese açık desteler"],
    ]) {
      const section = main.locator("section", {
        has: page.getByRole("heading", { level: 2, name }),
      });
      const count = await section.locator("ul > li").count();
      await expect(section.getByText(`${count} deste`), list).toBeVisible();
    }
  });

  test("the card-type chips narrow both sections, and the address carries the choice", async ({
    page,
  }) => {
    await page.goto("/tr/decks/explore");
    await page.getByRole("button", { name: "Hadis", exact: true }).click();
    await expect(page).toHaveURL(/\/tr\/decks\/explore\?type=HADEETH$/);
    await expect(deckCard(page, fx.titles.collected)).toBeVisible();
    await expect(deckCard(page, fx.titles.otherPublic)).toHaveCount(0);
    await expect(deckCard(page, fx.titles.courseDeck)).toHaveCount(0);

    await page.getByRole("button", { name: "Kelime", exact: true }).click();
    await expect(page).toHaveURL(/\/tr\/decks\/explore\?type=VOCABULARY$/);
    await expect(deckCard(page, fx.titles.otherPublic)).toBeVisible();
    await expect(deckCard(page, fx.titles.courseDeck)).toBeVisible();
    await expect(deckCard(page, fx.titles.collected)).toHaveCount(0);

    // A bad value is no filter.
    await page.goto("/tr/decks/explore?type=QUIZ");
    await expect(deckCard(page, fx.titles.collected)).toBeVisible();
    await expect(deckCard(page, fx.titles.otherPublic)).toBeVisible();
  });

  test("'Koleksiyona ekle' survives a reload and shows under Koleksiyonum; 'Çıkar' takes it out again", async ({
    page,
  }) => {
    const title = fx.titles.otherPublic;
    await page.goto("/tr/decks/explore");
    await page
      .getByRole("button", { name: `Koleksiyona ekle: ${title}` })
      .click();
    await expect(
      deckCard(page, title).getByText("Koleksiyonunda")
    ).toBeVisible();

    await page.reload();
    await expect(
      deckCard(page, title).getByText("Koleksiyonunda")
    ).toBeVisible();
    await page.goto("/tr/decks");
    const collection = page.getByRole("region", { name: "Koleksiyonum" });
    await expect(
      collection.getByRole("link", { name: title, exact: true })
    ).toBeVisible();

    await page.goto("/tr/decks/explore");
    await page
      .getByRole("button", { name: `Koleksiyondan çıkar: ${title}` })
      .click();
    await expect(
      page.getByRole("button", { name: `Koleksiyona ekle: ${title}` })
    ).toBeVisible();
    await page.goto("/tr/decks");
    await expect(
      page
        .getByRole("region", { name: "Koleksiyonum" })
        .getByRole("link", { name: title, exact: true })
    ).toHaveCount(0);
  });
});

test.describe("Deste oluştur (tedris/27)", () => {
  test("an empty form says what is missing and sends nothing", async ({
    page,
  }) => {
    await page.goto("/tr/decks/create");
    await expect(
      page.getByRole("heading", { level: 1, name: "Deste oluştur" })
    ).toBeVisible();
    await expect(page.getByText("* zorunlu alan")).toBeVisible();
    await expect(page.getByText("Deste özel başlar")).toBeVisible();
    // The design draws no visibility choice.
    await expect(page.getByText("Herkese açık", { exact: true })).toHaveCount(
      0
    );

    await page.getByRole("button", { name: "Oluştur" }).click();
    await expect(page.getByText("Bir deste adı yaz.")).toBeVisible();
    await expect(page.getByText("Bir kart türü seç.")).toBeVisible();
    await expect(page).toHaveURL(/\/tr\/decks\/create$/);

    await page.getByRole("textbox", { name: /Deste adı/ }).fill("abc");
    await page.getByRole("button", { name: "Oluştur" }).click();
    await expect(
      page.getByText("Deste adı en az 5 karakter olmalı.")
    ).toBeVisible();
  });

  test("the card type changes the preview", async ({ page }) => {
    await page.goto("/tr/decks/create");
    await expect(page.getByText("Kelime kartı böyle görünür")).toBeVisible();
    await page.getByRole("radio", { name: /Hadis/ }).click();
    await expect(page.getByText("Hadis kartı böyle görünür")).toBeVisible();
    await expect(
      page.getByText("Ameller ancak niyetlere göredir. Buhârî, Müslim")
    ).toBeVisible();
    await page.getByRole("radio", { name: /Kelime/ }).click();
    await expect(page.getByText("Kelime kartı böyle görünür")).toBeVisible();
  });

  test("creates a private deck with a type and trimmed tags, and opens its page", async ({
    page,
  }) => {
    const title = `Yeni deste ${fx.tag}`;
    await page.goto("/tr/decks/create");
    await page.getByRole("textbox", { name: /Deste adı/ }).fill(title);
    await page
      .getByRole("textbox", { name: "Açıklama" })
      .fill("Sarf çalışması için bir deste.");
    await page.getByRole("radio", { name: /Kelime/ }).click();
    await page
      .getByRole("textbox", { name: "Etiketler" })
      .fill(" sarf , nahiv,, Sarf ");
    await page.getByRole("button", { name: "Oluştur" }).click();

    await page.waitForURL(/\/tr\/decks\/[0-9a-f-]{36}$/);
    await expect(
      page.getByRole("heading", { level: 1, name: title })
    ).toBeVisible();
    await expect(page.getByText("Özel").first()).toBeVisible();
    const [row] = await query<{
      is_public: boolean;
      card_type: string;
      tags: string[];
      publish_status: string;
    }>(
      "select is_public, card_type, tags, publish_status from decks where author_id = $1 and title = $2",
      [talebe.sub, title]
    );
    expect(row).toMatchObject({
      is_public: false,
      card_type: "VOCABULARY",
      tags: ["sarf", "nahiv"],
      publish_status: "PRIVATE",
    });

    await page.goto("/tr/decks");
    await expect(
      deckCard(page, title).getByText("Özel", { exact: true })
    ).toBeVisible();
  });

  test("'Vazgeç' goes back to Desteler and creates nothing", async ({
    page,
  }) => {
    const title = `Vazgeçilen ${fx.tag}`;
    await page.goto("/tr/decks/create");
    await page.getByRole("textbox", { name: /Deste adı/ }).fill(title);
    await page.getByRole("link", { name: "Vazgeç" }).click();
    await expect(page).toHaveURL(/\/tr\/decks$/);
    expect(
      await query("select 1 from decks where title = $1", [title])
    ).toHaveLength(0);
  });
});

test.describe("Deste ayrıntısı, sahibi (tedris/28)", () => {
  test("shows the author's progress, sample cards and the publication state", async ({
    page,
  }) => {
    await page.goto(`/tr/decks/${fx.ids.pending}`);
    const main = page.getByRole("main");
    await expect(
      main.getByRole("heading", { level: 1, name: fx.titles.pending })
    ).toBeVisible();
    await expect(main.getByText("Yayın isteği bekliyor").first()).toBeVisible();
    await expect(
      main.getByText("18 ezber kartı·Kelime·Senin desten")
    ).toBeVisible();
    await expect(main.getByRole("link", { name: "Kartlar 18" })).toBeVisible();
    await expect(main.getByText("Tamamlanan: 6 / 18 kart")).toBeVisible();
    await expect(main.getByText("%33")).toBeVisible();
    // New + learning + mastered is the number of cards.
    await expect(main.getByText("5 kart", { exact: true })).toBeVisible();
    await expect(main.getByText("7 kart", { exact: true })).toBeVisible();
    await expect(main.getByText("6 kart", { exact: true })).toBeVisible();
    await expect(main.getByText("Bugün 7 kart tekrar bekliyor.")).toBeVisible();
    await expect(main.getByText(/^Kart \d$/)).toHaveCount(6);
    await expect(
      main.getByText(
        "Yayın isteğini 29 Eylül 2026 Salı 21:10 tarihinde gönderdin."
      )
    ).toBeVisible();
    await expect(main.getByRole("link", { name: "Çalış" })).toHaveAttribute(
      "href",
      new RegExp(`/decks/study/${fx.ids.pending}$`)
    );
    await expect(main.getByRole("link", { name: "Düzenle" })).toBeVisible();
    await expect(
      main.getByRole("button", { name: "Desteyi sil" })
    ).toBeVisible();
  });

  test("'Edit' opens the dialog filled in; an empty name is refused; a new name is saved and the request stays", async ({
    page,
  }) => {
    await page.goto(`/tr/decks/${fx.ids.pending}`);
    await page.getByRole("link", { name: "Düzenle" }).click();
    await expect(page).toHaveURL(new RegExp(`/decks/${fx.ids.pending}/edit$`));
    const dialog = page.getByRole("dialog", {
      name: "Desteyi düzenle",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("textbox", { name: /Deste adı/ })
    ).toHaveValue(fx.titles.pending);
    await expect(dialog.getByRole("textbox", { name: "Açıklama" })).toHaveValue(
      "Hemzeli fiillerin çekimleri ve emir sîgaları."
    );
    await expect(dialog.getByText("Yayın isteğin bekliyor")).toBeVisible();
    await expect(
      dialog.getByText(
        "Değişiklik isteği bozmaz; Medaris yönetimi isteği son hâliyle inceler."
      )
    ).toBeVisible();

    await dialog.getByRole("textbox", { name: /Deste adı/ }).fill("");
    await dialog.getByRole("button", { name: "Kaydet" }).click();
    await expect(dialog.getByText("Bir deste adı yaz.")).toBeVisible();

    // Vazgeç closes without a change.
    await dialog.getByRole("button", { name: "Vazgeç" }).click();
    await expect(page).toHaveURL(new RegExp(`/decks/${fx.ids.pending}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: fx.titles.pending })
    ).toBeVisible();

    await page.getByRole("link", { name: "Düzenle" }).click();
    const renamed = `${fx.titles.pending} (düzeltildi)`;
    await page
      .getByRole("dialog")
      .getByRole("textbox", { name: /Deste adı/ })
      .fill(renamed);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Kaydet" })
      .click();
    await expect(page).toHaveURL(new RegExp(`/decks/${fx.ids.pending}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: renamed })
    ).toBeVisible();
    await expect(page.getByText("Yayın isteği bekliyor").first()).toBeVisible();
    const [row] = await query<{ title: string; publish_status: string }>(
      "select title, publish_status from decks where id = $1",
      [fx.ids.pending]
    );
    expect(row).toMatchObject({ title: renamed, publish_status: "PENDING" });
    await page.goto("/tr/decks");
    await expect(deckCard(page, renamed)).toBeVisible();
    await query("update decks set title = $2 where id = $1", [
      fx.ids.pending,
      fx.titles.pending,
    ]);
  });

  test("'İsteği geri çek' makes the deck private, and 'Yayın iste' asks again", async ({
    page,
  }) => {
    const id = randomUUID();
    await query(
      "insert into decks(id, author_id, title, publish_status, publish_requested_at) values ($1, $2, $3, 'PENDING', now())",
      [id, talebe.sub, `Geri çekilen ${fx.tag}`]
    );
    await page.goto(`/tr/decks/${id}`);
    await page.getByRole("button", { name: "İsteği geri çek" }).click();
    await expect(
      page.getByText("Bu deste özel; yalnız sen görürsün.", { exact: false })
    ).toBeVisible();
    await expect(page.getByText("Özel").first()).toBeVisible();
    expect(
      (await query("select publish_status from decks where id = $1", [id]))[0]
    ).toMatchObject({ publish_status: "PRIVATE" });

    await page.getByRole("button", { name: "Yayın iste" }).click();
    await expect(
      page.getByRole("button", { name: "İsteği geri çek" })
    ).toBeVisible();
    expect(
      (await query("select publish_status from decks where id = $1", [id]))[0]
    ).toMatchObject({ publish_status: "PENDING" });
  });

  test("'Desteyi sil' deletes only after the confirmation, with its cards", async ({
    page,
  }) => {
    const id = randomUUID();
    await query("insert into decks(id, author_id, title) values ($1, $2, $3)", [
      id,
      talebe.sub,
      `Silinecek ${fx.tag}`,
    ]);
    await query(
      "insert into flashcards(deck_id, author_id, type, content_front, content_back) values ($1, $2, 'VOCABULARY', 'ön yüz', 'arka yüz')",
      [id, talebe.sub]
    );
    await page.goto(`/tr/decks/${id}`);
    await page.getByRole("button", { name: "Desteyi sil" }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toBeVisible();
    await expect(confirm.getByRole("button", { name: "Vazgeç" })).toBeFocused();
    await confirm.getByRole("button", { name: "Vazgeç" }).click();
    await expect(confirm).toHaveCount(0);
    expect(await query("select 1 from decks where id = $1", [id])).toHaveLength(
      1
    );

    await page.getByRole("button", { name: "Desteyi sil" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Desteyi sil" })
      .click();
    await expect(page).toHaveURL(/\/tr\/decks$/);
    expect(await query("select 1 from decks where id = $1", [id])).toHaveLength(
      0
    );
    expect(
      await query("select 1 from flashcards where deck_id = $1", [id])
    ).toHaveLength(0);
  });

  test("an id that is not there is the not-found page", async ({ page }) => {
    const response = await page.goto(`/tr/decks/${randomUUID()}`);
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: "Sayfa bulunamadı" })
    ).toBeVisible();
    const hidden = await page.goto(`/tr/decks/${fx.ids.strangerPrivate}`);
    expect(hidden?.status()).toBe(404);
  });
});

test.describe("Deste kartları (tedris/29)", () => {
  test("lists every card with its own status, and adds, edits and deletes one", async ({
    page,
  }) => {
    const id = randomUUID();
    await query(
      "insert into decks(id, author_id, title, card_type) values ($1, $2, $3, 'VOCABULARY')",
      [id, talebe.sub, `Kart deneyi ${fx.tag}`]
    );
    await page.goto(`/tr/decks/${id}/cards`);
    await expect(page.getByText("Bu destede henüz kart yok.")).toBeVisible();

    // Add: an empty form says so; a filled one adds a row and the tab's count.
    await page.getByRole("button", { name: "Kart ekle" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Kart ekle", exact: true });
    await dialog.getByRole("button", { name: "Kaydet" }).click();
    await expect(dialog.getByText("Bu alan boş olamaz.")).toHaveCount(2);
    await dialog.getByRole("textbox", { name: /Ön yüz/ }).fill("قَرَأَ يَقْرَأُ");
    await dialog
      .getByRole("textbox", { name: /Arka yüz/ })
      .fill("Okudu, okur.");
    await dialog.getByRole("button", { name: "Kaydet" }).click();
    await expect(dialog).toHaveCount(0);
    const table = page.getByRole("table");
    await expect(table.getByRole("row")).toHaveCount(2);
    await expect(table.getByText("Okudu, okur.")).toBeVisible();
    await expect(table.getByText("Yeni", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Kartlar 1" })).toBeVisible();
    const [added] = await query<{ type: string }>(
      "select type from flashcards where deck_id = $1",
      [id]
    );
    expect(added.type).toBe("VOCABULARY");

    // Edit.
    await page.getByRole("button", { name: "Düzenle: kart 1" }).click();
    const edit = page.getByRole("dialog", {
      name: "Kartı düzenle",
      exact: true,
    });
    await expect(edit.getByRole("textbox", { name: /Arka yüz/ })).toHaveValue(
      "Okudu, okur."
    );
    await edit
      .getByRole("textbox", { name: /Arka yüz/ })
      .fill("Okudu, okuyor.");
    await edit.getByRole("button", { name: "Kaydet" }).click();
    await expect(table.getByText("Okudu, okuyor.")).toBeVisible();

    // Delete: not without the answer.
    await page.getByRole("button", { name: "Sil: kart 1" }).click();
    const confirm = page.getByRole("alertdialog");
    await confirm.getByRole("button", { name: "Vazgeç" }).click();
    await expect(table.getByText("Okudu, okuyor.")).toBeVisible();
    await page.getByRole("button", { name: "Sil: kart 1" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Kartı sil" })
      .click();
    await expect(table).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Kartlar 0" })).toBeVisible();
  });

  test("the table shows the caller's own status for each card, in the Arabic face", async ({
    page,
  }) => {
    await page.goto(`/tr/decks/${fx.ids.pending}/cards`);
    const rows = page.getByRole("table").getByRole("row");
    await expect(rows).toHaveCount(19);
    await expect(rows.nth(1).getByText("Tamamlandı")).toBeVisible();
    await expect(rows.nth(8).getByText("Öğreniliyor")).toBeVisible();
    await expect(rows.nth(18).getByText("Yeni", { exact: true })).toBeVisible();
    await expect(rows.nth(1).locator('[lang="ar"]')).toHaveAttribute(
      "dir",
      "rtl"
    );
    await expect(
      page.getByText(
        "Durum sütunu senin çalışma ilerlemeni gösterir. Kartları yalnız sen ekler, düzenler ve silersin."
      )
    ).toBeVisible();
  });

  test("'Dışa aktar' downloads the deck and 'İçe aktar' adds the rows of a file", async ({
    page,
  }) => {
    const id = randomUUID();
    await query("insert into decks(id, author_id, title) values ($1, $2, $3)", [
      id,
      talebe.sub,
      `Aktarma ${fx.tag}`,
    ]);
    await page.goto(`/tr/decks/${id}/cards`);

    const downloading = page.waitForEvent("download");
    await page.getByRole("link", { name: "Dışa aktar" }).click();
    expect((await downloading).suggestedFilename()).toMatch(/\.xlsx$/);

    await page.getByRole("button", { name: "İçe aktar" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Kartları içe aktar",
      exact: true,
    });
    await dialog.getByRole("button", { name: "İçe aktar" }).click();
    await expect(dialog.getByText("Bir dosya seç.")).toBeVisible();

    await dialog.locator('input[type="file"]').setInputFiles({
      name: "bozuk.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "Card Type,Content Front,Content Back\nVOCABULARY,x,y\n"
      ),
    });
    await dialog.getByRole("button", { name: "İçe aktar" }).click();
    await expect(dialog.getByText(/satırda sorun var/)).toBeVisible();
    await expect(dialog.getByText(/^Satır \d+/)).toBeVisible();
    expect(
      await query("select 1 from flashcards where deck_id = $1", [id])
    ).toHaveLength(0);

    await dialog.locator('input[type="file"]').setInputFiles({
      name: "kartlar.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "Card Type,Content Front,Content Back\nVOCABULARY,قَرَأَ,Okudu\nVOCABULARY,كَتَبَ,Yazdı\n"
      ),
    });
    await dialog.getByRole("button", { name: "İçe aktar" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("table").getByRole("row")).toHaveCount(3);
    await expect(page.getByRole("link", { name: "Kartlar 2" })).toBeVisible();
  });

  test("somebody else's deck has no card list for them: the forbidden page", async ({
    page,
  }) => {
    await page.goto(`/tr/decks/${fx.ids.collected}/cards`);
    await expect(
      page.getByRole("heading", { name: "Bu sayfayı göremezsin" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Kart ekle" })).toHaveCount(
      0
    );
  });
});

test.describe("Deste, okuyan kişinin görünümü (tedris/31)", () => {
  test("shows a deck of somebody else's with no way to change it", async ({
    page,
  }) => {
    await page.goto(`/tr/decks/${fx.ids.collected}`);
    const main = page.getByRole("main");
    await expect(
      main.getByRole("heading", { level: 1, name: fx.titles.collected })
    ).toBeVisible();
    await expect(main.getByText("Herkese açık").first()).toBeVisible();
    await expect(main.getByText("Koleksiyonunda").first()).toBeVisible();
    await expect(main.getByText("8 ezber kartı·Hadis")).toBeVisible();
    for (const name of [
      /Düzenle/,
      /Desteyi sil/,
      /Kart ekle/,
      /İsteği geri çek/,
    ]) {
      await expect(main.getByRole("button", { name })).toHaveCount(0);
      await expect(main.getByRole("link", { name })).toHaveCount(0);
    }
    await expect(main.getByText("Tamamlanan: 2 / 8 kart")).toBeVisible();
    await expect(main.getByText("%25")).toBeVisible();
    await expect(
      main.getByText(
        "Bu deste herkese açık: Medaris yönetimi inceleyip yayımladı."
      )
    ).toBeVisible();
  });

  test("shows six cards at a time, with their source", async ({ page }) => {
    await page.goto(`/tr/decks/${fx.ids.collected}`);
    const rows = page.getByRole("table").getByRole("row");
    await expect(rows).toHaveCount(7);
    await expect(rows.nth(1).getByText("Buhârî, Müslim")).toBeVisible();
    await expect(
      page.getByText("8 kartın 6 tanesi gösteriliyor")
    ).toBeVisible();
    await page.getByRole("button", { name: "Daha fazla göster" }).click();
    await expect(rows).toHaveCount(9);
    await expect(
      page.getByText("8 kartın 8 tanesi gösteriliyor")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Daha fazla göster" })
    ).toHaveCount(0);
  });

  test("'Kendi desteme kopyala' puts the card into the chosen own deck and leaves the source alone", async ({
    page,
  }) => {
    await page.goto(`/tr/decks/${fx.ids.collected}`);
    await page
      .getByRole("button", { name: "Kendi desteme kopyala: kart 1" })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Kendi desteme kopyala",
      exact: true,
    });
    await dialog.getByRole("button", { name: "Kopyala" }).click();
    await expect(dialog.getByText("Bir hedef deste seç.")).toBeVisible();

    // Only own decks of the same kind are offered: the hadith one, not the vocabulary ones.
    await expect(
      dialog.getByRole("radio", { name: fx.titles.hadithOwn })
    ).toBeVisible();
    await expect(
      dialog.getByRole("radio", { name: fx.titles.pending })
    ).toHaveCount(0);
    await dialog.getByRole("radio", { name: fx.titles.hadithOwn }).click();
    await dialog.getByRole("button", { name: "Kopyala" }).click();
    await expect(page.getByText("Kart destene kopyalandı")).toBeVisible();

    const copied = await query<{
      content_front: string;
      content_meta: unknown;
    }>(
      "select content_front, content_meta from flashcards where deck_id = $1",
      [fx.ids.hadithOwn]
    );
    expect(copied).toHaveLength(1);
    expect(copied[0].content_front).toContain("إِنَّمَا");
    expect(copied[0].content_meta).toMatchObject({ source: "Buhârî, Müslim" });
    expect(
      await query("select 1 from flashcards where deck_id = $1", [
        fx.ids.collected,
      ])
    ).toHaveLength(8);
  });

  test("'Koleksiyondan çıkar' takes the badge away and 'Koleksiyona ekle' brings it back", async ({
    page,
  }) => {
    await page.goto(`/tr/decks/${fx.ids.collected}`);
    await page.getByRole("button", { name: "Koleksiyondan çıkar" }).click();
    await expect(
      page.getByRole("button", { name: "Koleksiyona ekle" })
    ).toBeVisible();
    await expect(shown(page, "Koleksiyonunda")).toHaveCount(0);
    await expect
      .poll(
        async () =>
          (
            await query(
              "select 1 from decks_users where deck_id = $1 and user_id = $2",
              [fx.ids.collected, talebe.sub]
            )
          ).length
      )
      .toBe(0);
    await page.getByRole("button", { name: "Koleksiyona ekle" }).click();
    await expect(page.getByText("Koleksiyonunda").first()).toBeVisible();
  });

  test("a deck of a course the caller is enrolled in opens, and cannot be changed", async ({
    page,
  }) => {
    const response = await page.goto(`/tr/decks/${fx.ids.courseDeck}`);
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { level: 1, name: fx.titles.courseDeck })
    ).toBeVisible();
    await expect(
      shown(
        page,
        "Bu deste, kayıtlı olduğun bir dersin, köşkün ya da medresenin destesi"
      )
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Kart ekle|Düzenle/ })
    ).toHaveCount(0);
  });
});
