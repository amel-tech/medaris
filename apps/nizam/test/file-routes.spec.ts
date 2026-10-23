import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The curriculum's file routes (MDRS-287): `app/api/files/…` hands each
 * request to `@medaris/services/file-proxy` with the session's token and the
 * one tedrisat path it may reach. tedrisat is a stand-in on `fetch`; the
 * session is `getAccessToken` replaced. What the proxy itself does with a
 * body is its own package's spec; here: the path, the token, the ids checked
 * before anything is sent, and tedrisat's answer passed back; to a link the
 * browser followed as a page, a redirect to sign-in or back to the page.
 */

const token = vi.hoisted(() => ({ value: "access-token" as string | null }));
vi.mock("~/lib/auth", () => ({
  getAccessToken: async () => token.value,
  signInUrl: (returnTo?: string | null) =>
    `/auth/signin?callbackUrl=${encodeURIComponent(returnTo ?? "")}`,
}));

const courseUpload = await import(
  "../app/api/files/courses/[courseId]/resources/route"
);
const courseDownload = await import(
  "../app/api/files/courses/[courseId]/resources/[resourceId]/route"
);
const lessonUpload = await import(
  "../app/api/files/lessons/[lessonId]/resources/route"
);
const lessonDownload = await import(
  "../app/api/files/lessons/[lessonId]/resources/[resourceId]/route"
);

const API = process.env.TEDRISAT_API_BASE_URL as string;
const COURSE = "0b7f6c1e-2a4d-4c8e-9f10-3a5b6c7d8e9f";
const LESSON = "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const RESOURCE = "5d2e8f40-1c3b-4a6d-8e7f-90a1b2c3d4e5";
const BOUNDARY = "----nizam-file-route-spec";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  token.value = "access-token";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const upload = (path: string) =>
  new Request(`http://localhost:4001${path}`, {
    method: "POST",
    headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
    body: [
      `--${BOUNDARY}`,
      'Content-Disposition: form-data; name="file"; filename="emsile.pdf"',
      "Content-Type: application/pdf",
      "",
      "%PDF-1.7 spec",
      `--${BOUNDARY}--`,
      "",
    ].join("\r\n"),
  });
const download = (path: string, headers: Record<string, string> = {}) =>
  new Request(`http://localhost:4001${path}`, { headers });
const params = <T>(value: T) => ({ params: Promise.resolve(value) });
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const sent = () => {
  const [url, init] = fetchMock.mock.calls[0] ?? [];
  return { url: String(url), init: init as RequestInit };
};
const header = (init: RequestInit, name: string) =>
  new Headers(init.headers).get(name);

describe("upload routes", () => {
  it("sends a course's file to tedrisat's course upload with the session's token, and passes its answer back", async () => {
    const answer = {
      resource: { id: RESOURCE, courseId: COURSE, name: "Emsile" },
      courseVersion: 4,
    };
    fetchMock.mockResolvedValue(json(answer, 201));
    const response = await courseUpload.POST(
      upload(`/api/files/courses/${COURSE}/resources`),
      params({ courseId: COURSE })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init } = sent();
    expect(url).toBe(`${API}/courses/${COURSE}/resources/files`);
    expect(init.method).toBe("POST");
    expect(header(init, "authorization")).toBe("Bearer access-token");
    expect(header(init, "content-type")).toBe(
      `multipart/form-data; boundary=${BOUNDARY}`
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(answer);
  });

  it("sends a session's file to tedrisat's session upload", async () => {
    fetchMock.mockResolvedValue(json({ resource: {}, courseVersion: 2 }, 201));
    const response = await lessonUpload.POST(
      upload(`/api/files/lessons/${LESSON}/resources`),
      params({ lessonId: LESSON })
    );
    expect(sent().url).toBe(`${API}/lessons/${LESSON}/resources/files`);
    expect(response.status).toBe(201);
  });

  it("passes tedrisat's refusal on with its code (413 FILE_TOO_LARGE, 415 FILE_TYPE_NOT_ALLOWED)", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ code: "FILE_TOO_LARGE", status: 413 }, 413)
    );
    const tooLarge = await courseUpload.POST(
      upload(`/api/files/courses/${COURSE}/resources`),
      params({ courseId: COURSE })
    );
    expect(tooLarge.status).toBe(413);
    expect(await tooLarge.json()).toMatchObject({ code: "FILE_TOO_LARGE" });

    fetchMock.mockResolvedValueOnce(
      json({ code: "FILE_TYPE_NOT_ALLOWED", status: 415 }, 415)
    );
    const wrongType = await lessonUpload.POST(
      upload(`/api/files/lessons/${LESSON}/resources`),
      params({ lessonId: LESSON })
    );
    expect(wrongType.status).toBe(415);
    expect(await wrongType.json()).toMatchObject({
      code: "FILE_TYPE_NOT_ALLOWED",
    });
  });

  it("answers 404 for an id that is not one, before anything is sent", async () => {
    const course = await courseUpload.POST(
      upload("/api/files/courses/abc/resources"),
      params({ courseId: "../nizam" })
    );
    const lesson = await lessonUpload.POST(
      upload("/api/files/lessons/abc/resources"),
      params({ lessonId: "abc" })
    );
    expect(course.status).toBe(404);
    expect(lesson.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 401 'unauthenticated' without a session, and sends nothing", async () => {
    token.value = null;
    const response = await courseUpload.POST(
      upload(`/api/files/courses/${COURSE}/resources`),
      params({ courseId: COURSE })
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ kind: "unauthenticated" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 401 'unauthenticated' with reauth when tedrisat refuses the token", async () => {
    fetchMock.mockResolvedValue(json({ code: "UNAUTHORIZED" }, 401));
    const response = await lessonUpload.POST(
      upload(`/api/files/lessons/${LESSON}/resources`),
      params({ lessonId: LESSON })
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      kind: "unauthenticated",
      reauth: true,
    });
  });
});

