import type { IBunnyStorageConfig } from "../../../src/config/bunny-storage-env";
import { readBunnyStorageConfig } from "../../../src/config/bunny-storage-env";
import { BunnyObjectStorage } from "../../../src/storage/bunny-object-storage";
import {
  StorageNotConfiguredError,
  StorageUnavailableError,
} from "../../../src/storage/object-storage";

const SECRET = "secret-that-must-not-leak";
const ENV = {
  BUNNY_STORAGE_ENDPOINT: "https://de-s3.storage.bunnycdn.com",
  BUNNY_STORAGE_REGION: "de",
  BUNNY_STORAGE_BUCKET: "medaris-files",
  BUNNY_STORAGE_ACCESS_KEY_ID: "medaris-files",
  BUNNY_STORAGE_SECRET_ACCESS_KEY: SECRET,
  BUNNY_STORAGE_KEY_PREFIX: "local-dev",
} as NodeJS.ProcessEnv;

describe("readBunnyStorageConfig (MDRS-287)", () => {
  it("is null with none of the six keys, so the API still boots", () => {
    expect(readBunnyStorageConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(
      readBunnyStorageConfig({
        BUNNY_STORAGE_ENDPOINT: " ",
      } as NodeJS.ProcessEnv)
    ).toBeNull();
  });

  it("reads all six, the endpoint as an origin", () => {
    expect(
      readBunnyStorageConfig({
        ...ENV,
        BUNNY_STORAGE_ENDPOINT: "https://de-s3.storage.bunnycdn.com/",
      })
    ).toEqual({
      endpoint: "https://de-s3.storage.bunnycdn.com",
      region: "de",
      bucket: "medaris-files",
      accessKeyId: "medaris-files",
      secretAccessKey: SECRET,
      keyPrefix: "local-dev",
    });
  });

  it("stops the boot when only some are set, naming the missing keys", () => {
    const { BUNNY_STORAGE_SECRET_ACCESS_KEY: _s, ...rest } = ENV;
    expect(() => readBunnyStorageConfig(rest)).toThrow(
      /BUNNY_STORAGE_SECRET_ACCESS_KEY is not set/
    );
  });

  it("refuses an endpoint that is not an https origin, and a prefix of more than one segment", () => {
    for (const endpoint of [
      "http://de-s3.storage.bunnycdn.com",
      "https://de-s3.storage.bunnycdn.com/zone",
      "https://user:pw@de-s3.storage.bunnycdn.com",
      "de-s3.storage.bunnycdn.com",
    ]) {
      expect(() =>
        readBunnyStorageConfig({ ...ENV, BUNNY_STORAGE_ENDPOINT: endpoint })
      ).toThrow(/BUNNY_STORAGE_ENDPOINT/);
    }
    expect(() =>
      readBunnyStorageConfig({ ...ENV, BUNNY_STORAGE_KEY_PREFIX: "prod/x" })
    ).toThrow(/BUNNY_STORAGE_KEY_PREFIX/);
    // A loopback stand-in may be plain http.
    expect(
      readBunnyStorageConfig({
        ...ENV,
        BUNNY_STORAGE_ENDPOINT: "http://localhost:9000",
      })?.endpoint
    ).toBe("http://localhost:9000");
  });

  it("never puts a value in an error", () => {
    let message = "";
    try {
      readBunnyStorageConfig({
        ...ENV,
        BUNNY_STORAGE_REGION: SECRET.toUpperCase(),
      });
    } catch (error) {
      message = String(error);
    }
    expect(message).toMatch(/BUNNY_STORAGE_REGION/);
    expect(message.toLowerCase()).not.toContain(SECRET);
  });
});

describe("BunnyObjectStorage (MDRS-287)", () => {
  const config = readBunnyStorageConfig(ENV) as IBunnyStorageConfig;
  const calls: { url: string; init: RequestInit }[] = [];
  const answer =
    (response: () => Response) =>
    async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return response();
    };

  beforeEach(() => {
    calls.length = 0;
  });

  it("puts an object path-style, signed for the zone's region, with its body's hash", async () => {
    const storage = new BunnyObjectStorage(
      config,
      answer(() => new Response(null, { status: 200 })) as typeof fetch
    );
    const body = Buffer.from("%PDF-1.4");
    await storage.put(
      "local-dev/courses/c/resources/r",
      body,
      "application/pdf"
    );
    const [{ url, init }] = calls;
    expect(url).toBe(
      "https://de-s3.storage.bunnycdn.com/medaris-files/local-dev/courses/c/resources/r"
    );
    expect(init.method).toBe("PUT");
    const headers = init.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/pdf");
    expect(headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=medaris-files\/\d{8}\/de\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/
    );
    expect(headers["x-amz-content-sha256"]).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(init.headers)).not.toContain(SECRET);
  });

  it("streams an object back, and answers null for a key the store does not have", async () => {
    const found = new BunnyObjectStorage(
      config,
      answer(
        () =>
          new Response("hello", {
            status: 200,
            headers: { "content-length": "5" },
          })
      ) as typeof fetch
    );
    const object = await found.get("local-dev/x");
    expect(object?.size).toBe(5);
    const chunks: Buffer[] = [];
    for await (const chunk of object?.body ?? [])
      chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe("hello");

    const missing = new BunnyObjectStorage(
      config,
      answer(() => new Response("<Error/>", { status: 404 })) as typeof fetch
    );
    expect(await missing.get("local-dev/x")).toBeNull();
    expect(await missing.head("local-dev/x")).toBeNull();
    // Deleting what is already gone is not an error.
    await expect(missing.delete("local-dev/x")).resolves.toBeUndefined();
  });

  it("answers 503 STORAGE_UNAVAILABLE when the store refuses or cannot be reached", async () => {
    const refusing = new BunnyObjectStorage(
      config,
      answer(() => new Response("<Error/>", { status: 403 })) as typeof fetch
    );
    await expect(
      refusing.put("local-dev/x", Buffer.from("a"), "text/plain")
    ).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(refusing.delete("local-dev/x")).rejects.toBeInstanceOf(
      StorageUnavailableError
    );
    const down = new BunnyObjectStorage(config, (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch);
    await expect(down.get("local-dev/x")).rejects.toBeInstanceOf(
      StorageUnavailableError
    );
  });

  it("answers 503 STORAGE_NOT_CONFIGURED without the keys, and calls nothing", async () => {
    const storage = new BunnyObjectStorage(
      null,
      answer(() => new Response(null)) as typeof fetch
    );
    expect(storage.isConfigured()).toBe(false);
    expect(() => storage.keyPrefix()).toThrow(StorageNotConfiguredError);
    await expect(storage.get("x")).rejects.toBeInstanceOf(
      StorageNotConfiguredError
    );
    expect(calls).toHaveLength(0);
  });
});
