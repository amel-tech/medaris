import type {
  ICourseDetail,
  ILesson,
} from "../../../src/course/course.repository.interface";
import {
  withContent,
  withoutContent,
} from "../../../src/course/domain/course-content";
import { LessonType } from "../../../src/course/domain/lesson-type.enum";

const lesson = (id: string, cancelledAt: Date | null): ILesson => ({
  id,
  weekId: "w1",
  title: id,
  type: LessonType.LIVE,
  durationMinutes: 60,
  kaynak: null,
  scheduledAt: new Date("2026-10-09T18:00:00Z"),
  meetingUrl: "https://meet.google.com/abc-defg-hij",
  agenda: null,
  isPreview: false,
  orderIndex: 0,
  cancelledAt,
  cancelReason: cancelledAt ? "illness" : null,
  replacementLessonId: null,
  inPerson: true,
  inPersonOverride: true,
  hasLiveStream: true,
  resources: [],
  recordingAvailableAt: new Date("2026-10-14T17:00:00Z"),
});

describe("withContent (nizam/56)", () => {
  const course = {
    weeks: [
      {
        id: "w1",
        courseId: "c1",
        weekNumber: 1,
        title: "Hafta 1",
        summary: null,
        orderIndex: 0,
        lessons: [lesson("kept", null), lesson("cancelled", new Date())],
      },
    ],
    resources: [],
  } as unknown as ICourseDetail;

  it("leaves a standing session's link and drops a cancelled one's", () => {
    const [kept, cancelled] = withContent(course).weeks[0].lessons;
    expect(kept.meetingUrl).toBe("https://meet.google.com/abc-defg-hij");
    expect(cancelled.meetingUrl).toBeNull();
    expect(cancelled.cancelReason).toBe("illness");
  });
});

/**
 * MDRS-283: how a session is attended goes where its meeting link goes. A
 * locked caller is told the course's own mark (public) and nothing about a
 * session's, a sample session included.
 */
describe("the attendance fields under the content rule (MDRS-283)", () => {
  const course = {
    inPerson: false,
    weeks: [
      {
        id: "w1",
        courseId: "c1",
        weekNumber: 1,
        title: "Hafta 1",
        summary: null,
        orderIndex: 0,
        lessons: [
          lesson("plain", null),
          { ...lesson("sample", null), isPreview: true },
        ],
      },
    ],
    resources: [],
  } as unknown as ICourseDetail;

  it("keeps them for a content reader", () => {
    const [plain] = withContent(course).weeks[0].lessons;
    expect(plain).toMatchObject({
      inPerson: true,
      inPersonOverride: true,
      hasLiveStream: true,
    });
  });

  it("removes the keys for everyone else, a sample session included", () => {
    const locked = withoutContent(course);
    expect(locked.inPerson).toBe(false);
    for (const l of locked.weeks[0].lessons) {
      for (const key of ["inPerson", "inPersonOverride", "hasLiveStream"]) {
        expect(l).not.toHaveProperty(key);
      }
    }
  });
});

/**
 * MDRS-286: a session's own resources are read like the course's (MDRS-279):
 * "Adlarını herkes görür; bağlantıları derse kayıtlı talebeler açar." Every
 * name for everyone who may see the session, each link for a content reader
 * only, a sample session's included.
 */
