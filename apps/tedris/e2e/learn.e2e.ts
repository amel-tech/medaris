import { expect, test } from "@playwright/test";
import { pgClient } from "./pg-client";
import { signInAsTalebe } from "./sign-in";
import { type StudyFixture, seedStudy } from "./study-seed";

/**
 * Designs tedris/01 (Ana sayfa, talebe), 30 (Çalışma, ezber kartı) and 32
 * (deste, girişsiz ziyaretçi), against the running app and API (MDRS-165). The
 * signed-in specs use `e2e-talebe` (E2E_TALEBE_EMAIL, _PASSWORD, _SUB) and are
 * skipped without it; the visitor's need no account.
 */
const talebe = {
  email: process.env.E2E_TALEBE_EMAIL,
  password: process.env.E2E_TALEBE_PASSWORD,
  sub: process.env.E2E_TALEBE_SUB,
};
const ready = Boolean(talebe.email && talebe.password && talebe.sub);

let fx: StudyFixture;

test.beforeAll(async () => {
  fx = await seedStudy(talebe.sub ?? "00000000-0000-4000-8000-000000000001");
});
test.afterAll(async () => {
  await fx?.remove();
});

/** The caller's progress row for a card, straight from the database. */
const progressOf = async (cardId: string) => {
  const db = await pgClient();
  try {
    const { rows } = await db.query(
      "select status, interval_days, due_at, reviewed_at from flashcard_progress where user_id = $1 and flashcard_id = $2",
      [talebe.sub, cardId]
    );
    return rows[0] as
      | {
          status: string;
          interval_days: number;
          due_at: Date | null;
          reviewed_at: Date | null;
        }
      | undefined;
  } finally {
    await db.end();
  }
};

