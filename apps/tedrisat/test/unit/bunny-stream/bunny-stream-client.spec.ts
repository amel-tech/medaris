import {
  BunnyStreamClient,
  BunnyStreamNotConfiguredError,
  BunnyStreamUnavailableError,
} from "../../../src/bunny-stream/bunny-stream.client";
import { readBunnyStreamConfig } from "../../../src/config/bunny-stream-env";

const ENV = {
  BUNNY_STREAM_LIBRARY_ID: "12345",
  BUNNY_STREAM_API_KEY: "set-me-api-key",
} as NodeJS.ProcessEnv;

describe("readBunnyStreamConfig (MDRS-116)", () => {
  it("is null when neither the library id nor the API key is set, so the API still boots", () => {
    expect(readBunnyStreamConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(
      readBunnyStreamConfig({
        BUNNY_STREAM_LIBRARY_ID: " ",
        BUNNY_STREAM_API_KEY: "",
      } as NodeJS.ProcessEnv)
    ).toBeNull();
  });

  it("reads the library, with the token key optional", () => {
    expect(readBunnyStreamConfig(ENV)).toEqual({
      libraryId: "12345",
      apiKey: "set-me-api-key",
      tokenKey: null,
      embedLifetimeSeconds: 21_600,
    });
    expect(
      readBunnyStreamConfig({ ...ENV, BUNNY_STREAM_TOKEN_KEY: "tk" })?.tokenKey
    ).toBe("tk");
  });

  it("refuses one of the pair without the other, and a library id that is not a number", () => {
    expect(() =>
      readBunnyStreamConfig({ BUNNY_STREAM_API_KEY: "k" } as NodeJS.ProcessEnv)
    ).toThrow(/together/);
    expect(() =>
      readBunnyStreamConfig({ ...ENV, BUNNY_STREAM_LIBRARY_ID: "lib" })
    ).toThrow(/numeric/);
  });

  it("never puts the API key in an error", () => {
    let message = "";
    try {
      readBunnyStreamConfig({ ...ENV, BUNNY_STREAM_LIBRARY_ID: "lib" });
    } catch (error) {
      message = String(error);
    }
    expect(message).toMatch(/numeric/);
    expect(message).not.toContain("set-me-api-key");
  });
});

describe("BUNNY_STREAM_EMBED_TTL_SECONDS (MDRS-119)", () => {
  const ttl = (value: string) =>
    readBunnyStreamConfig({ ...ENV, BUNNY_STREAM_EMBED_TTL_SECONDS: value })
      ?.embedLifetimeSeconds;

  it("defaults to 6 hours, and an empty value is unset", () => {
    expect(ttl("")).toBe(21_600);
    expect(ttl("  ")).toBe(21_600);
  });

  it("takes a whole number of seconds from a minute to a week", () => {
    expect(ttl("60")).toBe(60);
    expect(ttl(" 7200 ")).toBe(7200);
    expect(ttl("604800")).toBe(604_800);
  });

  it("stops the boot on anything else", () => {
    for (const bad of ["59", "604801", "0", "-60", "3600.5", "6h", "1e4"]) {
      expect(() => ttl(bad)).toThrow(/BUNNY_STREAM_EMBED_TTL_SECONDS/);
    }
  });
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("BunnyStreamClient.embedUrl (MDRS-119)", () => {
  it("signs with the library's token key and its configured lifetime", () => {
    const config = readBunnyStreamConfig({
      ...ENV,
      BUNNY_STREAM_TOKEN_KEY: "set-me-token-key",
      BUNNY_STREAM_EMBED_TTL_SECONDS: "120",
    });
    const client = new BunnyStreamClient(config, vi.fn() as never);
    const now = new Date("2026-10-04T10:00:00.900Z");
    const url = new URL(
      client.embedUrl("a1b2c3d4-0000-4000-8000-00000000abcd", now) ?? ""
    );
    expect(url.origin).toBe("https://player.mediadelivery.net");
    expect(url.pathname).toBe(
      "/embed/12345/a1b2c3d4-0000-4000-8000-00000000abcd"
    );
    expect(Number(url.searchParams.get("expires"))).toBe(
      Math.floor(now.getTime() / 1000) + 120
    );
    expect(url.searchParams.get("token")).toMatch(/^[0-9a-f]{64}$/);
    expect(client.libraryId).toBe("12345");
  });
});

describe("BunnyStreamClient (MDRS-116)", () => {
  it("answers 503 for everything but the player link when not configured", async () => {
    const fetchImpl = vi.fn();
    const client = new BunnyStreamClient(null, fetchImpl as never);
    expect(client.isConfigured()).toBe(false);
    expect(() => client.assertConfigured()).toThrow(
      BunnyStreamNotConfiguredError
    );
    await expect(client.createVideo("x")).rejects.toBeInstanceOf(
      BunnyStreamNotConfiguredError
    );
    expect(client.embedUrl("v")).toBeNull();
    expect(client.libraryId).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("creates a video with the API key as AccessKey and returns its guid", async () => {
    const fetchImpl = vi.fn(async () => json({ guid: "video-1" }));
    const client = new BunnyStreamClient(
      readBunnyStreamConfig(ENV),
      fetchImpl as never
    );
    await expect(client.createVideo("Celse kaydı")).resolves.toBe("video-1");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(url).toBe("https://video.bunnycdn.com/library/12345/videos");
    expect(init.method).toBe("POST");
    expect(init.headers.AccessKey).toBe("set-me-api-key");
    expect(JSON.parse(String(init.body))).toEqual({ title: "Celse kaydı" });
  });

  it("reads a video's status, and null once Bunny no longer has it", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ status: 4, length: 125 }))
      .mockResolvedValueOnce(json({ message: "not found" }, 404));
    const client = new BunnyStreamClient(
      readBunnyStreamConfig(ENV),
      fetchImpl as never
    );
    await expect(client.getVideo("v")).resolves.toEqual({
      status: 4,
      length: 125,
    });
    await expect(client.getVideo("v")).resolves.toBeNull();
  });

  it("turns a failure or an unexpected answer into BUNNY_STREAM_UNAVAILABLE", async () => {
    const client = (impl: () => Promise<Response>) =>
      new BunnyStreamClient(readBunnyStreamConfig(ENV), vi.fn(impl) as never);
    await expect(
      client(async () => json({}, 500)).createVideo("x")
    ).rejects.toBeInstanceOf(BunnyStreamUnavailableError);
    await expect(
      client(async () => {
        throw new Error("ECONNREFUSED");
      }).getVideo("v")
    ).rejects.toBeInstanceOf(BunnyStreamUnavailableError);
    await expect(
      client(async () => json({ title: "no guid" })).createVideo("x")
    ).rejects.toBeInstanceOf(BunnyStreamUnavailableError);
  });

  it("signs an upload without handing out the API key", () => {
    const client = new BunnyStreamClient(
      readBunnyStreamConfig(ENV),
      vi.fn() as never
    );
    const auth = client.uploadAuthorization(
      "a1b2c3d4-0000-4000-8000-00000000abcd",
      1791100000
    );
    expect(auth).toEqual({
      endpoint: "https://video.bunnycdn.com/tusupload",
      libraryId: "12345",
      videoId: "a1b2c3d4-0000-4000-8000-00000000abcd",
      authorizationExpire: 1791100000,
      authorizationSignature:
        "145739fd0669a43c19bfcf839d0f07b7f3b54f20e18309a4817791e4604c302c",
    });
    expect(JSON.stringify(auth)).not.toContain("set-me-api-key");
  });
});
