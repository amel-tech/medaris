import { beforeEach, describe, expect, it, vi } from "vitest";

const token = vi.hoisted(() => ({
  value: "access-token" as string | undefined,
}));
vi.mock("~/lib/auth_options", () => ({
  getAccessToken: async () => token.value,
}));

const DECK = "d0000000-0000-4000-8000-000000000001";
const fetchMock = vi.fn();

beforeEach(() => {
  token.value = "access-token";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const ctx = (id = DECK) => ({ params: Promise.resolve({ id }) });

describe("the deck file routes (design tedris/29)", () => {
  it("export hands the request to tedrisat with the caller's token and gives the file back as it came", async () => {
    fetchMock.mockResolvedValue(
      new Response("xlsx-bytes", {
        status: 200,
        headers: {
          "content-type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": 'attachment; filename="deste.xlsx"',
          "set-cookie": "must=not-pass",
        },
      })
    );
    const { GET } = await import("~/app/api/decks/[id]/export/route");
    const res = await GET(
      new Request(`http://app/api/decks/${DECK}/export?format=xlsx`),
      ctx()
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `http://127.0.0.1:1/flashcard/decks/${DECK}/cards/bulk/export?format=xlsx`,
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer access-token" },
      })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="deste.xlsx"'
    );
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await res.text()).toBe("xlsx-bytes");
  });

  it("export defaults to xlsx and refuses a format the API does not know, and an id that is no UUID", async () => {
    fetchMock.mockResolvedValue(new Response("x"));
    const { GET } = await import("~/app/api/decks/[id]/export/route");
    await GET(new Request(`http://app/api/decks/${DECK}/export`), ctx());
    expect(String(fetchMock.mock.calls[0][0])).toContain("format=xlsx");
    fetchMock.mockClear();
    const bad = await GET(
      new Request(`http://app/api/decks/${DECK}/export?format=pdf`),
      ctx()
    );
    expect(bad.status).toBe(400);
    const notUuid = await GET(
      new Request("http://app/api/decks/x/export?format=csv"),
      ctx("x")
    );
    expect(notUuid.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("without a usable token it answers 401 and does not reach tedrisat", async () => {
    token.value = undefined;
    const { GET } = await import("~/app/api/decks/sample/route");
    const res = await GET(
      new Request("http://app/api/decks/sample?format=csv")
    );
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes tedrisat's own refusals on: 403 for a stranger's deck, 429 with its Retry-After", async () => {
    const { GET } = await import("~/app/api/decks/[id]/export/route");
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 403 }));
    expect(
      (
        await GET(
          new Request(`http://app/api/decks/${DECK}/export?format=csv`),
          ctx()
        )
      ).status
    ).toBe(403);
    fetchMock.mockResolvedValueOnce(
      new Response("{}", { status: 429, headers: { "retry-after": "30" } })
    );
    const limited = await GET(
      new Request(`http://app/api/decks/${DECK}/export?format=csv`),
      ctx()
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("30");
  });

  it("a service that cannot be reached is a 502, not a crash", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const { GET } = await import("~/app/api/decks/sample/route");
    const res = await GET(
      new Request("http://app/api/decks/sample?format=xlsx")
    );
    expect(res.status).toBe(502);
  });

  it("import sends the one file on as a multipart upload and gives the answer back, 422 body included", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ context: { errors: [] } }), {
        status: 422,
        headers: { "content-type": "application/json" },
      })
    );
    const { POST } = await import("~/app/api/decks/[id]/import/route");
    const form = new FormData();
    form.set("file", new File(["a,b"], "kartlar.csv", { type: "text/csv" }));
    form.set("other", "dropped");
    const res = await POST(
      new Request(`http://app/api/decks/${DECK}/import`, {
        method: "POST",
        body: form,
      }),
      ctx()
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `http://127.0.0.1:1/flashcard/decks/${DECK}/cards/bulk/import`
    );
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: "Bearer access-token" });
    const sent = init.body as FormData;
    expect([...sent.keys()]).toEqual(["file"]);
    expect((sent.get("file") as File).name).toBe("kartlar.csv");
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ context: { errors: [] } });
  });

  it("import refuses a request with no file, or for an id that is no UUID", async () => {
    const { POST } = await import("~/app/api/decks/[id]/import/route");
    const empty = await POST(
      new Request(`http://app/api/decks/${DECK}/import`, {
        method: "POST",
        body: new FormData(),
      }),
      ctx()
    );
    expect(empty.status).toBe(400);
    const form = new FormData();
    form.set("file", new File(["x"], "x.csv"));
    const notUuid = await POST(
      new Request("http://app/api/decks/x/import", {
        method: "POST",
        body: form,
      }),
      ctx("x")
    );
    expect(notUuid.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
