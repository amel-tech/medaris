import type { CourseDetailResponse } from "@medaris/services/tedrisat";
import { describe, expect, it } from "vitest";
import { curriculumPayload } from "~/features/courses/payload";
import {
  lessonResourceDraftsOf,
  resourceDraftsOf,
  versionAfterUpload,
  weekDraftsOf,
  withUploadedCourseResource,
  withUploadedLessonDraft,
  withUploadedLessonResource,
} from "~/features/courses/present";
import {
  courseResourceFilePath,
  courseResourceUploadPath,
  fileKind,
  fileProblem,
  formatFileSize,
  lessonResourceFilePath,
  lessonResourceUploadPath,
  MAX_RESOURCE_FILE_BYTES,
  uploadErrorKey,
} from "~/features/courses/resource-files";

// MDRS-287: the pure half of the curriculum's resource files. A file row goes
// back to tedrisat by its id alone (an address on it is RESOURCE_IS_FILE),
// an upload's row and version join what the page holds as saved, and the
// app's routes, chips, sizes and refusals are worded here.

const pdf = {
  name: "emsile.pdf",
  contentType: "application/pdf",
  sizeBytes: 1_468_006,
  downloadUrl: "/courses/c1/resources/f1/file",
};

const course = {
  id: "c1",
  title: "Emsile",
  description: null,
  coverHue: 20,
  version: 3,
  timeZone: "Europe/Istanbul",
  contentLocked: false,
  muderris: [],
  resources: [
    {
      id: "r1",
      courseId: "c1",
      name: "Bina",
      meta: "PDF · 124 sayfa",
      type: "pdf",
      url: "https://files.medaris.org/bina.pdf",
      file: null,
      orderIndex: 0,
    },
    {
      id: "f1",
      courseId: "c1",
      name: "Emsile metni",
      type: null,
      file: pdf,
      orderIndex: 1,
    },
  ],
  weeks: [
    {
      id: "w1",
      weekNumber: 1,
      title: "Mehmûz",
      lessons: [
        {
          id: "l1",
          weekId: "w1",
          title: "Birinci",
          type: "LIVE",
          durationMinutes: 60,
          scheduledAt: "2026-10-14T18:00:00.000Z",
          meetingUrl: "https://zoom.us/j/1",
          kaynak: "Bina",
          agenda: [],
          isPreview: false,
          orderIndex: 0,
          cancelledAt: null,
          replacementLessonId: null,
          inPersonOverride: null,
          hasLiveStream: false,
          resources: [
            {
              id: "lr1",
              lessonId: "l1",
              name: "Şerh",
              meta: null,
              url: "https://drive.google.com/file/d/1/view",
              file: null,
              orderIndex: 0,
            },
            {
              id: "lf1",
              lessonId: "l1",
              name: "Tatbikat",
              meta: "2 sayfa",
              url: null,
              file: { ...pdf, name: "tatbikat.pdf" },
              orderIndex: 1,
            },
          ],
        },
      ],
    },
  ],
} as unknown as CourseDetailResponse;

const edit = (over: Partial<Parameters<typeof curriculumPayload>[1]> = {}) => ({
  title: course.title,
  description: "",
  tone: "laciverd" as const,
  weeks: weekDraftsOf(course),
  resources: resourceDraftsOf(course),
  ...over,
});

describe("file rows as read", () => {
  it("carry their file and ask for no address", () => {
    const [link, file] = resourceDraftsOf(course);
    expect(link).toMatchObject({ urlRequired: true, file: null });
    expect(file).toEqual({
      id: "f1",
      name: "Emsile metni",
      meta: "",
      url: "",
      type: null,
      urlRequired: false,
      file: {
        name: "emsile.pdf",
        contentType: "application/pdf",
        sizeBytes: 1_468_006,
      },
    });
    const lesson = course.weeks[0]?.lessons[0];
    const [, lessonFile] = lessonResourceDraftsOf(lesson as never);
    expect(lessonFile).toMatchObject({
      id: "lf1",
      url: "",
      urlRequired: false,
      file: { name: "tatbikat.pdf" },
    });
  });
});

describe("file rows as sent", () => {
  it("sends a course's file by its id, renamed, without an address", () => {
    const resources = resourceDraftsOf(course).map((r) =>
      r.id === "f1" ? { ...r, name: "Emsile (metin)", meta: "PDF" } : r
    );
    expect(curriculumPayload(course, edit({ resources })).resources).toEqual([
      {
        id: "r1",
        name: "Bina",
        meta: "PDF · 124 sayfa",
        type: "pdf",
        url: "https://files.medaris.org/bina.pdf",
      },
      { id: "f1", name: "Emsile (metin)", meta: "PDF", type: undefined },
    ]);
  });

  it("leaves a removed file out, which removes it", () => {
    const resources = resourceDraftsOf(course).filter((r) => r.id !== "f1");
    expect(
      curriculumPayload(course, edit({ resources })).resources?.map((r) => r.id)
    ).toEqual(["r1"]);
  });

  it("sends a session's reordered list with the file by its id and no address", () => {
    const weeks = weekDraftsOf(course).map((w) => ({
      ...w,
      lessons: w.lessons.map((l) => ({
        ...l,
        resources: [...l.resources].reverse(),
      })),
    }));
    const lesson = curriculumPayload(course, edit({ weeks })).weeks?.[0]
      ?.lessons?.[0];
    expect(lesson?.resources).toEqual([
      { id: "lf1", name: "Tatbikat", meta: "2 sayfa" },
      {
        id: "lr1",
        name: "Şerh",
        meta: null,
        url: "https://drive.google.com/file/d/1/view",
      },
    ]);
  });
});

