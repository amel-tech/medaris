import { resources } from "@medaris/i18n";
import type {
  CourseDetailResponse,
  KoskCourseRowResponse,
  KoskOverviewResponse,
  KoskResponse,
} from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CourseOverview } from "~/features/kosks/components/course-overview";
import { KoskCoursesView } from "~/features/kosks/components/kosk-courses-view";
import { KoskManagePage } from "~/features/kosks/components/kosk-manage-page";
import { LoadFailed } from "~/features/kosks/components/load-failed";
import {
  COURSE_TABS,
  canDeactivate,
  canHide,
  countRows,
  courseBreakdown,
  courseHideOutcome,
  errorCodeOf,
  filterCourses,
  firstMissingLink,
  listWords,
  type Messages,
  meetingSlots,
  platformOf,
  registrationChips,
  rowActions,
  sessionCount,
  sessionStatus,
  studentsCell,
  tabCount,
  upcomingSessions,
} from "~/features/kosks/overview-present";

// The server actions reach for the session and the API, and the router needs a
// mounted app; none of them runs in a render.
vi.mock("~/features/kosks/admin-actions", () => ({
  addKoskNazims: vi.fn(),
  deactivateKosk: vi.fn(),
  hideKosk: vi.fn(),
  restoreKosk: vi.fn(),
  openKosk: vi.fn(),
}));
vi.mock("~/features/kosks/course-actions", () => ({
  hideCourse: vi.fn(),
  restoreCourse: vi.fn(),
}));
vi.mock("~/features/kosks/actions", () => ({}));
vi.mock("~/features/kosks/actions/courses", () => ({
  approveEnrollment: vi.fn(),
  rejectEnrollment: vi.fn(),
  findUserByEmail: vi.fn(),
}));
vi.mock("~/features/applications/use-decisions", () => ({
  useDecisions: () => ({ busy: null, decided: new Set(), decide: vi.fn() }),
}));
vi.mock("~/features/hosting/actions", () => ({
  grantHostingRight: vi.fn(),
  revokeHostingRight: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const dig = (node: unknown, path: string) =>
  path
    .split(".")
    .reduce<unknown>((n, part) => (n as Record<string, unknown>)?.[part], node);
const messages = resources.tr.nizam as unknown as Record<string, unknown>;
const messagesOf =
  (namespace: string): Messages =>
  (key, values) =>
    Object.entries(values ?? {}).reduce(
      (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
      String(dig(messages[namespace], key))
    );
const manage = messagesOf("KoskManage");

const row = (
  over: Partial<KoskCourseRowResponse> = {}
): KoskCourseRowResponse => ({
  id: "c1",
  title: "Emsile ve Bina",
  coverHue: 20,
  weekCount: 8,
  madrasah: null,
  status: "PUBLISHED",
  hiddenAt: null,
  createdAt: new Date("2026-09-01T09:00:00Z"),
  muderris: [{ name: "Abdülhamit Karaosmanoğlu", isImam: true }],
  studentCount: 28,
  pendingCount: 2,
  bannedCount: 5,
  ...over,
});

const rows: KoskCourseRowResponse[] = [
  row(),
  row({ id: "c2", title: "Avâmil ve Tasrîf", pendingCount: 0, bannedCount: 0 }),
  row({
    id: "c3",
    title: "Bina ve İzhar Şerhi",
    madrasah: { id: "m1", name: "Süleymaniye Medresesi" },
  }),
  row({ id: "c4", title: "Maksûd şerhi", status: "DRAFT", studentCount: 0 }),
  row({
    id: "c5",
    title: "Merâhu’l-ervâh okumaları",
    status: "HIDDEN",
    hiddenAt: new Date("2026-09-20T09:00:00Z"),
    studentCount: 14,
  }),
];
const [r0, r1, r2, r3, r4] = rows as [
  KoskCourseRowResponse,
  KoskCourseRowResponse,
  KoskCourseRowResponse,
  KoskCourseRowResponse,
  KoskCourseRowResponse,
];

describe("the tabs of the Dersler table (nizam 23)", () => {
  it("counts the rows by status, hidden ones in Tümü", () => {
    expect(countRows(rows)).toEqual({
      all: 5,
      published: 3,
      draft: 1,
      hidden: 1,
    });
    expect(COURSE_TABS.map((t) => tabCount(countRows(rows), t))).toEqual([
      5, 3, 1, 1,
    ]);
  });

  it("narrows the list to the tab, and Tümü keeps every row (criterion 2)", () => {
    expect(filterCourses(rows, "ALL")).toHaveLength(5);
    expect(filterCourses(rows, "PUBLISHED").map((r) => r.id)).toEqual([
      "c1",
      "c2",
      "c3",
    ]);
    expect(filterCourses(rows, "DRAFT").map((r) => r.id)).toEqual(["c4"]);
    expect(filterCourses(rows, "HIDDEN").map((r) => r.id)).toEqual(["c5"]);
  });
});

describe("a row's buttons (nizam 23)", () => {
  it("gives the köşk's own course Düzenle, Müderrisleri düzenle and Gizle", () => {
    expect(rowActions(row())).toEqual(["edit", "editMuderris", "hide"]);
  });

  it("gives a medrese's course Dersi gör and Gizle, and no Düzenle", () => {
    expect(rowActions(r2)).toEqual(["view", "hide"]);
  });

  it("gives a hidden course only Geri al", () => {
    expect(rowActions(r4)).toEqual(["restore"]);
  });

  it("gives no Geri al for a course hidden above the viewer's level (MDRS-108)", () => {
    const locked = { ...r4, canRestore: false } as KoskCourseRowResponse;
    expect(rowActions(locked)).toEqual([]);
    expect(
      rowActions({ ...r4, canRestore: true } as KoskCourseRowResponse)
    ).toEqual(["restore"]);
  });
});

describe("a refused hide or restore of a course", () => {
  it("reads 'already where it should be' as done, and words the kademe and the hidden parent", () => {
    expect(courseHideOutcome("COURSE_NOT_HIDDEN")).toBe("done");
    expect(courseHideOutcome("COURSE_ALREADY_HIDDEN")).toBe("done");
    expect(courseHideOutcome("ARCHIVE_RESTORE_LEVEL")).toBe("restoreLevel");
    expect(courseHideOutcome("ARCHIVE_PARENT_HIDDEN")).toBe(
      "restoreParentHidden"
    );
    expect(courseHideOutcome(null)).toBe("failed");
    expect(errorCodeOf({ code: "ARCHIVE_RESTORE_LEVEL" })).toBe(
      "ARCHIVE_RESTORE_LEVEL"
    );
    expect(errorCodeOf("nope")).toBeNull();
    const t = messagesOf("KoskCourses");
    expect(t("restoreLevelBody")).toContain("üst bir kademe");
    expect(t("restoreParentHiddenBody")).toContain("hâlâ gizli");
  });
});

describe("a row's cells (nizam 23)", () => {
  it("shows a dash for a draft nobody can have joined, and the number otherwise", () => {
    expect(studentsCell(r3)).toBeNull();
    expect(studentsCell(r0)).toBe(28);
    expect(studentsCell(r4)).toBe(14);
    expect(studentsCell(row({ studentCount: 0 }))).toBe(0);
  });

  it("draws only the chips that are not zero, and none for a draft or hidden course", () => {
    expect(registrationChips(r0)).toEqual([
      { kind: "pending", count: 2 },
      { kind: "banned", count: 5 },
    ]);
    expect(registrationChips(r1)).toEqual([]);
    expect(
      registrationChips(row({ status: "DRAFT", pendingCount: 3 }))
    ).toEqual([]);
  });
});

describe("the köşk page's numbers (nizam 20)", () => {
  it("writes the breakdown under the Ders number", () => {
    expect(
      courseBreakdown({ all: 7, published: 3, draft: 2, hidden: 2 }, manage)
    ).toBe("3 yayında · 2 taslak · 2 gizli");
  });

  it("offers hiding and taking out of service only where they still change something", () => {
    expect(canHide("ACTIVE")).toBe(true);
    expect(canHide("PASSIVE")).toBe(true);
    expect(canHide("HIDDEN")).toBe(false);
    expect(canDeactivate("ACTIVE")).toBe(true);
    expect(canDeactivate("PASSIVE")).toBe(false);
    expect(canDeactivate("HIDDEN")).toBe(false);
  });
});

const lesson = (
  id: string,
  scheduledAt: string,
  over: Record<string, unknown> = {}
) => ({
  id,
  weekId: "w",
  title: id,
  type: "LIVE" as const,
  durationMinutes: 60,
  scheduledAt: new Date(scheduledAt),
  meetingUrl: "https://zoom.us/j/1",
  isPreview: false,
  orderIndex: 0,
  ...over,
});

const NOW = new Date("2026-10-01T12:00:00Z");
const course = {
  id: "c1",
  koskId: "k1",
  title: "Emsile ve Bina",
  status: "PUBLISHED",
  requiresApproval: true,
  timeZone: "Europe/Istanbul",
  weeks: [
    {
      id: "w1",
      weekNumber: 4,
      lessons: [
        lesson("geçmiş", "2026-09-26T18:00:00Z"),
        lesson("cumartesi", "2026-10-03T18:00:00Z", { meetingUrl: undefined }),
        lesson("iptal", "2026-10-04T17:00:00Z", {
          cancelledAt: new Date("2026-10-01T08:00:00Z"),
          meetingUrl: undefined,
        }),
      ],
    },
    {
      id: "w2",
      weekNumber: 5,
      lessons: [
        lesson("telafi", "2026-10-07T18:00:00Z"),
        lesson("pazar", "2026-10-11T17:00:00Z"),
        lesson("sonra", "2026-10-17T18:00:00Z", { meetingUrl: undefined }),
        lesson("video", "2026-10-02T18:00:00Z", { type: "VIDEO" }),
      ],
    },
  ],
  muderris: [{ id: "m1", name: "Abdülhamit Karaosmanoğlu" }],
} as unknown as CourseDetailResponse;

describe("a course's upcoming sessions (nizam 53)", () => {
  it("lists the nearest four that have not begun, by date, cancelled ones marked (criterion 3)", () => {
    const next = upcomingSessions(course, NOW);
    expect(next.map((s) => s.lesson.id)).toEqual([
      "cumartesi",
      "iptal",
      "telafi",
      "pazar",
    ]);
    expect(next.map((s) => s.status)).toEqual([
      "missingLink",
      "cancelled",
      "planned",
      "planned",
    ]);
  });

  it("leaves out sessions that are not live ones", () => {
    expect(
      upcomingSessions(course, NOW, 99).some((s) => s.lesson.id === "video")
    ).toBe(false);
  });

  it("names the first upcoming session with no link, never a cancelled one (criterion 2)", () => {
    expect(firstMissingLink(course, NOW)?.lesson.id).toBe("cumartesi");
    expect(
      firstMissingLink(
        {
          weeks: [
            {
              id: "w",
              weekNumber: 1,
              lessons: [
                lesson("a", "2026-10-03T18:00:00Z", {
                  cancelledAt: new Date(),
                  meetingUrl: undefined,
                }),
              ],
            },
          ],
        } as unknown as CourseDetailResponse,
        NOW
      )
    ).toBeNull();
  });

  it("looks for the missing link beyond the four it lists", () => {
    const far = {
      weeks: [
        {
          id: "w",
          weekNumber: 1,
          lessons: [
            ...[1, 2, 3, 4].map((n) =>
              lesson(`ok${n}`, `2026-10-0${n + 1}T18:00:00Z`)
            ),
            lesson("geç", "2026-12-01T18:00:00Z", { meetingUrl: undefined }),
          ],
        },
      ],
    } as unknown as CourseDetailResponse;
    expect(upcomingSessions(far, NOW)).toHaveLength(4);
    expect(firstMissingLink(far, NOW)?.lesson.id).toBe("geç");
  });

  it("counts a blank link as a missing one", () => {
    expect(sessionStatus({ meetingUrl: "  " })).toBe("missingLink");
    expect(sessionStatus({ meetingUrl: "https://meet.google.com/x" })).toBe(
      "planned"
    );
    expect(sessionStatus({ cancelledAt: new Date(), meetingUrl: "x" })).toBe(
      "cancelled"
    );
  });

  it("counts the live sessions of the programme and writes the days it meets", () => {
    expect(sessionCount(course)).toBe(6);
    expect(listWords(meetingSlots(course, "tr"), "tr")).toBe(
      "Çarşamba 21:00, Cumartesi 21:00 ve Pazar 20:00"
    );
  });
});

describe("the platform of a meeting link", () => {
  it("names the ones a talebe knows and falls back to the host", () => {
    expect(platformOf("https://us02web.zoom.us/j/123")).toBe("Zoom");
    expect(platformOf("https://meet.google.com/abc-defg-hij")).toBe(
      "Google Meet"
    );
    expect(platformOf("https://teams.microsoft.com/l/meetup-join/x")).toBe(
      "Microsoft Teams"
    );
    expect(platformOf("https://www.youtube.com/live/x")).toBe("YouTube");
    expect(platformOf("https://meet.example.org/room")).toBe(
      "meet.example.org"
    );
    expect(platformOf("not a link")).toBeNull();
    expect(platformOf(undefined)).toBeNull();
  });
});

const render = (ui: React.ReactElement) =>
  renderToStaticMarkup(
    <NextIntlClientProvider
      locale="tr"
      timeZone="Europe/Istanbul"
      messages={{ nizam: resources.tr.nizam } as never}
    >
      {ui}
    </NextIntlClientProvider>
  );

const kosk = {
  id: "k1",
  name: "Nûruosmaniye Köşkü",
  handle: "@nuruosmaniye",
  field: "Arapça dil ilimleri",
  level: "BEGINNER",
  description: "Sarfa Emsile ve Bina ile başlanır.",
  coverHue: 250,
  isPrivate: false,
  alwaysRequireApproval: false,
  recordingsNeverPublic: true,
} as unknown as KoskResponse;

const overview: KoskOverviewResponse = {
  status: "ACTIVE",
  since: null,
  openedAt: new Date("2026-08-25T09:00:00Z"),
  openedBy: { id: "u1", name: "Yusuf Ziya Ertuğrul", email: null },
  courses: { all: 5, published: 3, draft: 1, hidden: 1 },
  students: 74,
  pendingApplications: 5,
  nazimCount: 1,
  hostingMadrasahs: [{ id: "m1", name: "Süleymaniye Medresesi" }],
};

describe("Köşk — Medaris yönetimi görünümü (nizam 20)", () => {
  const page = (over: Partial<Parameters<typeof KoskManagePage>[0]> = {}) =>
    render(
      <KoskManagePage
        kosk={kosk}
        overview={overview}
        nazims={[]}
        rights={[]}
        rows={rows}
        viewerId={null}
        koskPublicHref="https://tedris.example/tr/kosks/k1"
        {...over}
      />
    );

  it("draws the summary, the details and the actions", () => {
    const html = page();
    expect(html).toContain("Bu, Medaris yönetimi görünümüdür");
    expect(html).toContain("3 yayında · 1 taslak · 1 gizli");
    expect(html).toContain("74");
    expect(html).toContain("Gizli dersler hariç");
    expect(html).toContain("Süleymaniye Medresesi");
    expect(html).toContain("Köşk bilgileri");
    expect(html).toContain("Ders kayıtları hiçbir zaman herkese açılmaz");
    expect(html).toContain("Yusuf Ziya Ertuğrul");
    expect(html).toContain("Köşkü gizle");
    expect(html).toContain("Köşkü pasife al");
    expect(html).toContain("Köşk nazımı ekle");
  });

  it("has no permanent delete here, only the way to the Arşiv (criterion 5)", () => {
    const html = page();
    expect(html).toContain("Arşiv’e git");
    expect(html).not.toContain("Kalıcı olarak sil</button>");
  });

  it("has no buttons on the courses table: the course work is the köşk nazımı's", () => {
    const html = page();
    expect(html).not.toContain("Müderrisleri düzenle");
    expect(html).not.toContain("Dersi gör");
  });

  it("says so in place when a section could not be read", () => {
    const html = page({ nazims: null, rights: null, rows: null });
    expect(html.match(/Bölüm yüklenemedi/g)).toHaveLength(3);
  });

  it("draws the notice in the neutral tone, not the info one (canvas)", () => {
    const html = page();
    expect(html).toContain("mds-alert--neutral");
    expect(html).not.toContain("mds-alert--info");
  });

  it("warns that a hidden or passive köşk is out of sight", () => {
    expect(
      page({
        overview: {
          ...overview,
          status: "HIDDEN",
          since: new Date("2026-09-24T09:00:00Z"),
        },
      })
    ).toContain("Bu köşk gizli");
    expect(
      page({
        overview: {
          ...overview,
          status: "PASSIVE",
          since: new Date("2026-09-24T09:00:00Z"),
        },
      })
    ).toContain("Bu köşk pasif");
  });
});

describe("Dersler (nizam 23)", () => {
  const view = (over: Partial<Parameters<typeof KoskCoursesView>[0]> = {}) =>
    render(
      <KoskCoursesView
        kosk={kosk}
        overview={overview}
        rows={rows}
        mayOpenCourse
        tedrisUrl="https://tedris.example"
        {...over}
      />
    );

  it("draws the three cards and the tabs with the rows' own numbers (criteria 1, 4)", () => {
    const html = view();
    expect(html).toContain("Bekleyen başvuru");
    expect(html).toContain("Başvurulara git");
    expect(html).toContain("Barındırma haklarını gör");
    expect(html).toContain("Köşk nazımlarını gör");
    expect(html).toContain("Bütün dersler");
    expect(html).toContain("Emsile ve Bina");
    expect(html).toContain("Maksûd şerhi");
  });

  it("gives a medrese's course Dersi gör and no Düzenle, and an own one all three", () => {
    const html = view();
    expect(html).toContain("Dersi gör: Bina ve İzhar Şerhi");
    expect(html).not.toContain("Düzenle: Bina ve İzhar Şerhi");
    expect(html).toContain("Düzenle: Emsile ve Bina");
    expect(html).toContain("Müderrisleri düzenle: Emsile ve Bina");
    expect(html).toContain("Gizle: Emsile ve Bina");
  });

  it("gives a hidden course only Geri al", () => {
    const html = view();
    expect(html).toContain("Geri al: Merâhu’l-ervâh okumaları");
    expect(html).not.toContain("Gizle: Merâhu’l-ervâh okumaları");
  });

  it("draws no Geri al for a course the platform hid (MDRS-108)", () => {
    const html = view({
      rows: rows.map((r) =>
        r.id === "c5" ? ({ ...r, canRestore: false } as typeof r) : r
      ),
    });
    expect(html).toContain("Merâhu’l-ervâh okumaları");
    expect(html).not.toContain("Geri al: Merâhu’l-ervâh okumaları");
  });

  it("writes the pending and barred chips, the barred one in the error tone", () => {
    const html = view();
    expect(html).toContain("2 onay bekliyor");
    expect(html).toContain("5 yasaklı");
    expect(html).toMatch(/mds-badge--error[^>]*>(?:<[^>]*>)*5 yasaklı/);
  });

  it("keeps the row buttons on one line as text buttons", () => {
    const html = view();
    expect(html).toContain("flex-nowrap");
    expect(html).not.toContain("mds-btn--link");
  });

  it("offers Ders aç only to who may open a course", () => {
    expect(view()).toContain("Ders aç");
    expect(view({ mayOpenCourse: false })).not.toContain("Ders aç");
  });

  it("leaves out the public links without a tedris address", () => {
    expect(view({ tedrisUrl: null })).not.toContain("Dersi gör:");
    expect(view({ tedrisUrl: null })).not.toContain("Köşk sayfasını gör");
  });

  it("says so in place when the read failed", () => {
    const html = view({ overview: null, rows: null });
    expect(html).toContain("Bölüm yüklenemedi");
    expect(html).toContain("Yeniden dene");
  });

  it("says there are no courses when there are none", () => {
    expect(view({ rows: [] })).toContain("Henüz ders yok.");
  });
});

describe("Genel bakış (nizam 53)", () => {
  const stats = {
    enrolledCount: 28,
    pendingCount: 2,
    completedCount: 0,
    weekCount: 8,
    startedWeekCount: 5,
  };
  const pending = [
    {
      userId: "u1",
      courseId: "c1",
      studentName: "Ömer Faruk Demirkaya",
      studentEmail: null,
      progress: 0,
      status: "PENDING",
      createdAt: new Date("2026-09-29T18:05:00Z"),
      updatedAt: new Date("2026-09-29T18:05:00Z"),
      ban: null,
    },
  ] as never;
  const view = (over: Partial<Parameters<typeof CourseOverview>[0]> = {}) =>
    render(
      <CourseOverview
        kosk={{ id: "k1", name: "Nûruosmaniye Köşkü" }}
        course={course}
        stats={stats}
        pending={pending}
        row={row()}
        {...over}
      />
    );

  it("draws the numbers, the sessions and the application (criteria 1, 4)", () => {
    const html = view();
    expect(html).toContain("Genel bakış");
    expect(html).toContain("Yayında");
    expect(html).toContain("Kayıtlı talebe");
    expect(html).toContain("28");
    expect(html).toContain("Toplam 8 hafta");
    expect(html).toContain("Sıradaki celseler");
    expect(html).toContain("Ömer Faruk Demirkaya");
    expect(html).toContain("Onayla: Ömer Faruk Demirkaya");
    expect(html).toContain("Reddet: Ömer Faruk Demirkaya");
  });

  it("warns about the first missing link and marks the row (criterion 2)", () => {
    const html = view();
    expect(html).toContain("celsesinin toplantı bağlantısı eksik");
    expect(html).toContain("Bağlantı eksik");
    expect(html).toContain("Toplantı bağlantısı ekle");
    expect(html).toContain("İptal edildi");
  });

  it("sends Müfredatı düzenle and Celse planla to the course's editor (criterion 5)", () => {
    const html = view();
    expect(html).toContain("/tr/kosks/k1/courses/c1/edit");
    expect(html).toContain("Müfredatı düzenle");
    expect(html).toContain("Celse planla");
  });

  it("sends Bütün celseler to the course's own Celseler, a page that exists (MDRS-211)", () => {
    const html = view();
    expect(html).toMatch(
      /<a[^>]*href="\/tr\/kosks\/k1\/courses\/c1\/sessions"[^>]*>Bütün celseler<\/a>/
    );
    expect(html).not.toContain("/kosks/k1/celseler");
  });

  it("lists the müderris with the imam marked (criterion 6)", () => {
    const html = view({
      course: {
        ...course,
        muderris: [{ id: "m1", name: "Abdülhamit Karaosmanoğlu" }],
      } as unknown as CourseDetailResponse,
      row: row({
        muderris: [{ name: "Abdülhamit Karaosmanoğlu", isImam: true }],
      }),
    });
    expect(html).toContain("Abdülhamit Karaosmanoğlu");
    expect(html).toContain("Dersin imamı");
  });

  it("shows a draft with the draft badge", () => {
    expect(
      view({
        course: {
          ...course,
          status: "DRAFT",
        } as unknown as CourseDetailResponse,
      })
    ).toContain("Taslak");
  });

  it("says so in place when the numbers or the applications could not be read", () => {
    const html = view({ stats: null, pending: null });
    expect(html).toContain("Sayısal bilgiler yüklenemedi");
    expect(html).toContain("Yeniden dene");
  });

  it("says there is nothing waiting or coming when there is not", () => {
    const html = view({
      pending: [],
      course: { ...course, weeks: [] } as unknown as CourseDetailResponse,
    });
    expect(html).toContain("Bekleyen başvuru yok");
    expect(html).toContain("Yaklaşan celse yok");
  });
});

describe("the page-level load failure", () => {
  it("is an error Alert with a title and Yeniden dene, not a bare paragraph", () => {
    const html = render(
      <LoadFailed
        title="Bölüm yüklenemedi"
        message="Bu bölüm şu an okunamıyor."
        retry="Yeniden dene"
      />
    );
    expect(html).toContain("mds-alert--error");
    expect(html).toContain("Bölüm yüklenemedi");
    expect(html).toContain("Yeniden dene");
  });
});
