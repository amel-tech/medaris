import { resources } from "@medaris/i18n";
import type {
  CourseDetailResponse,
  KoskResponse,
} from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseCreateForm } from "~/features/courses/components/course-create-form";
import { CourseSettingsPage } from "~/features/courses/components/course-settings-page";
import { CurriculumEditor } from "~/features/courses/components/curriculum-editor";
import { SessionPlanForm } from "~/features/courses/components/session-plan-form";
import { SessionsView } from "~/features/courses/components/sessions-view";
import { TeamPicker } from "~/features/courses/components/team-picker";

// The server actions reach for the session and the API, and the router needs
// a mounted app; none of them runs in a render.
vi.mock("~/features/courses/actions", () => ({
  setCourseMuderris: vi.fn(),
  readCourse: vi.fn(),
  patchCourse: vi.fn(),
  patchLesson: vi.fn(),
  setLiveStream: vi.fn(),
  cancelSession: vi.fn(),
  saveCurriculum: vi.fn(),
}));
vi.mock("~/features/kosks/actions/courses", () => ({
  createKoskCourse: vi.fn(),
  createCourseSessions: vi.fn(),
  previewCourseSessions: vi.fn(),
}));
vi.mock("~/features/kosks/actions", () => ({ updateKosk: vi.fn() }));
vi.mock("~/features/kosks/course-actions", () => ({
  hideCourse: vi.fn(),
  restoreCourse: vi.fn(),
}));
vi.mock("~/features/madrasahs/actions", () => ({ lookupUserByEmail: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const render = (ui: React.ReactElement, locale: "tr" | "en" | "ar" = "tr") =>
  renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      timeZone="Europe/Istanbul"
      messages={{ nizam: resources[locale].nizam } as never}
    >
      {ui}
    </NextIntlClientProvider>
  );

const kosk = {
  id: "k1",
  name: "Nûruosmaniye Köşkü",
  alwaysRequireApproval: false,
  recordingsNeverPublic: false,
} as unknown as KoskResponse;

const lesson = (
  id: string,
  at: string,
  extra: Record<string, unknown> = {}
) => ({
  id,
  weekId: "w5",
  title: `Celse ${id}`,
  type: "LIVE",
  durationMinutes: 60,
  scheduledAt: at,
  isPreview: false,
  orderIndex: 0,
  cancelledAt: null,
  replacementLessonId: null,
  ...extra,
});

const course = {
  id: "c1",
  koskId: "k1",
  title: "Emsile ve Bina",
  description: "Sarf",
  coverHue: 20,
  status: "PUBLISHED",
  version: 3,
  timeZone: "Europe/Istanbul",
  isClosed: false,
  requiresApproval: true,
  coverLabel: null,
  muderris: [
    {
      id: "m1",
      userId: "a1",
      name: "Abdülhamit Karaosmanoğlu",
      avatarHue: 10,
      isImam: true,
    },
  ],
  resources: [],
  weeks: [
    {
      id: "w4",
      weekNumber: 4,
      title: "Mezîd fiiller",
      lessons: [
        lesson("l1", "2026-09-26T18:00:00.000Z", {
          meetingUrl: "https://zoom.us/j/1",
        }),
      ],
    },
    {
      id: "w5",
      weekNumber: 5,
      title: "Mehmûz fiiller",
      lessons: [
        lesson("l2", "2026-10-03T18:00:00.000Z", {
          meetingUrl: "https://zoom.us/j/2",
        }),
        lesson("l3", "2026-10-04T17:00:00.000Z", {
          durationMinutes: 45,
          cancelledAt: "2026-10-03T05:40:00.000Z",
        }),
        lesson("l4", "2026-10-07T18:00:00.000Z", {
          meetingUrl: "https://zoom.us/j/86357204418",
        }),
        lesson("l5", "2026-10-11T17:00:00.000Z", { durationMinutes: 45 }),
      ],
    },
  ],
} as unknown as CourseDetailResponse;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-03T18:14:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("Ders aç (nizam 32)", () => {
  it("draws the three sections and the settings, with an empty summary", () => {
    const html = render(<CourseCreateForm kosk={kosk} />);
    expect(html).toContain("Ders aç");
    expect(html).toContain("Ders adı");
    expect(html).toContain("Kapak ibaresi");
    expect(html).toContain("Müderrisler");
    expect(html).toContain("Haftalık celse günü");
    expect(html).toContain("0 celse planlanacak");
    expect(html).toContain("Kapalı ders");
    expect(html).toContain("Taslak olarak aç");
    expect(html).toContain("Hemen yayımla");
  });

  it("fixes the approval box when the köşk always requires it", () => {
    const html = render(
      <CourseCreateForm kosk={{ ...kosk, alwaysRequireApproval: true }} />
    );
    expect(html).toContain("Köşk politikası gereği her kayıt onaya bağlıdır");
  });

  it.each(["en", "ar"] as const)("renders in %s", (locale) => {
    const html = render(<CourseCreateForm kosk={kosk} />, locale);
    expect(html).not.toContain("nizam.CourseCreate");
  });
});

describe("TeamPicker (nizam 32, 33)", () => {
  it("marks the imam and offers Çıkar for every person", () => {
    const html = render(
      <TeamPicker
        value={{
          members: [
            { userId: "a1", name: "Abdülhamit", email: "a@example.com" },
            { userId: "b2", name: "Ayşe Nur", email: "b@example.com" },
          ],
          imamUserId: "a1",
        }}
        onChange={() => {}}
      />
    );
    expect(html).toContain("Seçilen müderrisler");
    expect(html).toContain("Dersin imamı");
    expect(html.match(/Çıkar/g)).toHaveLength(2);
    expect(html).toContain("a@example.com");
  });

  it("asks for the imam when several are chosen and none is", () => {
    const html = render(
      <TeamPicker
        value={{
          members: [
            { userId: "a1", name: "Abdülhamit" },
            { userId: "b2", name: "Ayşe Nur" },
          ],
          imamUserId: null,
        }}
        onChange={() => {}}
      />
    );
    expect(html).toContain("dersin imamını işaretleyin");
  });
});

describe("Ders ayarları (nizam 34)", () => {
  it("opens with the course's values and the team", () => {
    const html = render(
      <CourseSettingsPage
        kosk={kosk}
        course={course}
        enrolledCount={28}
        manager
        tedrisUrl="https://tedris.example"
      />
    );
    expect(html).toContain("Erişim, kayıt ve saat dilimi");
    expect(html).toContain("Örnek ders yok");
    expect(html).toContain("Yayında");
    expect(html).toContain("kayıtlı 28 talebe");
    expect(html).toContain("Taslağa çek");
    expect(html).toContain("Abdülhamit Karaosmanoğlu");
    expect(html).toContain("Müderrisleri düzenle");
    expect(html).toContain("Dersi gizle");
    expect(html).toContain("https://tedris.example/tr/courses/c1");
  });

  it("offers Yayımla for a draft and leaves the manager's boxes out for a müderris", () => {
    const html = render(
      <CourseSettingsPage
        kosk={kosk}
        course={{ ...course, status: "DRAFT" } as CourseDetailResponse}
        enrolledCount={null}
        manager={false}
        tedrisUrl={null}
      />
    );
    expect(html).toContain("Yayımla");
    expect(html).not.toContain("Taslağa çek<");
    expect(html).not.toContain("Müderrisleri düzenle");
    expect(html).not.toContain("Dersi gizle");
  });

  it("checks and locks the approval box under the köşk policy", () => {
    const html = render(
      <CourseSettingsPage
        kosk={{ ...kosk, alwaysRequireApproval: true }}
        course={{ ...course, requiresApproval: false } as CourseDetailResponse}
        enrolledCount={0}
        manager
        tedrisUrl={null}
      />
    );
    expect(html).toContain("Köşk politikası gereği her kayıt onaya bağlıdır");
  });
});

describe("Müfredat (nizam 54)", () => {
  it("draws the weeks as accordions with the saved values and no dirty strip", () => {
    const html = render(
      <CurriculumEditor kosk={{ id: "k1", name: "N" }} course={course} />
    );
    expect(html).toContain("Ders bilgileri");
    expect(html).toContain("Haftalar");
    expect(html).toContain("2 hafta · 4 celse");
    expect(html).toContain("Mehmûz fiiller");
    expect(html).toContain("Haftalık celse üret");
    expect(html).toContain("Hafta ekle");
    expect(html).not.toContain("Kaydedilmemiş değişiklikler var");
  });

  it("offers each session's kaynak beside its title, and none on a cancelled one (MDRS-279)", () => {
    const withKaynak = {
      ...course,
      weeks: course.weeks.map((w) => ({
        ...w,
        lessons: w.lessons.map((l) =>
          l.id === "l2" ? { ...l, kaynak: "Bina · s. 4-9" } : l
        ),
      })),
    } as CourseDetailResponse;
    const html = render(
      <CurriculumEditor kosk={{ id: "k1", name: "N" }} course={withKaynak} />
    );
    const input = (name: string) =>
      html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0];
    expect(input("lesson-1-0-kaynak")).toContain('value="Bina · s. 4-9"');
    expect(input("lesson-1-0-kaynak")).toContain('maxLength="120"');
    expect(input("lesson-1-0-kaynak")).toContain('dir="auto"');
    expect(html).toContain("Ör. Bina · s. 4–9");
    // l3 is cancelled: shown as information, with no field
    expect(input("lesson-1-1-kaynak")).toBeUndefined();
    expect(input("lesson-1-2-kaynak")).toContain('value=""');
  });
});

describe("Celse planla (nizam 55)", () => {
  it("draws the form, the link choices and an empty preview", () => {
    const html = render(
      <SessionPlanForm
        kosk={{ id: "k1", name: "N" }}
        course={{
          id: "c1",
          title: "Emsile ve Bina",
          timeZone: "Europe/Istanbul",
        }}
      />
    );
    expect(html).toContain("Planlama biçimi");
    expect(html).toContain("Haftalık tekrar");
    expect(html).toContain("Boş bırak");
    expect(html).toContain("Yalnız ilk celseye ekle");
    expect(html).toContain("Önizleme");
    expect(html).toContain("0 celse");
    expect(html).toContain("Haftanın tekrarı");
  });
});

describe("Celseler (nizam 56)", () => {
  // Rendered inside the tests: the clock is faked per test.
  let html = "";
  beforeEach(() => {
    html = render(
      <SessionsView
        kosk={{ id: "k1", name: "N" }}
        course={course}
        recordings={{ l1: 2 }}
        liveStreams={null}
        tedrisUrl={null}
      />
    );
  });

  it("groups the sessions and states the counts", () => {
    expect(html).toContain("Yaklaşan celseler");
    expect(html).toContain("Geçmiş celseler");
    expect(html).toContain("4 celse · 1 iptal edildi · Hafta 5");
  });

  it("marks the running session live and says how long it has run", () => {
    expect(html).toContain("Şu an canlı");
    expect(html).toContain("14 dakikadır sürüyor");
  });

  it("shows a cancelled session with no link and no action", () => {
    expect(html).toContain("İptal edildi");
    expect(html).toContain("Bağlantı gösterilmez");
    expect(html).toContain("İşlem yok");
  });

  it("offers the right action to each planned session", () => {
    expect(html).toContain("Bağlantıyı güncelle");
    expect(html).toContain("Bağlantı ekle");
    expect(html).toContain("Tarihi değiştir");
  });

  it("counts recordings of a past session", () => {
    expect(html).toContain("2 ders kaydı");
    expect(html).toContain("Sona erdi");
  });
});
