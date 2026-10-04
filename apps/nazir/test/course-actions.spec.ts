import { ResponseError } from "@medaris/services/tedrisat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the course scope's server actions do with the API's answers (Celseler
 * and Talebeler): each is one call of tedrisat's endpoints, hands the browser
 * the little it needs or only the API's code, and writes nothing without a
 * session. The API client and the session are stubs.
 */
const api = {
  lessons: {
    updateLesson: vi.fn(),
    cancelLesson: vi.fn(),
    setLessonLiveStream: vi.fn(),
    previewSessionBatch: vi.fn(),
    createSessionBatch: vi.fn(),
  },
  courses: {
    setEnrollmentStatus: vi.fn(),
    removeEnrollment: vi.fn(),
  },
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

const sessions = () => import("~/features/sessions/actions");
const enrolments = () => import("~/features/enrolments/actions");

describe("Bağlantıyı güncelle and Tarihi değiştir", () => {
  it("send the link alone, with the course version, and hand back the version the course is now at", async () => {
    const { changeSession } = await sessions();
    api.lessons.updateLesson.mockResolvedValue({
      id: "l-1",
      title: "Hafta 1",
      courseVersion: 8,
    });
    expect(
      await changeSession("l-1", {
        version: 7,
        meetingUrl: "https://zoom.us/j/1",
      })
    ).toEqual({ success: true, data: { courseVersion: 8 } });
    expect(api.lessons.updateLesson).toHaveBeenCalledWith({
      id: "l-1",
      updateLessonDto: { version: 7, meetingUrl: "https://zoom.us/j/1" },
    });
  });

  it("send the time alone, as a date", async () => {
    const { changeSession } = await sessions();
    api.lessons.updateLesson.mockResolvedValue({ courseVersion: 9 });
    await changeSession("l-1", {
      version: 8,
      scheduledAt: "2026-10-12T18:00:00.000Z",
    });
    expect(api.lessons.updateLesson).toHaveBeenCalledWith({
      id: "l-1",
      updateLessonDto: {
        version: 8,
        scheduledAt: new Date("2026-10-12T18:00:00.000Z"),
      },
    });
  });

  it("hand back the code of a stale save (409), never the message", async () => {
    const { changeSession } = await sessions();
    api.lessons.updateLesson.mockRejectedValue(
      refusal(409, {
        code: "COURSE_VERSION_CONFLICT",
        message: "version 6 != 7",
      })
    );
    expect(
      await changeSession("l-1", {
        version: 6,
        meetingUrl: "https://zoom.us/j/1",
      })
    ).toEqual({ success: false, code: "COURSE_VERSION_CONFLICT" });
    expect(errors).toHaveBeenCalledOnce();
  });
});

describe("İptal et", () => {
  it("cancels the session at the course version and hands back the new one", async () => {
    const { cancelSession } = await sessions();
    api.lessons.cancelLesson.mockResolvedValue({ courseVersion: 5 });
    expect(await cancelSession("l-1", 4)).toEqual({
      success: true,
      data: { courseVersion: 5 },
    });
    expect(api.lessons.cancelLesson).toHaveBeenCalledWith({
      id: "l-1",
      cancelLessonDto: { version: 4 },
    });
  });

  it("hands back the code of a refusal", async () => {
    const { cancelSession } = await sessions();
    api.lessons.cancelLesson.mockRejectedValue(
      refusal(409, { code: "LESSON_ALREADY_CANCELLED", message: "x" })
    );
    expect(await cancelSession("l-1", 4)).toEqual({
      success: false,
      code: "LESSON_ALREADY_CANCELLED",
    });
    api.lessons.cancelLesson.mockRejectedValue(
      refusal(403, { code: "AUTHZ_FORBIDDEN", message: "x" })
    );
    expect(await cancelSession("l-1", 4)).toEqual({
      success: false,
      code: "AUTHZ_FORBIDDEN",
    });
  });
});

describe("Canlı yayın", () => {
  it("sets the link and hands back the one tedrisat stored", async () => {
    const { setLiveStream } = await sessions();
    api.lessons.setLessonLiveStream.mockResolvedValue({
      lessonId: "l-1",
      liveStreamUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    });
    expect(await setLiveStream("l-1", "https://youtu.be/abcdefghijk")).toEqual({
      success: true,
      data: { liveStreamUrl: "https://www.youtube.com/watch?v=abcdefghijk" },
    });
    expect(api.lessons.setLessonLiveStream).toHaveBeenCalledWith({
      id: "l-1",
      setLiveStreamDto: { liveStreamUrl: "https://youtu.be/abcdefghijk" },
    });
  });

  it("clears it with null", async () => {
    const { setLiveStream } = await sessions();
    api.lessons.setLessonLiveStream.mockResolvedValue({
      lessonId: "l-1",
      liveStreamUrl: null,
    });
    expect(await setLiveStream("l-1", null)).toEqual({
      success: true,
      data: { liveStreamUrl: null },
    });
    expect(api.lessons.setLessonLiveStream).toHaveBeenCalledWith({
      id: "l-1",
      setLiveStreamDto: { liveStreamUrl: null },
    });
  });

  it("hands back AUTHZ_FORBIDDEN for whoever does not hold session.live_link", async () => {
    const { setLiveStream } = await sessions();
    api.lessons.setLessonLiveStream.mockRejectedValue(
      refusal(403, { code: "AUTHZ_FORBIDDEN", message: "x" })
    );
    expect(await setLiveStream("l-1", null)).toEqual({
      success: false,
      code: "AUTHZ_FORBIDDEN",
    });
  });
});

describe("Celse planla", () => {
  const pattern = {
    weekdays: [1],
    startTime: "21:00",
    timeZone: "Europe/Istanbul",
    startDate: "2026-10-12",
    count: 2,
  };

  it("previews the sessions of a pattern as text, and writes nothing", async () => {
    const { previewSessions } = await sessions();
    api.lessons.previewSessionBatch.mockResolvedValue({
      timeZone: "Europe/Istanbul",
      sessions: [
        {
          scheduledAt: new Date("2026-10-12T18:00:00Z"),
          localDate: "2026-10-12",
          weekNumber: 1,
        },
      ],
    });
    expect(await previewSessions("c-1", pattern)).toEqual({
      success: true,
      data: {
        sessions: [
          {
            scheduledAt: "2026-10-12T18:00:00.000Z",
            localDate: "2026-10-12",
            weekNumber: 1,
          },
        ],
      },
    });
    expect(api.lessons.previewSessionBatch).toHaveBeenCalledWith({
      courseId: "c-1",
      weeklyPatternDto: pattern,
    });
    expect(api.lessons.createSessionBatch).not.toHaveBeenCalled();
  });

  it("creates the sessions in one call and hands back how many", async () => {
    const { createSessions } = await sessions();
    api.lessons.createSessionBatch.mockResolvedValue({
      courseVersion: 3,
      lessons: [{ id: "a" }, { id: "b" }],
    });
    const batch = {
      ...pattern,
      title: "Haftanın tekrarı",
      durationMinutes: 60,
    };
    expect(await createSessions("c-1", batch)).toEqual({
      success: true,
      data: { count: 2 },
    });
    expect(api.lessons.createSessionBatch).toHaveBeenCalledOnce();
    expect(api.lessons.createSessionBatch).toHaveBeenCalledWith({
      courseId: "c-1",
      createSessionBatchDto: batch,
    });
  });

  it("hands back the code of a pattern the API cannot expand", async () => {
    const { createSessions, previewSessions } = await sessions();
    api.lessons.createSessionBatch.mockRejectedValue(
      refusal(400, { code: "INVALID_SESSION_PATTERN", message: "x" })
    );
    expect(
      await createSessions("c-1", {
        ...pattern,
        title: "x",
        durationMinutes: 60,
      })
    ).toEqual({ success: false, code: "INVALID_SESSION_PATTERN" });
    api.lessons.previewSessionBatch.mockRejectedValue(refusal(500));
    expect(await previewSessions("c-1", pattern)).toEqual({
      success: false,
      code: "",
    });
  });

  it("writes nothing without a session", async () => {
    token = undefined;
    const { createSessions, cancelSession } = await sessions();
    expect(
      await createSessions("c-1", {
        ...pattern,
        title: "x",
        durationMinutes: 60,
      })
    ).toEqual({ success: false, code: "" });
    expect(await cancelSession("l-1", 1)).toEqual({ success: false, code: "" });
    expect(api.lessons.createSessionBatch).not.toHaveBeenCalled();
    expect(api.lessons.cancelLesson).not.toHaveBeenCalled();
  });
});

describe("Tamamladı say and Yeniden aç", () => {
  it("set COMPLETED, a status only the course team may set", async () => {
    const { setCompleted } = await enrolments();
    api.courses.setEnrollmentStatus.mockResolvedValue({});
    expect(await setCompleted("c-1", "u-1", true)).toEqual({
      success: true,
      data: null,
    });
    expect(api.courses.setEnrollmentStatus).toHaveBeenCalledWith({
      id: "c-1",
      userId: "u-1",
      setEnrollmentStatusDto: { status: "COMPLETED" },
    });
  });

  it("set ENROLLED to reopen a completion", async () => {
    const { setCompleted } = await enrolments();
    api.courses.setEnrollmentStatus.mockResolvedValue({});
    await setCompleted("c-1", "u-1", false);
    expect(api.courses.setEnrollmentStatus).toHaveBeenCalledWith({
      id: "c-1",
      userId: "u-1",
      setEnrollmentStatusDto: { status: "ENROLLED" },
    });
  });

  it("hand back the code of a seat that is not as the page showed it", async () => {
    const { setCompleted } = await enrolments();
    api.courses.setEnrollmentStatus.mockRejectedValue(
      refusal(409, { code: "ENROLLMENT_STATE_CONFLICT", message: "x" })
    );
    expect(await setCompleted("c-1", "u-1", true)).toEqual({
      success: false,
      code: "ENROLLMENT_STATE_CONFLICT",
    });
  });
});

describe("Dersten çıkar", () => {
  it("sends the reason the API requires", async () => {
    const { removeStudent } = await enrolments();
    api.courses.removeEnrollment.mockResolvedValue(true);
    expect(await removeStudent("c-1", "u-1", "Üç haftadır yok.")).toEqual({
      success: true,
      data: null,
    });
    expect(api.courses.removeEnrollment).toHaveBeenCalledWith({
      id: "c-1",
      userId: "u-1",
      removeEnrollmentDto: { reason: "Üç haftadır yok." },
    });
  });

  it("hands back the code of a refusal, never its message", async () => {
    const { removeStudent } = await enrolments();
    api.courses.removeEnrollment.mockRejectedValue(
      refusal(403, {
        code: "AUTHZ_FORBIDDEN",
        message: "needs enrollment.remove",
      })
    );
    expect(await removeStudent("c-1", "u-1", "x")).toEqual({
      success: false,
      code: "AUTHZ_FORBIDDEN",
    });
    api.courses.removeEnrollment.mockRejectedValue(
      refusal(400, {
        code: "VALIDATION_ERROR",
        message: "reason must not be blank",
      })
    );
    expect(await removeStudent("c-1", "u-1", " ")).toEqual({
      success: false,
      code: "VALIDATION_ERROR",
    });
  });

  it("writes nothing without a session", async () => {
    token = undefined;
    const { removeStudent, setCompleted } = await enrolments();
    expect(await removeStudent("c-1", "u-1", "x")).toEqual({
      success: false,
      code: "",
    });
    expect(await setCompleted("c-1", "u-1", true)).toEqual({
      success: false,
      code: "",
    });
    expect(api.courses.removeEnrollment).not.toHaveBeenCalled();
    expect(api.courses.setEnrollmentStatus).not.toHaveBeenCalled();
  });
});
