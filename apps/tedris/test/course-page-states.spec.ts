import { resources } from "@medaris/i18n";
import type {
  CourseDetailResponse,
  RecordingResponse,
} from "@medaris/services/tedrisat";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", async () => {
  const { resources } = await import("@medaris/i18n");
  return {
    useLocale: () => "tr",
    useTranslations: (namespace: string) => {
      const read = (key: string) =>
        [...namespace.split("."), ...key.split(".")].reduce<unknown>(
          (node, part) => (node as Record<string, unknown>)?.[part],
          resources.tr
        ) as string;
      return Object.assign(
        (key: string, values?: Record<string, string | number>) =>
          read(key).replace(/\{(\w+)\}/g, (_, name) =>
            String(values?.[name] ?? "")
          ),
        { raw: read, rich: (key: string) => read(key) }
      );
    },
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock("~/features/courses/actions", () => ({
  enrollInCourse: vi.fn(),
  leaveCourse: vi.fn(),
  withdrawEnrollment: vi.fn(),
  updateCourseProgress: vi.fn(),
}));

// 3 Ekim 2026 Cumartesi 12:00 İstanbul.
const NOW = Date.parse("2026-10-03T09:00:00Z");
const MEETING = "https://zoom.us/j/1";
const tr = resources.tr.tedris.CoursePage;

type Status = "PENDING" | "ENROLLED" | "COMPLETED" | "REVOKED" | null;

const lesson = (
  id: string,
  at: string,
  extra: Record<string, unknown> = {}
) => ({
  id,
  weekId: "w",
  title: id,
  type: "LIVE",
  scheduledAt: new Date(at),
  durationMinutes: 60,
  isPreview: false,
  orderIndex: 0,
  cancelledAt: null,
  replacementLessonId: null,
  ...extra,
});

const course = (status: Status, contentLocked: boolean) =>
  ({
    id: "c1000000-0000-4000-8000-000000000001",
    koskId: "c1000000-0000-4000-8000-000000000002",
    title: "Bina ve İzhar Şerhi",
    subtitle: null,
    description: "Bina, sarf metnidir.",
    category: null,
    level: "BEGINNER",
    language: null,
    coverHue: 145,
    status: "PUBLISHED",
    requiresApproval: true,
    grantsCertificate: false,
    timeZone: "Europe/Istanbul",
    madrasah: { id: "m1", name: "Süleymaniye Medresesi" },
    weeks: [
      {
        id: "w1",
        weekNumber: 1,
        title: "Giriş",
        summary: null,
        lessons: [
          lesson("sample", "2026-09-26T18:00:00Z", {
            isPreview: true,
            kaynak: "Binâü’l-ef’âl, s. 1–6",
            agenda: [{ time: "21:00", title: "Tanışma ve dersin işleyişi" }],
          }),
        ],
      },
      {
        id: "w2",
        weekNumber: 2,
        title: "Mastar",
        summary: null,
        lessons: [
          lesson("next", "2026-10-04T18:00:00Z", {
            ...(contentLocked ? {} : { meetingUrl: null }),
          }),
          lesson("iptal", "2026-10-05T18:00:00Z", {
            cancelledAt: new Date("2026-10-01T10:00:00Z"),
          }),
        ],
      },
      {
        id: "w3",
        weekNumber: 3,
        title: "Sahih",
        summary: null,
        lessons: [lesson("later", "2026-10-11T18:00:00Z")],
      },
    ],
    muderris: [
      {
        id: "m",
        name: "Abdülhamit Karaosmanoğlu",
        title: "İmam",
        bio: null,
        avatarHue: 200,
      },
    ],
    resources: [],
    enrollment:
      status === null
        ? null
        : {
            status,
            progress: 40,
            createdAt: new Date("2026-10-03T07:02:00Z"),
          },
    contentLocked,
  }) as unknown as CourseDetailResponse;

const render = async (
  status: Status,
  props: {
    signedIn?: boolean;
    approvalRequired?: boolean;
    recordings?: RecordingResponse[];
    initialTab?: string;
    /** the course's resources, as the API sent them to this caller */
    resources?: Record<string, unknown>[];
    /** a lesson's kind changed from LIVE, by its id */
    retyped?: Record<string, string>;
  } = {}
) => {
  const { CoursePage } = await import(
    "~/features/courses/components/course-page"
  );
  const seat = status === "ENROLLED" || status === "COMPLETED";
  const { resources: links, retyped, ...rest } = props;
  const base = course(status, !seat);
  return renderToStaticMarkup(
    createElement(CoursePage, {
      course: {
        ...base,
        ...(links ? { resources: links } : {}),
        ...(retyped
          ? {
              weeks: base.weeks.map((week) => ({
                ...week,
                lessons: week.lessons.map((lesson) => ({
                  ...lesson,
                  type: retyped[lesson.id] ?? lesson.type,
                })),
              })),
            }
          : {}),
      } as CourseDetailResponse,
      koskName: "Nûruosmaniye Köşkü",
      signedIn: true,
      now: NOW,
      ...rest,
    })
  );
};

describe("tedris/05: a visitor", () => {
  it("is asked to sign in or register, and sees every week but the sample session's locked", async () => {
    const html = await render(null, { signedIn: false });
    expect(html).toContain(tr.signInToApply);
    expect(html).toContain("Hesabın yok mu?");
    expect(html.match(/, kilitli/g)).toHaveLength(2);
    expect(html).not.toContain(tr.apply);
  });

  it("reads the sample session's agenda and source, and nothing of the meeting", async () => {
    const html = await render(null, { signedIn: false });
    expect(html).toContain('id="ornek-celse"');
    expect(html).toContain("Tanışma ve dersin işleyişi");
    expect(html).toContain("Binâü’l-ef’âl, s. 1–6");
    expect(html).not.toContain(MEETING);
  });

  it("names the next session with its day, behind the lock notice", async () => {
    const html = await render(null, { signedIn: false });
    expect(html).toContain(">Yarın<");
    expect(html).toContain(tr.lockedNotice);
  });

  it("says the times are in the course's zone", async () => {
    expect(await render(null, { signedIn: false })).toContain(
      "saatler İstanbul saatiyle"
    );
  });
});

describe("tedris/06: signed in, no seat", () => {
  it("offers to apply when approval is required, and to enroll when it is not", async () => {
    const asked = await render(null, { approvalRequired: true });
    expect(asked).toContain(`>${tr.apply}</button>`);
    expect(asked).toContain(tr.applyNote);
    const open = await render(null, { approvalRequired: false });
    expect(open).toContain(`>${tr.enroll}</button>`);
    expect(open).not.toContain(tr.applyNote);
  });
});

describe("tedris/08: waiting for approval", () => {
  it("shows the badge, when the application was sent, and the way to withdraw it", async () => {
    const html = await render("PENDING");
    expect(html).toContain(tr.pendingApproval);
    expect(html).toContain("Başvurun bugün 10:02’de ders kadrosuna iletildi");
    expect(html).toContain(tr.withdrawRequest);
    expect(html).not.toContain(`>${tr.apply}</button>`);
    expect(html).not.toContain(MEETING);
  });

  it("withdraws with a full-width secondary button and without the approval line", async () => {
    const html = await render("PENDING");
    expect(html).toMatch(
      /class="mds-btn[^"]*mds-btn--secondary[^"]*mds-btn--full[^"]*"[^>]*id="withdraw-request"|id="withdraw-request"[^>]*class="mds-btn[^"]*mds-btn--secondary/
    );
    expect(html).not.toContain(tr.approvalNotice);
  });
});

describe("tedris/12: an enrolled talebe", () => {
  it("shows the next session, the progress and the way on", async () => {
    const html = await render("ENROLLED");
    expect(html).toContain(tr.statusInProgress);
    expect(html).toContain(tr.meetingNotAdded);
    expect(html).toContain(`>${tr.continue}</a>`);
    expect(html).toContain("%40");
    expect(html).toContain(tr.updateProgress);
    expect(html).toContain(tr.tabDeck);
  });

  it("does not count a cancelled session in its week or in the totals", async () => {
    const html = await render("ENROLLED");
    expect(html).toContain("1 celse · 60 dk");
    expect(html).not.toContain("2 celse · 120 dk");
    expect(html).toContain("3 celse");
  });

  it("marks a cancelled session and says when a week that has not begun opens", async () => {
    const html = await render("ENROLLED");
    expect(html).toContain(tr.cancelledBadge);
    expect(html).toContain("11 Ekim");
    expect(html).not.toContain(tr.signInToApply);
  });

  it("has no way to update progress or leave once the course is completed", async () => {
    const html = await render("COMPLETED");
    expect(html).toContain(tr.statusCompleted);
    expect(html).not.toContain(tr.updateProgress);
    expect(html).not.toContain(tr.leaveCourse);
  });
});

describe("tedris/13: access withdrawn", () => {
  it("says so, offers the way back, and does not offer to apply", async () => {
    const html = await render("REVOKED");
    expect(html).toContain(tr.revokedTitle);
    expect(html).toContain(tr.revokedBody);
    expect(html).toContain(tr.backToMyCourses);
    expect(html).toContain('href="/tr/my-courses"');
    expect(html).not.toContain(`>${tr.apply}</button>`);
    expect(html).not.toContain(tr.tabDeck);
    expect(html).not.toContain(tr.nextSession);
  });

  it("still shows the sample session, as everyone without a seat does", async () => {
    const html = await render("REVOKED");
    expect(html).toContain('id="ornek-celse"');
    expect(html).toContain("Tanışma ve dersin işleyişi");
    expect(html).toContain("Binâü’l-ef’âl, s. 1–6");
    expect(html).not.toContain(MEETING);
  });

  it("keeps the programme, every week but the sample session's locked", async () => {
    const html = await render("REVOKED");
    expect(html.match(/, kilitli/g)).toHaveLength(2);
  });
});

describe("tedris/24: the recordings tab (MDRS-162)", () => {
  const recordings = [
    {
      id: "r1",
      lessonId: "next",
      weekId: "w2",
      weekNumber: 2,
      weekTitle: "Mastar",
      title: "Mastar: celse kaydı",
      recordedAt: new Date("2026-09-26T18:00:00Z"),
      durationMinutes: 58,
      provider: "YOUTUBE",
      url: "https://youtu.be/aaaaaaaaaaa",
      visibility: "PUBLIC",
      status: "READY",
    },
    {
      id: "r2",
      lessonId: "sample",
      weekId: "w1",
      weekNumber: 1,
      weekTitle: "Giriş",
      title: "Giriş: celse kaydı",
      recordedAt: new Date("2026-09-19T18:00:00Z"),
      durationMinutes: 61,
      provider: "DRIVE",
      url: "https://drive.google.com/file/d/abcdef123/view",
      visibility: "ENROLLED",
      status: "READY",
    },
  ] as unknown as RecordingResponse[];

  it("says there are none, with no count on the tab, when nothing is published", async () => {
    const html = await render("ENROLLED", { initialTab: "kayitlar" });
    expect(html).toContain("henüz yayımlanmış ders kaydı yok");
    expect(html).not.toContain("mds-tab__count");
  });

  it("counts the recordings on the tab and lists them when the page opens on it", async () => {
    const html = await render("ENROLLED", {
      recordings,
      initialTab: "kayitlar",
    });
    expect(html).toContain("mds-tab__count");
    expect(html).toContain("Bütün ders kayıtları");
    expect(html).toContain("Mastar: celse kaydı");
    expect(html).toContain("Giriş: celse kaydı");
  });

  it("lists a visitor only what the API sent them", async () => {
    const html = await render(null, {
      signedIn: false,
      recordings: [recordings[0]],
      initialTab: "kayitlar",
    });
    expect(html).toContain("Mastar: celse kaydı");
    expect(html).not.toContain("drive.google.com");
  });

  // MDRS-285: the tab has no player of its own any more, so it keeps the
  // reading column and the sticky card like every other tab (MDRS-280 gave
  // it both columns for its video).
  const STICKY =
    "sticky inset-bs-[calc(var(--layout-topbar)+var(--space-6))] md:col-start-2 md:row-start-1 md:row-span-2";

  it.each([
    "kayitlar",
    "mufredat",
    "muderrisler",
  ])("keeps the %s tab in the reading column, beside the sticky card", async (tab) => {
    const html = await render("ENROLLED", { recordings, initialTab: tab });
    expect(html).not.toContain("md:col-span-2");
    expect(html).toContain(STICKY);
  });

  it("opens a recording's watch page from its row for an enrolled talebe (MDRS-285)", async () => {
    const html = await render("ENROLLED", {
      recordings,
      initialTab: "kayitlar",
    });
    expect(html).toContain(
      'href="/tr/courses/c1000000-0000-4000-8000-000000000001/lessons/next/izle"'
    );
    expect(html).toContain(
      'href="/tr/courses/c1000000-0000-4000-8000-000000000001/lessons/sample/izle"'
    );
    expect(html).not.toContain("<iframe");
  });

  it("opens a visitor's public recording at its host: the watch page would turn them away", async () => {
    const html = await render(null, {
      signedIn: false,
      recordings: [recordings[0]],
      initialTab: "kayitlar",
    });
    expect(html).toContain('href="https://youtu.be/aaaaaaaaaaa"');
    expect(html).not.toContain("/izle");
  });

  it("opens the recording of a cancelled celse on its watch page, which plays it", async () => {
    const html = await render("ENROLLED", {
      recordings: [{ ...recordings[0], lessonId: "iptal" }],
      initialTab: "kayitlar",
    });
    expect(html).toContain(
      'href="/tr/courses/c1000000-0000-4000-8000-000000000001/lessons/iptal/izle"'
    );
  });

  it("opens at its host the recording of a lesson that is no longer a celse: it has no watch page", async () => {
    const html = await render("ENROLLED", {
      recordings,
      initialTab: "kayitlar",
      retyped: { next: "VIDEO" },
    });
    expect(html).toContain('href="https://youtu.be/aaaaaaaaaaa"');
    expect(html).not.toContain("/lessons/next/izle");
    expect(html).toContain(
      'href="/tr/courses/c1000000-0000-4000-8000-000000000001/lessons/sample/izle"'
    );
  });

  it("opens on the curriculum for an unknown tab", async () => {
    const html = await render("ENROLLED", { initialTab: "yok" });
    expect(html).toMatch(/aria-selected="true"[^>]*>[^<]*Müfredat/);
  });
});

describe("the course's resources (MDRS-279)", () => {
  const PDF = "https://files.medaris.org/bina.pdf";
  // MDRS-248: the whole row is the link.
  const LINKED_ROW =
    "flex items-center gap-3 px-3 py-3 rounded-control border border-neutral-subtle text-neutral-default no-underline transition-colors hover:bg-neutral-hover";

  it("lists them beside the course for an enrolled talebe, each opening in a new tab", async () => {
    const html = await render("ENROLLED", {
      resources: [
        {
          id: "r1",
          name: "Bina",
          meta: "PDF · 124 sayfa",
          type: "pdf",
          url: PDF,
        },
      ],
    });
    expect(html).toContain(tr.resourcesTitle);
    expect(html).toContain(
      `<a class="${LINKED_ROW}" href="${PDF}" target="_blank" rel="noopener noreferrer">`
    );
    expect(html).toContain("PDF · 124 sayfa");
    expect(html).not.toContain(tr.resourcesLocked);
  });

  it("names them without a link for a visitor, whom the API sends no address", async () => {
    const html = await render(null, {
      signedIn: false,
      resources: [
        { id: "r1", name: "Bina", meta: "PDF · 124 sayfa", type: "pdf" },
      ],
    });
    expect(html).toContain(tr.resourcesTitle);
    expect(html).toContain(">Bina<");
    expect(html).not.toContain('target="_blank"');
    expect(html).toContain(tr.resourcesLocked);
  });

  it("downloads a file through this app for an enrolled talebe, and names it alone for a visitor (MDRS-287)", async () => {
    const COURSE = "0b7f6c1e-2a4d-4c8e-9f10-3a5b6c7d8e9f";
    const R1 = "5d2e8f40-1c3b-4a6d-8e7f-90a1b2c3d4e5";
    const reader = await render("ENROLLED", {
      resources: [
        {
          id: R1,
          name: "Bina şerhi",
          file: {
            name: "bina.pdf",
            contentType: "application/pdf",
            sizeBytes: 1024 * 1024,
            downloadUrl: `/courses/${COURSE}/resources/${R1}/file`,
          },
        },
      ],
    });
    expect(reader).toContain(
      `<a class="${LINKED_ROW}" href="/api/files/courses/${COURSE}/resources/${R1}">`
    );
    expect(reader).toContain(`>${tr.resourcesDownload}</span>`);
    expect(reader).toContain(">PDF<");
    expect(reader).toContain("1 MB");

    const visitor = await render(null, {
      signedIn: false,
      resources: [{ id: R1, name: "Bina şerhi" }],
    });
    expect(visitor).toContain(">Bina şerhi<");
    expect(visitor).not.toContain("/api/files");
    expect(visitor).toContain(tr.resourcesLocked);
  });

  it("draws nothing for a course without any", async () => {
    expect(await render("ENROLLED")).not.toContain(tr.resourcesTitle);
  });
});

describe("how the course and its next celse are attended (MDRS-283)", () => {
  // As the markup writes them: React escapes the apostrophe of "YouTube'da".
  const schedule = Object.fromEntries(
    Object.entries(resources.tr.tedris.SchedulePage).map(([k, v]) => [
      k,
      v.replaceAll("'", "&#x27;"),
    ])
  ) as typeof resources.tr.tedris.SchedulePage;
  /** The enrolled talebe's page, the course and its next celse changed. */
  const renderWith = async (
    over: Record<string, unknown>,
    next: Record<string, unknown> = {},
    status: Status = "ENROLLED"
  ) => {
    const { CoursePage } = await import(
      "~/features/courses/components/course-page"
    );
    const seat = status === "ENROLLED" || status === "COMPLETED";
    const base = course(status, !seat);
    return renderToStaticMarkup(
      createElement(CoursePage, {
        course: {
          ...base,
          ...over,
          weeks: base.weeks.map((week) => ({
            ...week,
            lessons: week.lessons.map((l) =>
              l.id === "next" ? { ...l, ...next } : l
            ),
          })),
        } as CourseDetailResponse,
        koskName: "Nûruosmaniye Köşkü",
        signedIn: status !== null,
        now: NOW,
      })
    );
  };

  it("labels an in-person course 'Yüz yüze' for everyone, a visitor included", async () => {
    const badge = `>${tr.inPersonBadge}</span>`;
    expect(await renderWith({ inPerson: true })).toContain(badge);
    expect(await renderWith({ inPerson: true }, {}, null)).toContain(badge);
    expect(await renderWith({ inPerson: false })).not.toContain(badge);
    expect(await renderWith({})).not.toContain(badge);
  });

  it("says the next celse is held in person or streamed, not that its link is missing", async () => {
    const inPerson = await renderWith({}, { inPerson: true });
    expect(inPerson).toContain(schedule.inPerson);
    expect(inPerson).not.toContain(tr.meetingNotAdded);
    const stream = await renderWith({}, { hasLiveStream: true });
    expect(stream).toContain(schedule.stream);
    expect(stream).not.toContain(tr.meetingNotAdded);
    const both = await renderWith({}, { inPerson: true, hasLiveStream: true });
    expect(both).toContain(schedule.inPersonStream);
  });

  it("still says the link is missing when the next celse has none of the three", async () => {
    const none = await renderWith(
      {},
      { inPerson: false, hasLiveStream: false }
    );
    expect(none).toContain(tr.meetingNotAdded);
    expect(none).not.toContain(schedule.inPerson);
    expect(none).not.toContain(schedule.stream);
  });
});

describe("the new keys", () => {
  it("exist in every locale", () => {
    for (const locale of ["tr", "en", "ar"] as const) {
      const page = resources[locale].tedris.CoursePage as Record<
        string,
        string
      >;
      for (const key of Object.keys(tr)) {
        expect(page[key], `${locale}.${key}`).toBeTruthy();
      }
    }
  });
});

describe("the müderris line (2026-10-13)", () => {
  const person = (
    id: string,
    name: string,
    isImam: boolean,
    unvan: string | null = null
  ) => ({
    id,
    name,
    title: null,
    bio: null,
    avatarHue: 200,
    isImam,
    unvan,
  });
  const withTeam = async (muderris: ReturnType<typeof person>[]) => {
    const { CoursePage } = await import(
      "~/features/courses/components/course-page"
    );
    return renderToStaticMarkup(
      createElement(CoursePage, {
        course: {
          ...course("ENROLLED", false),
          muderris,
        } as unknown as CourseDetailResponse,
        koskName: "Nûruosmaniye Köşkü",
        signedIn: true,
        now: NOW,
      })
    );
  };

  it("marks the imam among several müderrisler with the star after the name", async () => {
    const html = await withTeam([
      person("m1", "Abdülhamit Karaosmanoğlu", true),
      person("m2", "Ayşe Nur Kılıçarslan", false),
    ]);
    expect(html).toMatch(
      /Abdülhamit Karaosmanoğlu Hoca<\/bdi> <button[^>]*aria-label="Dersin imamı"/
    );
    expect(html.match(/aria-label="Dersin imamı"/g)).toHaveLength(1);
  });

  it("names a lone müderris, the imam, with no mark", async () => {
    const html = await withTeam([
      person("m1", "Abdülhamit Karaosmanoğlu", true),
    ]);
    expect(html).toContain("Abdülhamit Karaosmanoğlu");
    expect(html).not.toContain("mds-imam-star");
  });
});

describe("the hoca's unvan in this course (owner, 2026-10-15)", () => {
  const person = (
    id: string,
    name: string,
    isImam: boolean,
    unvan: string | null
  ) => ({ id, name, title: null, bio: null, avatarHue: 200, isImam, unvan });
  const withTeam = async (muderris: ReturnType<typeof person>[]) => {
    const { CoursePage } = await import(
      "~/features/courses/components/course-page"
    );
    return renderToStaticMarkup(
      createElement(CoursePage, {
        course: {
          ...course("ENROLLED", false),
          muderris,
        } as unknown as CourseDetailResponse,
        koskName: "Nûruosmaniye Köşkü",
        signedIn: true,
        now: NOW,
      })
    );
  };

  it("puts the unvan before a lone hoca's name, with no word before it", async () => {
    const html = await withTeam([
      person("m1", "Ahmet Mehmet", true, "PROF_DR"),
    ]);
    expect(html).toContain("<bdi>Prof. Dr. Ahmet Mehmet</bdi>");
    expect(html).not.toContain("Müderris Prof. Dr.");
    expect(html).not.toContain("mds-imam-star");
  });

  it("writes Hoca after a lone hoca's name with no unvan", async () => {
    const html = await withTeam([person("m1", "Ahmet Mehmet", true, null)]);
    expect(html).toContain("<bdi>Ahmet Mehmet Hoca</bdi>");
    expect(html).not.toContain("Müderris Ahmet Mehmet");
  });

  it("names several hocas each with their own unvan, the star still after the imam", async () => {
    const html = await withTeam([
      person("m1", "Ahmet Mehmet", true, "PROF_DR"),
      person("m2", "Bekir Sami", false, null),
      person("m3", "Cemal Nur", false, "MOLLA"),
    ]);
    expect(html).toMatch(
      /<bdi>Prof\. Dr\. Ahmet Mehmet<\/bdi> <button[^>]*aria-label="Dersin imamı"/
    );
    expect(html).toContain("<bdi>Bekir Sami Hoca</bdi>");
    expect(html).toContain("<bdi>Molla Cemal Nur</bdi>");
    expect(html.match(/aria-label="Dersin imamı"/g)).toHaveLength(1);
  });

  it("finds each hoca back by place, so two who read alike keep their own star", async () => {
    const html = await withTeam([
      person("m1", "Ahmet Mehmet", false, null),
      person("m2", "Ahmet Mehmet", true, null),
    ]);
    expect(html).toMatch(
      /<bdi>Ahmet Mehmet Hoca<\/bdi>[^<]*<bdi>Ahmet Mehmet Hoca<\/bdi> <button[^>]*aria-label="Dersin imamı"/
    );
    expect(html.match(/aria-label="Dersin imamı"/g)).toHaveLength(1);
  });
});
