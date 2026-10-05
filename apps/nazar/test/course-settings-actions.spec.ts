import { ResponseError } from "@medaris/services/tedrisat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What Ders ayarları's server actions do with the API's answers (MDRS-270):
 * each is one call of tedrisat's course or session endpoints, hands the
 * browser the version it needs or only the API's code, and writes nothing
 * without a session. The API client and the session are stubs.
 */
const api = {
  courses: { updateCourse: vi.fn() },
  lessons: { updateLesson: vi.fn() },
};
let token: string | undefined;

vi.mock("~/lib/auth_options", () => ({ getAccessToken: async () => token }));
vi.mock("@medaris/services/tedrisat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@medaris/services/tedrisat")>()),
  createServerTedrisatAPIs: async () => api,
}));

const refusal = (code: number, body?: unknown) =>
  new ResponseError(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status: code,
      headers: { "Content-Type": "application/json" },
    }),
    `HTTP ${code}`
  );

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  token = "token";
  for (const group of Object.values(api)) {
    for (const fn of Object.values(group)) fn.mockReset();
  }
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errors.mockRestore());

const actions = () => import("~/features/course-settings/actions");

describe("Kaydet", () => {
  it("sends the changed fields alone to PATCH /courses/:id and hands back the course's new version", async () => {
    const { saveCourseSettings } = await actions();
    api.courses.updateCourse.mockResolvedValue({
      id: "c-1",
      title: "Bina ve İzhar Şerhi",
      version: 9,
    });
    expect(
      await saveCourseSettings("c-1", {
        isClosed: true,
        timeZone: "Europe/Berlin",
      })
    ).toEqual({ success: true, data: { version: 9 } });
    expect(api.courses.updateCourse).toHaveBeenCalledExactlyOnceWith({
      id: "c-1",
      updateCourseDto: { isClosed: true, timeZone: "Europe/Berlin" },
    });
  });

  it("hands back the code of a policy's lock (409), never the message", async () => {
    const { saveCourseSettings } = await actions();
    api.courses.updateCourse.mockRejectedValue(
      refusal(409, {
        code: "PLATFORM_POLICY_LOCKED",
        message: "ALWAYS_REQUIRE_APPROVAL closes setting.approval_off",
      })
    );
    expect(
      await saveCourseSettings("c-1", { requiresApproval: false })
    ).toEqual({ success: false, code: "PLATFORM_POLICY_LOCKED" });
    expect(errors).toHaveBeenCalledOnce();
  });
});

describe("Yayımla and Taslağa çek", () => {
  it("send the status alone", async () => {
    const { setCourseStatus } = await actions();
    api.courses.updateCourse.mockResolvedValue({ version: 4 });
    expect(await setCourseStatus("c-1", "DRAFT")).toEqual({
      success: true,
      data: { version: 4 },
    });
    expect(api.courses.updateCourse).toHaveBeenCalledExactlyOnceWith({
      id: "c-1",
      updateCourseDto: { status: "DRAFT" },
    });
  });

  it("hand back the code of a refusal (403)", async () => {
    const { setCourseStatus } = await actions();
    api.courses.updateCourse.mockRejectedValue(
      refusal(403, {
        code: "AUTHZ_FORBIDDEN",
        message: "This change needs the permission course.publish",
      })
    );
    expect(await setCourseStatus("c-1", "PUBLISHED")).toEqual({
      success: false,
      code: "AUTHZ_FORBIDDEN",
    });
  });
});

describe("Örnek ders", () => {
  it("marks one session with the course version and hands back the version the course is now at", async () => {
    const { setSampleLesson } = await actions();
    api.lessons.updateLesson.mockResolvedValue({
      id: "l-1",
      isPreview: true,
      courseVersion: 8,
    });
    expect(
      await setSampleLesson("l-1", { version: 7, isPreview: true })
    ).toEqual({ success: true, data: { courseVersion: 8 } });
    expect(api.lessons.updateLesson).toHaveBeenCalledExactlyOnceWith({
      id: "l-1",
      updateLessonDto: { version: 7, isPreview: true },
    });
  });

  it("hands back the code of a stale page (409)", async () => {
    const { setSampleLesson } = await actions();
    api.lessons.updateLesson.mockRejectedValue(
      refusal(409, { code: "COURSE_VERSION_CONFLICT", message: "6 != 7" })
    );
    expect(
      await setSampleLesson("l-1", { version: 6, isPreview: false })
    ).toEqual({ success: false, code: "COURSE_VERSION_CONFLICT" });
  });
});

it("writes nothing without a session", async () => {
  token = undefined;
  const { saveCourseSettings, setCourseStatus, setSampleLesson } =
    await actions();
  expect(await saveCourseSettings("c-1", { isClosed: true })).toEqual({
    success: false,
    code: "",
  });
  expect(await setCourseStatus("c-1", "DRAFT")).toEqual({
    success: false,
    code: "",
  });
  expect(await setSampleLesson("l-1", { version: 7, isPreview: true })).toEqual(
    { success: false, code: "" }
  );
  expect(api.courses.updateCourse).not.toHaveBeenCalled();
  expect(api.lessons.updateLesson).not.toHaveBeenCalled();
});