describe("a session's own resources under the content rule (MDRS-286)", () => {
  const resource = (lessonId: string, orderIndex: number) => ({
    id: `${lessonId}-r${orderIndex}`,
    lessonId,
    name: `Kaynak ${orderIndex + 1}`,
    meta: orderIndex === 0 ? "PDF · 12 sayfa" : null,
    url: `https://drive.google.com/file/d/${lessonId}-${orderIndex}/view`,
    orderIndex,
  });
  const course = {
    inPerson: false,
    weeks: [
      {
        id: "w1",
        courseId: "c1",
        weekNumber: 1,
        title: "Hafta 1",
        summary: null,
        orderIndex: 0,
        lessons: [
          {
            ...lesson("plain", null),
            resources: [resource("plain", 0), resource("plain", 1)],
          },
          {
            ...lesson("sample", null),
            isPreview: true,
            resources: [resource("sample", 0)],
          },
        ],
      },
    ],
    resources: [],
  } as unknown as ICourseDetail;

  it("gives a content reader every name and every link, in order", () => {
    const [plain, sample] = withContent(course).weeks[0].lessons;
    expect(plain.resources).toEqual([
      resource("plain", 0),
      resource("plain", 1),
    ]);
    expect(sample.resources).toEqual([resource("sample", 0)]);
  });

  it("gives everyone else the names and lines without a single link, a sample session's included", () => {
    const [plain, sample] = withoutContent(course).weeks[0].lessons;
    expect(plain.resources).toEqual([
      {
        id: "plain-r0",
        lessonId: "plain",
        name: "Kaynak 1",
        meta: "PDF · 12 sayfa",
        orderIndex: 0,
      },
      {
        id: "plain-r1",
        lessonId: "plain",
        name: "Kaynak 2",
        meta: null,
        orderIndex: 1,
      },
    ]);
    expect(sample.resources).toHaveLength(1);
    for (const row of [...plain.resources, ...sample.resources]) {
      expect(row).not.toHaveProperty("url");
    }
    // The sample session keeps the rest of what MDRS-161 opened.
    expect(sample).toHaveProperty("kaynak");
  });
});

/**
 * MDRS-288: when a session's recording opens is course content too. The
 * session editor and the talebe's page read it off the course; a locked
 * caller is told only what a PUBLIC recording carries itself.
 */
describe("the recording release time under the content rule (MDRS-288)", () => {
  const course = {
    inPerson: false,
    weeks: [
      {
        id: "w1",
        courseId: "c1",
        weekNumber: 1,
        title: "Hafta 1",
        summary: null,
        orderIndex: 0,
        lessons: [
          lesson("plain", null),
          { ...lesson("sample", null), isPreview: true },
        ],
      },
    ],
    resources: [],
  } as unknown as ICourseDetail;

  it("keeps it for a content reader", () => {
    const [plain] = withContent(course).weeks[0].lessons;
    expect(plain.recordingAvailableAt).toEqual(
      new Date("2026-10-14T17:00:00Z")
    );
  });

  it("removes the key for everyone else, a sample session included", () => {
    for (const l of withoutContent(course).weeks[0].lessons) {
      expect(l).not.toHaveProperty("recordingAvailableAt");
    }
  });
});

/**
 * The homework a müderris sets on a celse is course content as a whole: a
 * content reader is sent it apart from the resources, and everyone else is
 * not told whether the celse has any, a sample session included.
 */
describe("a session's homework under the content rule", () => {
  const assignment = {
    id: "a1",
    lessonId: "plain",
    description: "Birinci babı çekin.",
    files: [
      {
        id: "f1",
        name: "Yönerge.pdf",
        contentType: "application/pdf",
        sizeBytes: 1200,
        createdAt: new Date("2026-10-12T09:00:00Z"),
        downloadUrl: "/lessons/plain/assignment/files/f1",
      },
    ],
    createdAt: new Date("2026-10-12T09:00:00Z"),
    updatedAt: new Date("2026-10-12T09:00:00Z"),
  };
  const course = {
    inPerson: false,
    weeks: [
      {
        id: "w1",
        courseId: "c1",
        weekNumber: 1,
        title: "Hafta 1",
        summary: null,
        orderIndex: 0,
        lessons: [
          { ...lesson("plain", null), assignment },
          { ...lesson("none", null), assignment: null },
          { ...lesson("sample", null), isPreview: true, assignment },
        ],
      },
    ],
    resources: [],
  } as unknown as ICourseDetail;

  it("keeps it for a content reader, null where the session has none, never among the resources", () => {
    const [plain, none] = withContent(course).weeks[0].lessons;
    expect(plain.assignment).toEqual(assignment);
    expect(plain.resources).toEqual([]);
    expect(none.assignment).toBeNull();
  });

  it("removes the key for everyone else, a sample session included", () => {
    for (const l of withoutContent(course).weeks[0].lessons) {
      expect(l).not.toHaveProperty("assignment");
    }
  });
});