test.describe("Ana sayfa (tedris/01)", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!ready, "no Keycloak talebe in the environment");
    await signInAsTalebe(page);
  });

  test("shows the three sections under the sessions, with their links", async ({
    page,
  }) => {
    await page.goto("/tr/home");
    const main = page.getByRole("main");
    for (const [heading, link, href] of [
      ["Kaldığın yerden devam et", "Derslerim", "/my-courses"],
      ["Bugün çalışılacak desteler", "Desteler", "/decks"],
      ["Takip ettiğin köşklerden", "Keşfet", "/discover"],
    ] as const) {
      await expect(
        main.getByRole("heading", { level: 2, name: heading })
      ).toBeVisible();
      await expect(
        main
          .locator("section", {
            has: page.getByRole("heading", { name: heading }),
          })
          .getByRole("link", { name: link, exact: true })
      ).toHaveAttribute("href", new RegExp(`${href}$`));
    }
  });

  test("'Kaldığın yerden devam et' lists the course in progress with its progress and next session", async ({
    page,
  }) => {
    await page.goto("/tr/home");
    const card = page
      .locator(".mds-card", {
        has: page.getByRole("link", { name: fx.titles.enrolledCourse }),
      })
      .filter({ visible: true });
    await expect(card.getByText("İlerlemen")).toBeVisible();
    await expect(card.getByText("%40")).toBeVisible();
    await expect(card.getByText("Sonraki celse")).toBeVisible();
  });

  test("'Bugün çalışılacak desteler' lists the decks with cards waiting, then the one that grew", async ({
    page,
  }) => {
    await page.goto("/tr/home");
    const section = page.locator("section", {
      has: page.getByRole("heading", { name: "Bugün çalışılacak desteler" }),
    });
    const own = section.getByRole("listitem").filter({
      has: page.getByRole("link", { name: fx.titles.own }),
    });
    await expect(own).toContainText("Senin desten");
    await expect(own).toContainText("2 kart tekrar bekliyor");
    const grown = section.getByRole("listitem").filter({
      has: page.getByRole("link", { name: fx.titles.courseDeck }),
    });
    await expect(grown).toContainText("Ders destesi");
    await expect(grown).toContainText("2 yeni kart");
  });

  test("'Çalış' opens that deck's study page", async ({ page }) => {
    await page.goto("/tr/home");
    await page.getByRole("link", { name: `Çalış: ${fx.titles.own}` }).click();
    await expect(page).toHaveURL(new RegExp(`/tr/decks/study/${fx.ids.own}$`));
  });

  test("'Takip ettiğin köşklerden' lists a course of a followed köşk, and leaves out the one the talebe is in", async ({
    page,
  }) => {
    await page.goto("/tr/home");
    const section = page.locator("section", {
      has: page.getByRole("heading", { name: "Takip ettiğin köşklerden" }),
    });
    const line = section.getByRole("listitem").filter({
      has: page.getByRole("link", { name: fx.titles.followedCourse }),
    });
    await expect(line).toContainText(fx.titles.followedKosk);
    await expect(line).toContainText("Müderris Ayşe Nur Kılıçarslan");
    await expect(
      section.getByRole("link", { name: fx.titles.enrolledCourse })
    ).toHaveCount(0);
  });

  test("on a phone it is one column and does not scroll sideways", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/tr/home");
    await expect(
      page.getByRole("heading", { name: "Bugün çalışılacak desteler" })
    ).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("Çalışma (tedris/30)", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!ready, "no Keycloak talebe in the environment");
    await signInAsTalebe(page);
  });

  test("starts with the cards waiting for a repeat, then the unstarted one; the back is hidden", async ({
    page,
  }) => {
    await page.goto(`/tr/decks/study/${fx.ids.own}`);
    const main = page.getByRole("main");
    await expect(
      main.getByRole("heading", { level: 1, name: "Çalışma" })
    ).toBeVisible();
    await expect(main).toContainText(
      `${fx.titles.own} · Bugün tekrar bekleyen 2 kart`
    );
    await expect(main).toContainText("Bu tur: 0 / 3 kart");
    await expect(main).toContainText("Kart 1 / 3");
    // The card that waited longest is first; the one learning for three days
    // more is not in the round at all.
    await expect(main.getByText(fx.fronts.dueB)).toBeVisible();
    await expect(main.getByText(fx.fronts.later)).toHaveCount(0);
    await expect(main.getByText("Arka yüz", { exact: true })).toHaveCount(0);
    await expect(main.getByText("Öğreniliyor")).toBeVisible();
  });

  test("turning a card over shows its back and the three ratings", async ({
    page,
  }) => {
    await page.goto(`/tr/decks/study/${fx.ids.own}`);
    await page.getByRole("button", { name: "Arka yüzü göster" }).click();
    await expect(
      page.getByText("Arka yüz", { exact: true }).filter({ visible: true })
    ).toBeVisible();
    await expect(
      page.getByText("Ne kadar zordu?").filter({ visible: true })
    ).toBeVisible();
    for (const name of ["Zor", "Orta", "Kolay"]) {
      await expect(page.getByRole("button", { name })).toBeVisible();
    }
  });

  test("the space bar turns the card over", async ({ page }) => {
    await page.goto(`/tr/decks/study/${fx.ids.own}`);
    // The key is read once the page has hydrated; a press before that does nothing,
    // so press until the card is over (each press turns it once, so none is wasted).
    await expect(async () => {
      await page.keyboard.press("Space");
      await expect(
        page.getByText("Ne kadar zordu?").filter({ visible: true })
      ).toBeVisible({
        timeout: 1_000,
      });
    }).toPass();
  });

  test("rating a card writes its progress once, schedules it, and moves on; the round ends with a summary", async ({
    page,
  }) => {
    await page.goto(`/tr/decks/study/${fx.ids.own}`);
    const main = page.getByRole("main");

    await page.getByRole("button", { name: "Arka yüzü göster" }).click();
    await page.getByRole("button", { name: "Kolay" }).click();
    await expect(main).toContainText("Bu tur: 1 / 3 kart");
    await expect(main).toContainText("Kart 2 / 3");
    // Everything starts hidden again on the next card.
    await expect(page.getByText("Ne kadar zordu?")).toHaveCount(0);

    // The first card of the round is the one with no time at all.
    await expect
      .poll(() => progressOf(fx.ids.cards.dueB))
      .toMatchObject({ status: "MASTERED", interval_days: 7 });
    expect(
      (await progressOf(fx.ids.cards.dueB))?.due_at?.getTime()
    ).toBeGreaterThan(Date.now() + 6 * 86_400_000);

    await page.getByRole("button", { name: "Arka yüzü göster" }).click();
    await page.getByRole("button", { name: "Zor" }).click();
    await expect
      .poll(() => progressOf(fx.ids.cards.dueA))
      .toMatchObject({ status: "LEARNING", interval_days: 1 });

    await page.getByRole("button", { name: "Arka yüzü göster" }).click();
    await page.getByRole("button", { name: "Orta" }).click();
    await expect
      .poll(() => progressOf(fx.ids.cards.fresh))
      .toMatchObject({ status: "LEARNING", interval_days: 3 });
    await expect(main).toContainText("Tur bitti");
    await expect(main).toContainText("3 kartı çalıştın.");

    // A new round has nothing waiting: every card was rated, and the one the
    // talebe was not due for is still a few days off.
    await page.goto(`/tr/decks/study/${fx.ids.own}`);
    await expect(main).toContainText("Bugün için bitti");
  });

  test("'Çalışmayı bitir' leaves the cards that are left as they are", async ({
    page,
  }) => {
    const before = await progressOf(fx.ids.cards.later);
    await page.goto(`/tr/decks/study/${fx.ids.courseDeck}`);
    await page.getByRole("link", { name: "Çalışmayı bitir" }).click();
    await expect(page).toHaveURL(new RegExp(`/tr/decks/${fx.ids.courseDeck}$`));
    expect(await progressOf(fx.ids.cards.later)).toEqual(before);
  });

  test("another person's private deck is the not-found page", async ({
    page,
  }) => {
    const response = await page.goto(
      `/tr/decks/study/${fx.ids.strangerPrivate}`
    );
    expect(response?.status()).toBe(404);
  });
});

