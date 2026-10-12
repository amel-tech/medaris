import { isUnauthenticated } from "@medaris/auth/server";
import {
  DOWNLOAD_HEADERS,
  isProxiablePath,
  isUuid,
  MAX_FILE_BYTES,
  MULTIPART_ALLOWANCE_BYTES,
  proxyDownload,
  proxyUpload,
} from "../src/file-proxy";

const API = "http://tedrisat.test/api";
const COURSE = "0b7f6c1e-2a4d-4c8e-9f10-3a5b6c7d8e9f";
const RESOURCE = "5d2e8f40-1c3b-4a6d-8e7f-90a1b2c3d4e5";
const UPLOAD_PATH = `/courses/${COURSE}/resources/files`;
const DOWNLOAD_PATH = `/courses/${COURSE}/resources/${RESOURCE}/file`;
const BOUNDARY = "----medaris-file-proxy-spec";
const MULTIPART = `multipart/form-data; boundary=${BOUNDARY}`;

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const multipartBody = () =>
  [
    `--${BOUNDARY}`,
    'Content-Disposition: form-data; name="file"; filename="ders.pdf"',
    "Content-Type: application/pdf",
    "",
    "%PDF-1.7 spec",
    `--${BOUNDARY}--`,
    "",
  ].join("\r\n");

/** A browser upload as it reaches a route handler: a stream, never parsed. */
const uploadRequest = (
  options: { contentType?: string | null; contentLength?: number } = {}
) => {
  const headers = new Headers();
  const contentType =
    options.contentType === undefined ? MULTIPART : options.contentType;
  if (contentType !== null) headers.set("content-type", contentType);
  if (options.contentLength !== undefined) {
    headers.set("content-length", String(options.contentLength));
  }
  return new Request("http://app.test/api/files/upload", {
    method: "POST",
    headers,
    body: new Blob([multipartBody()]).stream(),
    duplex: "half",
  } as RequestInit);
};

const upload = (
  request: Request,
  overrides: {
    path?: string;
    accessToken?: string | null;
    maxBytes?: number;
  } = {}
) =>
  proxyUpload(request, {
    apiBaseUrl: API,
    path: overrides.path ?? UPLOAD_PATH,
    accessToken:
      overrides.accessToken === undefined ? "token-1" : overrides.accessToken,
    maxBytes: overrides.maxBytes ?? MAX_FILE_BYTES,
  });

const download = (
  overrides: {
    path?: string;
    accessToken?: string | null;
    apiBaseUrl?: string;
    signal?: AbortSignal;
  } = {}
) =>
  proxyDownload({
    apiBaseUrl: overrides.apiBaseUrl ?? API,
    path: overrides.path ?? DOWNLOAD_PATH,
    accessToken:
      overrides.accessToken === undefined ? "token-1" : overrides.accessToken,
    signal: overrides.signal,
  });

const tedrisatError = (status: number, code: string) => ({
  type: "APP_ERROR",
  code,
  status,
  message: code,
});

const lastInit = () => {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error("fetch was not called");
  return { url: call[0], init: call[1] ?? {} };
};

describe("isProxiablePath — what may be sent to tedrisat (MDRS-287)", () => {
  it("takes the course and celse file addresses", () => {
    for (const path of [
      DOWNLOAD_PATH,
      UPLOAD_PATH,
      `/lessons/${COURSE}/resources/files`,
      `/lessons/${COURSE}/submission/files/${RESOURCE}`,
      `/courses/${COURSE}/submissions/files/${RESOURCE}`,
    ]) {
      expect(isProxiablePath(path)).toBe(true);
    }
  });

  it("refuses other services, traversal, empty segments, queries and encodings", () => {
    for (const path of [
      "",
      "/",
      "/courses/",
      "courses/x/file",
      "/coursesx/file",
      "/flashcard/decks/x/cards/bulk/import",
      "/me",
      `/courses/${COURSE}/../../admin`,
      "/courses/./x",
      `/courses//${COURSE}`,
      `/courses/${COURSE}/`,
      `/courses/${COURSE}?include=all`,
      `/courses/${COURSE}#x`,
      "/courses/%2e%2e/admin",
      "/courses/x\\..\\admin",
      "/courses/x y",
      "/courses/x\n/admin",
      "http://evil.test/courses/x",
      "//evil.test/courses/x",
      `/courses/${"a".repeat(600)}`,
    ]) {
      expect(isProxiablePath(path), JSON.stringify(path)).toBe(false);
    }
  });
});

describe("isUuid — route params", () => {
  it("takes a UUID in either case and nothing else", () => {
    expect(isUuid(COURSE)).toBe(true);
    expect(isUuid(COURSE.toUpperCase())).toBe(true);
    for (const value of [
      "",
      "123",
      `${COURSE}x`,
      ` ${COURSE}`,
      `${COURSE}/..`,
      "../admin",
      null,
      undefined,
      42,
    ]) {
      expect(isUuid(value)).toBe(false);
    }
  });
});

