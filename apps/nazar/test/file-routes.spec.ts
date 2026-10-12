import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../proxy";

/**
 * The routes under `app/api/files` (MDRS-287, MDRS-290): each checks its ids
 * and hands the request to the one file proxy with the tedrisat path it
 * names, the app's tedrisat address and the caller's token. The proxy itself
 * is `@medaris/services/file-proxy`'s and has its own specs; here it is a
 * spy, and `isUuid` is the real one.
 */
const proxy = vi.hoisted(() => ({
  upload: vi.fn(),
  download: vi.fn(),
  token: vi.fn(),
  signInUrl: vi.fn(),
}));

vi.mock("@medaris/services/file-proxy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@medaris/services/file-proxy")>()),
  proxyUpload: proxy.upload,
  proxyDownload: proxy.download,
}));
vi.mock("~/lib/auth", () => ({
  getAccessToken: proxy.token,
  signInUrl: proxy.signInUrl,
}));

const COURSE = "0b6f3f7e-5a4e-4c1e-9f57-0a6f2b7a1c11";
const LESSON = "5d1c2b3a-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const ITEM = "9f8e7d6c-5b4a-4321-9876-543210fedcba";
const API = "http://127.0.0.1:1";
const MAX = 25 * 1024 * 1024;

const params = <T>(value: T) => ({ params: Promise.resolve(value) });
const post = () =>
  new Request("http://localhost:4002/api/files/x", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=b" },
    body: "--b--",
  });
const get = () => new Request("http://localhost:4002/api/files/x");

beforeEach(() => {
  proxy.upload.mockReset();
  proxy.download.mockReset();
  proxy.token.mockReset();
  proxy.token.mockResolvedValue("access-token");
  proxy.upload.mockResolvedValue(new Response(null, { status: 201 }));
  proxy.download.mockResolvedValue(new Response("bytes", { status: 200 }));
});

describe("POST /api/files/courses/:courseId/resources", () => {
  const route = () =>
    import("~/app/api/files/courses/[courseId]/resources/route");

  it("streams the upload to the course's resource files, with the token and the 25 MB limit", async () => {
    const request = post();
    const { POST } = await route();
    expect((await POST(request, params({ courseId: COURSE }))).status).toBe(
      201
    );
    expect(proxy.upload).toHaveBeenCalledWith(request, {
      apiBaseUrl: API,
      path: `/courses/${COURSE}/resources/files`,
      accessToken: "access-token",
      maxBytes: MAX,
    });
  });

  it("answers 404 for an id that is not a UUID, and sends nothing", async () => {
    const { POST } = await route();
    for (const courseId of ["..", "c-1", `${COURSE}/x`, ""]) {
      const response = await POST(post(), params({ courseId }));
      expect(response.status, courseId).toBe(404);
      expect(await response.json()).toEqual({ code: "NOT_FOUND" });
    }
    expect(proxy.upload).not.toHaveBeenCalled();
  });
});

describe("POST /api/files/lessons/:lessonId/resources", () => {
  const route = () =>
    import("~/app/api/files/lessons/[lessonId]/resources/route");

  it("streams the upload to the celse's resource files", async () => {
    const request = post();
    const { POST } = await route();
    await POST(request, params({ lessonId: LESSON }));
    expect(proxy.upload).toHaveBeenCalledWith(request, {
      apiBaseUrl: API,
      path: `/lessons/${LESSON}/resources/files`,
      accessToken: "access-token",
      maxBytes: MAX,
    });
  });

  it("answers 404 for an id that is not a UUID", async () => {
    const { POST } = await route();
    expect((await POST(post(), params({ lessonId: "l-1" }))).status).toBe(404);
    expect(proxy.upload).not.toHaveBeenCalled();
  });
});

describe("the downloads", () => {
  const cases = [
    {
      name: "a course resource",
      load: () =>
        import(
          "~/app/api/files/courses/[courseId]/resources/[resourceId]/route"
        ),
      ids: { courseId: COURSE, resourceId: ITEM },
      path: `/courses/${COURSE}/resources/${ITEM}/file`,
    },
    {
      name: "a celse resource",
      load: () =>
        import(
          "~/app/api/files/lessons/[lessonId]/resources/[resourceId]/route"
        ),
      ids: { lessonId: LESSON, resourceId: ITEM },
      path: `/lessons/${LESSON}/resources/${ITEM}/file`,
    },
    {
      name: "a file a talebe handed in",
      load: () =>
        import("~/app/api/files/courses/[courseId]/submissions/[fileId]/route"),
      ids: { courseId: COURSE, fileId: ITEM },
      path: `/courses/${COURSE}/submissions/files/${ITEM}`,
    },
  ] as const;

  for (const { name, load, ids, path } of cases) {
    it(`streams ${name} from ${path.replace(/[0-9a-f-]{36}/g, ":id")}`, async () => {
      const request = get();
      const { GET } = (await load()) as {
        GET: (r: Request, p: unknown) => Promise<Response>;
      };
      expect((await GET(request, params(ids))).status).toBe(200);
      // The request and the sign-in address let the proxy answer a link the
      // browser followed as a page with a redirect rather than JSON.
      expect(proxy.download).toHaveBeenCalledWith({
        apiBaseUrl: API,
        path,
        accessToken: "access-token",
        request,
        signInUrl: proxy.signInUrl,
      });
    });

    it(`answers 404 for ${name} whose ids are not both UUIDs`, async () => {
      const { GET } = (await load()) as {
        GET: (r: Request, p: unknown) => Promise<Response>;
      };
      for (const key of Object.keys(ids)) {
        const response = await GET(get(), params({ ...ids, [key]: "../x" }));
        expect(response.status, key).toBe(404);
      }
      expect(proxy.download).not.toHaveBeenCalled();
    });
  }
});

describe("proxy.ts", () => {
  // The engine Next compiles the matcher with, as proxy.spec.ts reads it.
  const { pathToRegexp } = createRequire(import.meta.url)(
    "next/dist/compiled/path-to-regexp"
  ) as { pathToRegexp: (source: string) => RegExp };
  const matches = (pathname: string) =>
    config.matcher.some((source) => pathToRegexp(source).test(pathname));

  it("runs on every file route, so the session is renewed before the upload is sent", () => {
    for (const path of [
      `/api/files/courses/${COURSE}/resources`,
      `/api/files/lessons/${LESSON}/resources`,
      `/api/files/courses/${COURSE}/resources/${ITEM}`,
      `/api/files/lessons/${LESSON}/resources/${ITEM}`,
      `/api/files/courses/${COURSE}/submissions/${ITEM}`,
    ]) {
      expect(matches(path), path).toBe(true);
    }
  });

  it("lets a 25 MB upload through it whole (next.config's proxyClientMaxBodySize)", () => {
    // Read as text: evaluating next.config.js would load the root .env.
    const source = readFileSync(
      join(import.meta.dirname, "..", "next.config.js"),
      "utf8"
    );
    expect(source).toMatch(
      /experimental:\s*\{[^}]*proxyClientMaxBodySize:\s*"26mb"/
    );
  });
});
