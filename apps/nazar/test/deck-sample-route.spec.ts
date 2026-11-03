import { Configuration, FlashcardCardsApi } from "@medaris/services/tedrisat";
import { beforeEach, describe, expect, it, vi } from "vitest";

const CSV = "Ön Yüz,Arka Yüz\nنَصَرَ,yardım etti\n";
let served: Response;
const fetchApi = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
  served.clone()
);

vi.mock("next/navigation", () => ({ unstable_rethrow: () => undefined }));
vi.mock("~/lib/tedrisat-api", () => ({
  tedrisatApi: async () => ({
    cards: new FlashcardCardsApi(
      new Configuration({ basePath: "http://tedrisat.test", fetchApi })
    ),
  }),
}));

const { GET } = await import("~/app/api/decks/sample/route");

describe("the import's sample template", () => {
  beforeEach(() => {
    fetchApi.mockClear();
  });

  it("sends the CSV as it came, not read as JSON", async () => {
    served = new Response(CSV, { headers: { "Content-Type": "text/csv" } });
    const response = await GET(
      new Request("http://nazar.test/api/decks/sample?format=csv")
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="deste-ornek.csv"'
    );
    expect(await response.text()).toBe(CSV);
    expect(String(fetchApi.mock.calls[0]?.[0])).toContain(
      "/flashcard/cards/bulk/sample?format=csv"
    );
  });

  it("sends the workbook's bytes unchanged", async () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00]);
    served = new Response(zip);
    const response = await GET(
      new Request("http://nazar.test/api/decks/sample?format=xlsx")
    );
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(zip);
  });

  it("answers 502 when tedrisat refuses", async () => {
    served = new Response("{}", { status: 500 });
    const response = await GET(
      new Request("http://nazar.test/api/decks/sample?format=csv")
    );
    expect(response.status).toBe(502);
  });
});
