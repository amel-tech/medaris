import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * tedris's file routes (MDRS-287, MDRS-290): a course's and a celse's
 * resource file downloaded, the talebe's own homework file added and
 * downloaded. Each is `@medaris/services/file-proxy` (its own spec covers
 * the proxy); here, that every route checks its ids, reaches the tedrisat
 * path it names with the caller's token and nothing else, and answers 401
 * without one. A link the browser followed as a page is answered with a
 * redirect instead: to sign-in, or back to the page with `?fileError=`.
 */

const token = vi.hoisted(() => ({
  value: "access-token" as string | undefined,
}));
vi.mock("~/lib/auth", () => ({
  getAccessToken: async () => token.value,
  signInUrl: (returnTo?: string | null) =>
    `/tr/auth/signin?callbackUrl=${encodeURIComponent(returnTo ?? "")}`,
}));

const API = "http://127.0.0.1:1";
const COURSE = "0b7f6c1e-2a4d-4c8e-9f10-3a5b6c7d8e9f";
const LESSON = "11111111-1111-4111-8111-111111111111";
const ID = "5d2e8f40-1c3b-4a6d-8e7f-90a1b2c3d4e5";
const BOUNDARY = "----tedris-file-routes";
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  token.value = "access-token";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const params = <T extends Record<string, string>>(value: T) => ({
  params: Promise.resolve(value),
});

const pdf = () =>
  new Response("%PDF-1.7", {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-length": "8",
      "content-disposition": 'attachment; filename="bina.pdf"',
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
      "set-cookie": "must=not-pass",
    },
  });

const download = {
  "a course resource's file": {
    load: () =>
      import(
        "../app/api/files/courses/[courseId]/resources/[resourceId]/route"
      ),
    ids: { courseId: COURSE, resourceId: ID },
    bad: { courseId: COURSE, resourceId: "../x" },
    path: `/courses/${COURSE}/resources/${ID}/file`,
  },
  "a celse resource's file": {
    load: () =>
      import(
        "../app/api/files/lessons/[lessonId]/resources/[resourceId]/route"
      ),
    ids: { lessonId: LESSON, resourceId: ID },
    bad: { lessonId: "s1", resourceId: ID },
    path: `/lessons/${LESSON}/resources/${ID}/file`,
  },
  "a homework file of the talebe's own": {
    load: () =>
      import(
        "../app/api/files/lessons/[lessonId]/submission/files/[fileId]/route"
      ),
    ids: { lessonId: LESSON, fileId: ID },
    bad: { lessonId: LESSON, fileId: "x" },
    path: `/lessons/${LESSON}/submission/files/${ID}`,
  },
} as const;

describe.each(
  Object.entries(download)
)("the download of %s", (_name, route) => {
  const get = async (
    ids: Record<string, string>,
    headers: Record<string, string> = {}
  ) => {
    const { GET } = (await route.load()) as {
      GET: (r: Request, c: unknown) => Promise<Response>;
    };
    return GET(new Request("http://app/api/files/x", { headers }), params(ids));
  };
  const PAGE = `/tr/courses/${COURSE}/lessons/${LESSON}`;
  /** What a browser sends for a plain link on one of tedris's pages. */
  const asPage = {
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
    referer: `http://app${PAGE}`,
  };

  it("streams the file from tedrisat's route with the caller's token, with tedrisat's headers and no other", async () => {
    fetchMock.mockResolvedValue(pdf());
    const res = await get(route.ids);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API}${route.path}`);
    expect(init?.method).toBe("GET");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer access-token"
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="bina.pdf"'
    );
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await res.text()).toBe("%PDF-1.7");
  });

  it("passes tedrisat's refusal on as its JSON", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { code: "SUBMISSION_FORBIDDEN", status: 403 },
        { status: 403 }
      )
    );
    const res = await get(route.ids);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "SUBMISSION_FORBIDDEN" });
  });

  it("answers 404 for an id that is no UUID, and reaches nothing", async () => {
    const res = await get(route.bad);
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 401 'unauthenticated' without a token, and reaches nothing", async () => {
    token.value = undefined;
    const res = await get(route.ids);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ kind: "unauthenticated" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a link followed without a session to sign-in, back to its page", async () => {
    token.value = undefined;
    const res = await get(route.ids, asPage);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      `/tr/auth/signin?callbackUrl=${encodeURIComponent(PAGE)}`
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("brings a refused link back to its page with ?fileError=", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { code: "STORAGE_UNAVAILABLE", status: 503 },
        { status: 503 }
      )
    );
    const res = await get(route.ids, asPage);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${PAGE}?fileError=unavailable`);
  });
});

describe("the upload of a homework file", () => {
  const body = () =>
    [
      `--${BOUNDARY}`,
      'Content-Disposition: form-data; name="file"; filename="odev.pdf"',
      "Content-Type: application/pdf",
      "",
      "%PDF-1.7",
      `--${BOUNDARY}--`,
      "",
    ].join("\r\n");
  const upload = (
    headers: Record<string, string> = {
      "content-type": `multipart/form-data; boundary=${BOUNDARY}`,
    }
  ) =>
    new Request(`http://app/api/files/lessons/${LESSON}/submission/files`, {
      method: "POST",
      headers,
      body: new Blob([body()]).stream(),
      duplex: "half",
    } as RequestInit);
  const post = async (request: Request, lessonId = LESSON) => {
    const { POST } = await import(
      "../app/api/files/lessons/[lessonId]/submission/files/route"
    );
    return POST(request, params({ lessonId }));
  };

  it("streams the multipart body to the celse's homework with the caller's token, and answers what tedrisat answered", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ id: "s1", files: [] }, { status: 201 })
    );
    const res = await post(upload());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API}/lessons/${LESSON}/submission/files`);
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer access-token");
    expect(headers.get("content-type")).toBe(
      `multipart/form-data; boundary=${BOUNDARY}`
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "s1", files: [] });
  });

  it("passes tedrisat's 409 SUBMISSION_FILE_LIMIT on", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { code: "SUBMISSION_FILE_LIMIT", status: 409 },
        { status: 409 }
      )
    );
    const res = await post(upload());
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "SUBMISSION_FILE_LIMIT" });
  });

  it("refuses a body announcing more than 25 MB with 413 FILE_TOO_LARGE, unsent", async () => {
    const res = await post(
      upload({
        "content-type": `multipart/form-data; boundary=${BOUNDARY}`,
        "content-length": String(26 * 1024 * 1024),
      })
    );
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: "FILE_TOO_LARGE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a body that is not multipart, a lesson id that is no UUID, and a caller with no token", async () => {
    const notMultipart = await post(upload({ "content-type": "text/plain" }));
    expect(notMultipart.status).toBe(415);
    expect(await notMultipart.json()).toMatchObject({
      code: "MULTIPART_REQUIRED",
    });
    expect((await post(upload(), "../x")).status).toBe(404);
    token.value = undefined;
    const signedOut = await post(upload());
    expect(signedOut.status).toBe(401);
    expect(await signedOut.json()).toEqual({ kind: "unauthenticated" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