describe("download routes", () => {
  const file = () =>
    new Response("%PDF-1.7 spec", {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": 'attachment; filename="emsile.pdf"',
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
        "set-cookie": "storage=1",
      },
    });

  it("streams a course's file from tedrisat as an attachment, with tedrisat's headers and no other", async () => {
    fetchMock.mockResolvedValue(file());
    const response = await courseDownload.GET(
      download(`/api/files/courses/${COURSE}/resources/${RESOURCE}`),
      params({ courseId: COURSE, resourceId: RESOURCE })
    );
    const { url, init } = sent();
    expect(url).toBe(`${API}/courses/${COURSE}/resources/${RESOURCE}/file`);
    expect(init.method).toBe("GET");
    expect(header(init, "authorization")).toBe("Bearer access-token");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="emsile.pdf"'
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.text()).toBe("%PDF-1.7 spec");
  });

  it("streams a session's file from tedrisat's session route", async () => {
    fetchMock.mockResolvedValue(file());
    const response = await lessonDownload.GET(
      download(`/api/files/lessons/${LESSON}/resources/${RESOURCE}`),
      params({ lessonId: LESSON, resourceId: RESOURCE })
    );
    expect(sent().url).toBe(
      `${API}/lessons/${LESSON}/resources/${RESOURCE}/file`
    );
    expect(response.status).toBe(200);
  });

  it("passes a refusal on as tedrisat's JSON (404 RESOURCE_FILE_NOT_FOUND)", async () => {
    fetchMock.mockResolvedValue(
      json({ code: "RESOURCE_FILE_NOT_FOUND", status: 404 }, 404)
    );
    const response = await courseDownload.GET(
      download(`/api/files/courses/${COURSE}/resources/${RESOURCE}`),
      params({ courseId: COURSE, resourceId: RESOURCE })
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      code: "RESOURCE_FILE_NOT_FOUND",
    });
  });

  it("answers 404 for a resource id that is not one, and 401 without a session", async () => {
    const bad = await lessonDownload.GET(
      download(`/api/files/lessons/${LESSON}/resources/x`),
      params({ lessonId: LESSON, resourceId: "x" })
    );
    expect(bad.status).toBe(404);
    token.value = null;
    const signedOut = await courseDownload.GET(
      download(`/api/files/courses/${COURSE}/resources/${RESOURCE}`),
      params({ courseId: COURSE, resourceId: RESOURCE })
    );
    expect(signedOut.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("a link the browser followed as a page", () => {
    const PAGE = `/kosks/k1/courses/${COURSE}/curriculum`;
    const asPage = {
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "same-origin",
      referer: `http://localhost:4001${PAGE}`,
    };

    it("goes to sign-in without a session, coming back to the curriculum", async () => {
      token.value = null;
      const response = await courseDownload.GET(
        download(`/api/files/courses/${COURSE}/resources/${RESOURCE}`, asPage),
        params({ courseId: COURSE, resourceId: RESOURCE })
      );
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        `/auth/signin?callbackUrl=${encodeURIComponent(PAGE)}`
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("comes back to the curriculum with ?fileError= when tedrisat refuses", async () => {
      fetchMock.mockResolvedValue(
        json({ code: "RESOURCE_FILE_NOT_FOUND", status: 404 }, 404)
      );
      const response = await lessonDownload.GET(
        download(`/api/files/lessons/${LESSON}/resources/${RESOURCE}`, asPage),
        params({ lessonId: LESSON, resourceId: RESOURCE })
      );
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        `${PAGE}?fileError=notFound`
      );
    });
  });
});
