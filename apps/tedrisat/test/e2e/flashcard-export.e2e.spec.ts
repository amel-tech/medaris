import { ExcelService } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import { FlashcardType } from "../../src/flashcard/domain/flashcard-type.enum";
import { FLASHCARD_EXCEL_CONFIG } from "../../src/flashcard/dto/config-excel.dto";
import { createTestApp, TEST_USER_ID } from "../helpers/test-app.helper";
import { TestDatabaseUtils } from "../helpers/test-database.helper";

/**
 * MDRS-36. `exportCards` streams a whole deck, and the cards in it were
 * authored by other users. `ExcelService` copied `contentFront` /
 * `contentBack` into the sheet verbatim and the csv branch wrote that text out
 * raw, so a card beginning with `=` reached the downloader as a live formula.
 *
 * These assertions are on the response body — the bytes a browser saves — not
 * on the escaping helper, which `test/unit/neutralize-formula.spec.ts` covers
 * separately. Drop the `neutralizeFormula` call in `ExcelService.exportData`
 * and the escape tests below go red; drop the matching `denormalizeFormula`
 * call in `parseSheet` and the round-trip tests go red instead.
 */

const HYPERLINK = '=HYPERLINK("http://evil","click")';

describe("Flashcard deck export (e2e)", () => {
  let app: INestApplication;
  let dbUtils: TestDatabaseUtils;
  let deckId: string;

  beforeAll(async () => {
    app = await createTestApp({ authUserId: TEST_USER_ID });
    dbUtils = new TestDatabaseUtils(app.get<DatabaseService>(DatabaseService));
  });

  beforeEach(async () => {
    await dbUtils.cleanTables("flashcards", "decks");

    const deck = await request(app.getHttpServer())
      .post("/flashcard/decks")
      .send({ title: "Export deck", isPublic: false });
    expect(deck.status).toBe(201);
    deckId = deck.body.id;
  });

  afterAll(async () => {
    await dbUtils.cleanTables("flashcards", "decks");
    await app.close();
  });

  const addCard = async (contentFront: string, contentBack: string) => {
    const response = await request(app.getHttpServer())
      .post(`/flashcard/decks/${deckId}/cards/bulk`)
      .send([{ type: FlashcardType.VOCABULARY, contentFront, contentBack }]);
    expect(response.status).toBe(201);
  };

  /**
   * supertest parses an unknown content type into `res.body` as a Buffer only
   * when told to buffer, so the response is collected by hand here — for
   * both formats, so a fix to this collection (an error path, a size guard,
   * an encoding) can't miss one of them.
   */
  const exportDeck = async (format: "csv" | "xlsx") => {
    const response = await request(app.getHttpServer())
      .get(`/flashcard/decks/${deckId}/cards/bulk/export?format=${format}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    return response.body as Buffer;
  };

  const exportCsv = async () => (await exportDeck("csv")).toString("utf8");

  it("escapes a formula card in the downloaded csv bytes", async () => {
    await addCard(HYPERLINK, "back");

    const csv = await exportCsv();

    // exceljs quotes any field holding a comma and doubles the quotes inside
    // it, so the field arrives as "'=HYPERLINK(""http://evil"",""click"")".
    // What matters is the first character of the field content: the escape
    // sits immediately inside the opening quote, ahead of the `=`.
    expect(csv).toContain(`,"'=HYPERLINK(`);
    // And the unescaped field — the one a spreadsheet would evaluate — is
    // nowhere in the bytes.
    expect(csv).not.toContain(`,"=HYPERLINK(`);
  });

  it("escapes every trigger character on both sides of a card", async () => {
    // MinLength(3) on both fields is why these are not the bare `+1` / `-1`
    // of the unit spec; the trigger character is what is under test.
    await addCard("@SUM(A1)", "-1000");

    const csv = await exportCsv();

    expect(csv).toContain("'@SUM(A1)");
    expect(csv).toContain("'-1000");
  });

  it("leaves an ordinary card unquoted and unchanged", async () => {
    await addCard("hello", "merhaba");

    const csv = await exportCsv();

    expect(csv).toContain("hello");
    expect(csv).not.toContain("'hello");
  });

  it("stores the escaped value as a string cell in the xlsx branch, and round-trips it intact", async () => {
    await addCard(HYPERLINK, "back");

    const xlsx = await exportDeck("xlsx");
    const [row] = await app
      .get(ExcelService)
      .parseFile(xlsx, FLASHCARD_EXCEL_CONFIG, "xlsx");

    // Two things at once. First, the finding recorded for the PR: exceljs
    // stores a JS string as a shared string, never as a formula, so the xlsx
    // branch was never the live vector and escaping it is defence in depth —
    // a formula cell would read back as a `{ formula, result }` object, which
    // would already fail this typeof check before the value check runs.
    // Second, `denormalizeFormula` strips the escape back out in `parseSheet`,
    // so the card's own content — not the escaped form — is what a re-import
    // sees.
    expect(typeof row.contentFront).toBe("string");
    expect(row.contentFront).toBe(HYPERLINK);
  });

  it("round-trips a legitimate card that starts with a trigger character", async () => {
    // Before parseSheet had an inverse for the export-side escape, this came
    // back permanently prefixed — "'-ler" — on every export/import cycle, a
    // real risk for vocabulary/morphology decks where a card legitimately
    // starts with "-" or "+" (a suffix drill, here).
    await addCard("-ler", "plural suffix");

    const xlsx = await exportDeck("xlsx");
    const [row] = await app
      .get(ExcelService)
      .parseFile(xlsx, FLASHCARD_EXCEL_CONFIG, "xlsx");

    expect(row.contentFront).toBe("-ler");
  });
});
