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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

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