describe("proxyUpload — browser to tedrisat (MDRS-287, MDRS-290)", () => {
  it("streams the request's own body to tedrisat with the token and the boundary", async () => {
    const created = { resource: { id: RESOURCE }, version: 3 };
    fetchMock.mockResolvedValue(Response.json(created, { status: 201 }));
    const request = uploadRequest({ contentLength: 2048 });

    const response = await upload(request);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init } = lastInit();
    expect(url).toBe(`${API}${UPLOAD_PATH}`);
    expect(init.method).toBe("POST");
    // The very stream the browser sent, unread: nothing is buffered here.
    expect(init.body).toBe(request.body);
    expect(request.bodyUsed).toBe(false);
    expect((init as { duplex?: string }).duplex).toBe("half");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer token-1");
    expect(headers.get("content-type")).toBe(MULTIPART);
    expect(init.redirect).toBe("error");
    expect(init.signal).toBe(request.signal);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(created);
  });

  it("refuses an announced size past the limit before reading a byte", async () => {
    const request = uploadRequest({
      contentLength: MAX_FILE_BYTES + MULTIPART_ALLOWANCE_BYTES + 1,
    });

    const response = await upload(request);

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      code: "FILE_TOO_LARGE",
      status: 413,
      context: { maxBytes: MAX_FILE_BYTES },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(request.bodyUsed).toBe(false);
  });

  it("lets the limit plus the multipart allowance through, and honours a smaller limit", async () => {
    fetchMock.mockResolvedValue(Response.json({}, { status: 201 }));
    const atLimit = await upload(
      uploadRequest({
        contentLength: MAX_FILE_BYTES + MULTIPART_ALLOWANCE_BYTES,
      })
    );
    expect(atLimit.status).toBe(201);

    const small = await upload(
      uploadRequest({
        contentLength: 1024 * 1024 + MULTIPART_ALLOWANCE_BYTES + 1,
      }),
      { maxBytes: 1024 * 1024 }
    );
    expect(small.status).toBe(413);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses a body that is not multipart/form-data with a boundary", async () => {
    for (const contentType of [
      null,
      "application/json",
      "text/plain",
      "application/octet-stream",
      "multipart/mixed; boundary=x",
      "multipart/form-data",
      "multipart/form-data; boundary=",
    ]) {
      const response = await upload(uploadRequest({ contentType }));
      expect(response.status, String(contentType)).toBe(415);
      expect(await response.json()).toMatchObject({
        code: "MULTIPART_REQUIRED",
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 401 unauthenticated without reauth when there is no token, sending nothing", async () => {
    for (const accessToken of [undefined, null, ""]) {
      const response = await proxyUpload(uploadRequest(), {
        apiBaseUrl: API,
        path: UPLOAD_PATH,
        accessToken,
        maxBytes: MAX_FILE_BYTES,
      });
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body).toEqual({ kind: "unauthenticated" });
      expect(isUnauthenticated(body)).toBe(true);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("turns tedrisat's 401 into the reauth answer the client helper acts on", async () => {
    fetchMock.mockResolvedValue(
      Response.json(tedrisatError(401, "HTTP_401"), { status: 401 })
    );

    const response = await upload(uploadRequest());

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ kind: "unauthenticated", reauth: true });
    expect(isUnauthenticated(body)).toBe(true);
  });

  it("passes tedrisat's refusals on with their status and JSON body", async () => {
    for (const [status, code] of [
      [400, "FILE_REQUIRED"],
      [403, "HTTP_403"],
      [404, "COURSE_NOT_FOUND"],
      [413, "FILE_TOO_LARGE"],
      [415, "FILE_TYPE_NOT_ALLOWED"],
      [503, "STORAGE_NOT_CONFIGURED"],
    ] as const) {
      fetchMock.mockResolvedValueOnce(
        Response.json(tedrisatError(status, code), {
          status,
          headers: { "set-cookie": "upstream=1" },
        })
      );
      const response = await upload(uploadRequest());
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual(tedrisatError(status, code));
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("refuses a path outside the allow-list without calling tedrisat", async () => {
    const response = await upload(uploadRequest(), {
      path: "/flashcard/decks/x/cards/bulk/import",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_PATH" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on a limit that is not a positive number (a wiring mistake)", async () => {
    await expect(
      upload(uploadRequest(), { maxBytes: Number.NaN })
    ).rejects.toThrow(RangeError);
    await expect(upload(uploadRequest(), { maxBytes: 0 })).rejects.toThrow(
      RangeError
    );
  });

  it("answers 502 when tedrisat cannot be reached", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    const response = await upload(uploadRequest());

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      code: "TEDRISAT_UNREACHABLE",
    });
  });
});

describe("proxyDownload — tedrisat to browser (MDRS-287, MDRS-290)", () => {
  const fileHeaders = {
    "content-type": "application/pdf",
    "content-length": "13",
    "content-disposition":
      "attachment; filename=\"ders.pdf\"; filename*=UTF-8''ders.pdf",
    "x-content-type-options": "nosniff",
    "cache-control": "private, no-store",
    "content-security-policy": "default-src 'none'; sandbox",
  };

  const fileResponse = (extra: Record<string, string> = {}) =>
    new Response(new Blob(["%PDF-1.7 spec"]).stream(), {
      status: 200,
      headers: { ...fileHeaders, ...extra },
    });

  it("streams the file with exactly the download headers tedrisat sent", async () => {
    const upstream = fileResponse({
      "set-cookie": "upstream=1",
      "access-control-allow-origin": "*",
      "x-powered-by": "Express",
      etag: 'W/"abc"',
      "x-amz-request-id": "r1",
      vary: "Origin",
    });
    fetchMock.mockResolvedValue(upstream);
    const controller = new AbortController();

    const response = await download({ signal: controller.signal });

    const { url, init } = lastInit();
    expect(url).toBe(`${API}${DOWNLOAD_PATH}`);
    expect(init.method).toBe("GET");
    const sent = new Headers(init.headers);
    expect(sent.get("authorization")).toBe("Bearer token-1");
    expect(sent.get("accept-encoding")).toBe("identity");
    expect(init.redirect).toBe("error");
    expect(init.signal).toBe(controller.signal);

    // Handed on unread: the bytes flow when the browser reads them.
    expect(upstream.bodyUsed).toBe(false);
    expect(response.status).toBe(200);
    expect([...response.headers.keys()].sort()).toEqual(
      [...DOWNLOAD_HEADERS].sort()
    );
    for (const [name, value] of Object.entries(fileHeaders)) {
      expect(response.headers.get(name)).toBe(value);
    }
    expect(await response.text()).toBe("%PDF-1.7 spec");
  });

  it("drops the length of a body fetch has decoded", async () => {
    fetchMock.mockResolvedValue(fileResponse({ "content-encoding": "gzip" }));

    const response = await download();

    expect(response.headers.get("content-length")).toBeNull();
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("content-disposition")).toBe(
      fileHeaders["content-disposition"]
    );
  });

  it("joins a base address with a trailing slash without a double slash", async () => {
    fetchMock.mockResolvedValue(fileResponse());
    await download({ apiBaseUrl: `${API}/` });
    expect(lastInit().url).toBe(`${API}${DOWNLOAD_PATH}`);
  });

  it("turns tedrisat's 401 into the reauth answer", async () => {
    fetchMock.mockResolvedValue(
      Response.json(tedrisatError(401, "HTTP_401"), { status: 401 })
    );

    const response = await download();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      kind: "unauthenticated",
      reauth: true,
    });
  });

  it("passes 403, 404 and 503 on as tedrisat's JSON, with no file headers", async () => {
    for (const [status, code] of [
      [403, "HTTP_403"],
      [404, "RESOURCE_FILE_NOT_FOUND"],
      [503, "STORAGE_UNAVAILABLE"],
    ] as const) {
      fetchMock.mockResolvedValueOnce(
        Response.json(tedrisatError(status, code), {
          status,
          headers: { "content-disposition": "attachment", "retry-after": "5" },
        })
      );
      const response = await download();
      expect(response.status).toBe(status);
      expect(response.headers.get("content-type")).toMatch(/json/);
      expect(response.headers.get("content-disposition")).toBeNull();
      expect(response.headers.get("retry-after")).toBe("5");
      expect(await response.json()).toEqual(tedrisatError(status, code));
    }
  });

  it("never serves an HTML error page from in front of tedrisat as markup", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html><script>alert(1)</script></html>", {
        status: 502,
        headers: { "content-type": "text/html" },
      })
    );

    const response = await download();

    expect(response.status).toBe(502);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    const text = await response.text();
    expect(text).not.toContain("<script>");
    expect(JSON.parse(text)).toMatchObject({ code: "HTTP_502" });
  });

  it("answers 401 without reauth, and sends nothing, when there is no token", async () => {
    for (const accessToken of [null, ""]) {
      const response = await download({ accessToken });
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ kind: "unauthenticated" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a path outside the allow-list without calling tedrisat", async () => {
    for (const path of [
      `/courses/${COURSE}/../../me`,
      `/courses/${COURSE}?x=1`,
      "/me/profile",
    ]) {
      const response = await download({ path });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: "INVALID_PATH" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