test.describe("Deste, girişsiz ziyaretçi (tedris/32)", () => {
  // Nothing signs in here: the context has no cookies.
  test("shows a public deck and its cards, six at a time, with the way to sign in", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`/tr/decks/${fx.ids.publicDeck}`);
    const main = page.getByRole("main");
    await expect(
      main.getByRole("heading", { level: 1, name: fx.titles.publicDeck })
    ).toBeVisible();
    await expect(main.getByText("Herkese açık").first()).toBeVisible();
    await expect(main).toContainText("8 ezber kartı");
    await expect(
      main.getByRole("navigation", { name: "Sayfa yolu" })
    ).toContainText("Keşfet");
    await expect(main).toContainText(
      "Giriş yapmadan çalışırsan ilerlemen kaydedilmez."
    );
    await expect(
      main.getByRole("link", { name: "Kaydetmek için giriş yap" })
    ).toHaveAttribute("href", /callbackUrl=.*decks.*/);
    // No signed-in controls.
    await expect(
      main.getByRole("button", { name: /Koleksiyona ekle/ })
    ).toHaveCount(0);
    await expect(main.getByRole("button", { name: /kopyala/i })).toHaveCount(0);

    await expect(main).toContainText("8 karttan 6’sı gösteriliyor");
    await main.getByRole("button", { name: "Daha fazla göster" }).click();
    await expect(main).toContainText("8 karttan 8’i gösteriliyor");
    await context.close();
  });

  test("'Çalış' studies without writing anything", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const writes: string[] = [];
    // A server action posts to the page it was called from; the visitor's
    // time zone sync does too, and is not a write of progress.
    page.on("request", (request) => {
      if (request.method() !== "GET" && request.url().includes("/decks/study/"))
        writes.push(request.url());
    });
    await page.goto(`/tr/decks/${fx.ids.publicDeck}`);
    await page.getByRole("link", { name: "Çalış" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/tr/decks/study/${fx.ids.publicDeck}$`)
    );
    const main = page.getByRole("main");
    await expect(main).toContainText("Kart 1 / 8");
    await expect(main).toContainText(
      "Giriş yapmadan çalışırsan ilerlemen kaydedilmez."
    );
    await page.getByRole("button", { name: "Arka yüzü göster" }).click();
    await page.getByRole("button", { name: "Kolay" }).click();
    await expect(main).toContainText("Bu tur: 1 / 8 kart");
    expect(writes).toEqual([]);
    const db = await pgClient();
    const { rows } = await db.query(
      "select count(*)::int as n from flashcard_progress where flashcard_id in (select id from flashcards where deck_id = $1)",
      [fx.ids.publicDeck]
    );
    await db.end();
    expect(rows[0].n).toBe(0);
    await context.close();
  });

  test("a private deck sends the visitor to sign in and gives nothing away", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    for (const path of [
      `/tr/decks/${fx.ids.strangerPrivate}`,
      `/tr/decks/study/${fx.ids.strangerPrivate}`,
    ]) {
      // The sign-in hand-off leaves the app mid-navigation: wait for the URL,
      // not for the load.
      await page.goto(path, { waitUntil: "commit" }).catch(() => undefined);
      await expect(page).toHaveURL(/signin|api\/auth|auth\.medaris/);
      expect(await page.content()).not.toContain("gizli anlam");
    }
    await context.close();
  });

  test("the pages that stay behind the sign-in still do", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    for (const path of ["/tr/decks", "/tr/decks/create", "/tr/decks/explore"]) {
      await page.goto(path, { waitUntil: "commit" }).catch(() => undefined);
      await expect(page).toHaveURL(/signin|api\/auth|auth\.medaris/);
    }
    await context.close();
  });
});