describe("an upload's answer", () => {
  const uploaded = {
    id: "f2",
    courseId: "c1",
    name: "Bina şerhi",
    type: null,
    file: { ...pdf, name: "bina-serhi.pdf" },
    orderIndex: 2,
  };
  const lessonUploaded = {
    id: "lf2",
    lessonId: "l1",
    name: "Ödev kâğıdı",
    meta: null,
    url: null,
    file: { ...pdf, name: "odev.pdf" },
    orderIndex: 2,
  };

  it("takes the next version, and only the next one", () => {
    expect(versionAfterUpload(3, 4)).toBe(4);
    // someone else saved in between: the page keeps its version, so its save
    // is refused as out of date instead of overwriting their change
    expect(versionAfterUpload(3, 5)).toBe(3);
    expect(versionAfterUpload(3, 3)).toBe(3);
  });

  it("adds the course's new row last to what the page holds as saved", () => {
    const next = withUploadedCourseResource(course, uploaded as never, 4);
    expect(next.version).toBe(4);
    expect(next.resources.map((r) => r.id)).toEqual(["r1", "f1", "f2"]);
    // what the page read is left as it was
    expect(course.resources).toHaveLength(2);
  });

  it("adds a session's new row to that session alone, in what is saved and in the form", () => {
    const next = withUploadedLessonResource(
      course,
      "l1",
      lessonUploaded as never,
      4
    );
    expect(next.version).toBe(4);
    expect(next.weeks[0]?.lessons[0]?.resources?.map((r) => r.id)).toEqual([
      "lr1",
      "lf1",
      "lf2",
    ]);
    const edited = weekDraftsOf(course).map((w) => ({
      ...w,
      lessons: w.lessons.map((l) => ({ ...l, title: "Değişti" })),
    }));
    const form = withUploadedLessonDraft(edited, "l1", lessonUploaded as never);
    const lesson = form[0]?.lessons[0];
    expect(lesson?.title).toBe("Değişti");
    expect(lesson?.resources.at(-1)).toMatchObject({
      id: "lf2",
      url: "",
      file: { name: "odev.pdf" },
    });
    // the form then matches the saved read, so no list is sent for it
    const saved = weekDraftsOf(next)[0]?.lessons[0]?.resources;
    expect(lesson?.resources).toEqual(saved);
  });
});

describe("routes, chips, sizes and refusals", () => {
  it("builds the app's own routes, never tedrisat's", () => {
    expect(courseResourceUploadPath("c1")).toBe(
      "/api/files/courses/c1/resources"
    );
    expect(courseResourceFilePath("c1", "f1")).toBe(
      "/api/files/courses/c1/resources/f1"
    );
    expect(lessonResourceUploadPath("l1")).toBe(
      "/api/files/lessons/l1/resources"
    );
    expect(lessonResourceFilePath("l1", "lf1")).toBe(
      "/api/files/lessons/l1/resources/lf1"
    );
  });

  it("names a file's type from the type read from its bytes, else its extension", () => {
    expect(fileKind("application/pdf", "x")).toBe("PDF");
    expect(fileKind("text/plain; charset=utf-8", "notlar")).toBe("TXT");
    expect(
      fileKind(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "sunum"
      )
    ).toBe("PPTX");
    expect(fileKind("application/octet-stream", "tablo.ods")).toBe("ODS");
    expect(fileKind("application/octet-stream", "adsiz")).toBeNull();
  });

  it("prints a size in 1024s, so a file at the limit reads 25 MB", () => {
    const tr = (n: number) => formatFileSize(n, "tr").replace(/\s/g, " ");
    expect(tr(MAX_RESOURCE_FILE_BYTES)).toBe("25 MB");
    expect(tr(1_468_006)).toBe("1,4 MB");
    expect(tr(2048)).toBe("2 kB");
  });

  it("refuses no file, an empty one and one past 25 MB before sending", () => {
    expect(fileProblem(null)).toBe("required");
    expect(fileProblem({ size: 0 })).toBe("empty");
    expect(fileProblem({ size: MAX_RESOURCE_FILE_BYTES + 1 })).toBe("tooLarge");
    expect(fileProblem({ size: MAX_RESOURCE_FILE_BYTES })).toBeNull();
  });

  it("words tedrisat's refusals by code, else by status", () => {
    expect(uploadErrorKey(413, { code: "FILE_TOO_LARGE" })).toBe("tooLarge");
    expect(uploadErrorKey(415, { code: "FILE_TYPE_NOT_ALLOWED" })).toBe(
      "typeNotAllowed"
    );
    expect(uploadErrorKey(400, { code: "FILE_REQUIRED" })).toBe("empty");
    expect(uploadErrorKey(503, { code: "STORAGE_NOT_CONFIGURED" })).toBe(
      "storageNotConfigured"
    );
    expect(uploadErrorKey(503, { code: "STORAGE_UNAVAILABLE" })).toBe(
      "storageUnavailable"
    );
    expect(uploadErrorKey(404, { code: "LESSON_NOT_FOUND" })).toBe("gone");
    expect(uploadErrorKey(403, { code: "AUTHZ_FORBIDDEN" })).toBe("forbidden");
    // a reverse proxy's 413 page carries no code
    expect(uploadErrorKey(413, null)).toBe("tooLarge");
    expect(uploadErrorKey(502, { code: "TEDRISAT_UNREACHABLE" })).toBe(
      "unreachable"
    );
    expect(uploadErrorKey(500, { code: "INTERNAL_ERROR" })).toBe("generic");
  });
});
