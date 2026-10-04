// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, render, settle, type as typeInto } from "./dom";
import { expand, html, textOf, translatorFor } from "./server-render";

/**
 * Müfredat of a course as the server renders it, and what can be done on it:
 * edit the weeks and sessions, save the whole course, meet a 409. The read, the
 * viewer and the action are stubs; what is under test is what the page does
 * with each answer.
 */
type Answer<T> =
  | { status: "ok"; data: T }
  | { status: "forbidden" }
  | { status: "failed" };

const state = {
  course: { status: "failed" } as Answer<unknown>,
  viewer: { id: "u-1", timeZone: "Europe/Istanbul" } as unknown,
  permissions: { status: "failed" } as Answer<unknown>,
};
const refresh = vi.fn();
const saveCurriculum = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => translatorFor(namespace),
  getLocale: async () => "tr",
}));
vi.mock("~/lib/tedrisat-read", () => ({
  readOnce: async (what: string, call: (api: unknown) => Promise<unknown>) => {
    await call({
      courses: {
        getCourseById: async () => {},
        getMyCoursePermissions: async () => {},
      },
    });
    return what.includes("holds in the course")
      ? state.permissions
      : state.course;
  },
}));
vi.mock("~/features/account/reads", () => ({
  getViewer: async () => state.viewer,
}));
vi.mock("~/features/curriculum/actions", () => ({
  saveCurriculum: (...args: unknown[]) => saveCurriculum(...args),
}));

const lesson = (id: string, title: string, at: string, over = {}) => ({
  id,
  weekId: `w-${id}`,
  title,
  type: "LIVE",
  scheduledAt: new Date(at),
  durationMinutes: 60,
  isPreview: false,
  orderIndex: 0,
  meetingUrl: undefined,
  kaynak: undefined,
  agenda: [],
  cancelledAt: null,
  cancelReason: null,
  replacementLessonId: null,
  ...over,
});

/** One week over, one running with a linked and an unlinked session and a cancelled one. */
const course = (over: Record<string, unknown> = {}) => ({
  id: "c-1",
  title: "Bina ve İzhar Şerhi",
  description: "Sarf ilminin temeli.",
  coverHue: 25,
  version: 7,
  timeZone: "Europe/Istanbul",
  contentLocked: false,
  isClosed: false,
  weeks: [
    {
      id: "w1",
      weekNumber: 1,
      title: "Birinci hafta",
      summary: undefined,
      lessons: [lesson("l-1", "Hafta 1", "2026-09-28T21:00:00+03:00")],
    },
    {
      id: "w2",
      weekNumber: 2,
      title: "İkinci hafta",
      summary: "Fiil çekimi",
      lessons: [
        lesson("l-2", "Hafta 2", "2026-10-05T21:00:00+03:00", {
          meetingUrl: "https://zoom.us/j/123456",
        }),
        lesson("l-3", "Hafta 2b", "2026-10-06T21:00:00+03:00"),
        lesson("l-4", "Hafta 2c", "2026-10-07T21:00:00+03:00", {
          cancelledAt: new Date("2026-10-01T10:00:00+03:00"),
        }),
      ],
    },
  ],
  muderris: [
    {
      id: "m-1",
      userId: "u-9",
      name: "Ahmed Hoca",
      title: undefined,
      bio: undefined,
      avatarHue: 10,
    },
  ],
  resources: [],
  ...over,
});

/** What the caller holds in the course, as `GET /courses/:id/my-permissions` answers. */
const holding = (...codes: string[]): Answer<unknown> => ({
  status: "ok",
  data: { permissions: ["course.view", ...codes], staffRead: false },
});

const wrap = (node: React.ReactNode) => (
  <NextIntlClientProvider
    locale="tr"
    timeZone="Europe/Istanbul"
    messages={{ nazir: resources.tr.nazir }}
  >
    <ToastProvider>
      {node}
      <Toaster />
    </ToastProvider>
  </NextIntlClientProvider>
);

const element = async () => {
  const { CurriculumPage } = await import(
    "~/features/curriculum/components/curriculum-page"
  );
  return wrap(<CurriculumPage courseId="c-1" />);
};
const markup = async () => html(await element());
const mount = async () => {
  await render((await expand(await element())) as ReactElement);
  await settle(40);
};

const toast = (tone: string) =>
  document.querySelector(`.mds-toast--${tone}`)?.textContent ?? "";
const buttonIn = (root: ParentNode, label: string) =>
  [...root.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement;
const form = () =>
  document.querySelector('[data-testid="curriculum"]') as HTMLElement;
const field = (name: string) =>
  document.querySelector(`[name="${name}"]`) as HTMLInputElement;
const save = () => buttonIn(form(), "Kaydet");
const cancel = () => buttonIn(form(), "Vazgeç");
const submit = async () => {
  await click(save());
  await settle(20);
};
const sentBody = () =>
  saveCurriculum.mock.calls[0]?.[1] as {
    version: number;
    title: string;
    weeks: Array<{
      id?: string;
      weekNumber: number;
      title: string;
      lessons: Array<Record<string, unknown>>;
    }>;
    muderris: unknown[];
  };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00+03:00"));
  state.course = { status: "ok", data: course() };
  state.viewer = { id: "u-1", timeZone: "Europe/Istanbul" };
  state.permissions = holding("course.edit", "session.manage");
  refresh.mockReset();
  saveCurriculum.mockReset();
  saveCurriculum.mockResolvedValue({
    success: true,
    data: { courseVersion: 8 },
  });
});
afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
});

describe("Müfredat", () => {
  it("is headed with the course it edits", async () => {
    const out = await markup();
    expect(out).toMatch(/<h1[^>]*>Müfredat<\/h1>/);
    expect(textOf(out)).toContain(
      "Bina ve İzhar Şerhi dersinin bilgileri, haftaları ve celseleri."
    );
  });

  it("holds the course's name, cover and introduction, and counts weeks and sessions on the zone it writes in", async () => {
    const out = textOf(await markup());
    expect(out).toContain("Ders bilgileri");
    expect(out).toContain("Ders adı");
    expect(out).toContain("Kapak rengi");
    expect(out).toContain("2 hafta · 3 celse · Saatler İstanbul saatiyle");
  });

  it("writes the times on the viewer's clock, as Celseler does", async () => {
    state.viewer = { id: "u-1", timeZone: "Europe/Berlin" };
    const out = textOf(await markup());
    expect(out).toContain("Saatler Berlin saatiyle");
    await mount();
    expect(field("lesson-1-0-time").value).toBe("20:00");
    expect(field("lesson-1-0-date").value).toBe("2026-10-05");
  });

  it("opens the week that is running and lists its sessions with their date, time, length and link", async () => {
    await mount();
    expect(field("week-1-title").value).toBe("İkinci hafta");
    expect(field("lesson-1-0-title").value).toBe("Hafta 2");
    expect(field("lesson-1-0-date").value).toBe("2026-10-05");
    expect(field("lesson-1-0-time").value).toBe("21:00");
    expect(field("lesson-1-0-duration").value).toBe("60");
    expect(field("lesson-1-0-url").value).toBe("https://zoom.us/j/123456");
    expect(field("lesson-1-1-url").value).toBe("");
    const text = form().textContent ?? "";
    expect(text).toContain("Planlandı");
    expect(text).toContain("Bağlantı eksik");
    expect(text).toContain("İptal edildi");
    // a cancelled session is information, not fields
    expect(field("lesson-1-2-title")).toBeNull();
  });

  it("offers the weekly generator on Celse planla, not on this page's own form", async () => {
    const out = await markup();
    expect(out).toContain('href="/ders/c-1/celseler/planla"');
    expect(textOf(out)).toContain("Haftalık celse üret");
  });

  it("is the 'Bu sayfaya izniniz yok' state when the API refuses the course", async () => {
    state.course = { status: "forbidden" };
    const out = textOf(await markup());
    expect(out).toContain("Bu sayfaya izniniz yok");
    expect(out).not.toContain("Ders bilgileri");
  });

  it("is that state for a caller who holds neither course.edit nor session.manage, whatever else they hold", async () => {
    for (const held of [
      [],
      ["course.view_details", "recording.manage", "session.live_link"],
      ["enrollment.decide", "enrollment.remove"],
    ]) {
      state.permissions = holding(...held);
      const out = textOf(await markup());
      expect(out).toContain("Bu sayfaya izniniz yok");
      expect(out).not.toContain("Ders bilgileri");
      expect(out).not.toContain("Kaydet");
    }
  });

  it("is that state when the permissions read is refused", async () => {
    state.permissions = { status: "forbidden" };
    expect(textOf(await markup())).toContain("Bu sayfaya izniniz yok");
  });

  it("opens for a ders nazırı who holds course.edit or session.manage, and does not take a locked course for a refusal", async () => {
    for (const code of ["course.edit", "session.manage"]) {
      state.course = { status: "ok", data: course({ contentLocked: true }) };
      state.permissions = holding(code);
      const out = textOf(await markup());
      expect(out, code).not.toContain("izniniz yok");
      expect(out, code).toContain("Ders bilgileri");
    }
  });

  it("is the retry state, not 'no access', when the permissions cannot be read", async () => {
    state.permissions = { status: "failed" };
    const out = textOf(await markup());
    expect(out).toContain("Müfredat okunamadı");
    expect(out).toContain("Yeniden dene");
    expect(out).not.toContain("izniniz yok");
    expect(out).not.toContain("Ders bilgileri");
  });

  it("fills the form with the links and agendas the read carries, so a save does not send them empty", async () => {
    state.course = {
      status: "ok",
      data: course({
        weeks: [
          {
            id: "w2",
            weekNumber: 2,
            title: "İkinci hafta",
            lessons: [
              lesson("l-2", "Hafta 2", "2026-10-05T21:00:00+03:00", {
                meetingUrl: "https://zoom.us/j/123456",
                agenda: [{ time: "21:00", title: "Giriş" }],
              }),
            ],
          },
        ],
      }),
    };
    state.permissions = holding("course.edit", "session.manage");
    await mount();
    expect(field("lesson-0-0-url").value).toBe("https://zoom.us/j/123456");
    await typeInto(field("title"), "Yeni ad");
    await submit();
    expect(sentBody().weeks[0]?.lessons[0]).toMatchObject({
      id: "l-2",
      meetingUrl: "https://zoom.us/j/123456",
      agenda: [{ time: "21:00", title: "Giriş" }],
    });
  });

  it("is the retry state, not 'no access', when the course cannot be read", async () => {
    state.course = { status: "failed" };
    const out = textOf(await markup());
    expect(out).toContain("Müfredat okunamadı");
    expect(out).toContain("Yeniden dene");
    expect(out).not.toContain("izniniz yok");
  });

  it("is bars while the course is read", async () => {
    const { CurriculumLoading } = await import(
      "~/features/curriculum/components/curriculum-page"
    );
    const out = await html(<CurriculumLoading />);
    expect(out).toContain('aria-busy="true"');
    expect(textOf(out)).toBe("Yükleniyor");
  });
});

describe("editing", () => {
  it("keeps Kaydet and Vazgeç off until something changes, then says so", async () => {
    await mount();
    expect(save().disabled).toBe(true);
    expect(cancel().disabled).toBe(true);
    expect(document.querySelector('[data-testid="dirty"]')).toBeNull();
    await typeInto(field("title"), "Yeni ad");
    expect(save().disabled).toBe(false);
    expect(cancel().disabled).toBe(false);
    expect(document.querySelector('[data-testid="dirty"]')?.textContent).toBe(
      "Kaydedilmemiş değişiklikler var"
    );
  });

  it("puts the saved values back with Vazgeç", async () => {
    await mount();
    await typeInto(field("title"), "Yeni ad");
    await typeInto(field("lesson-1-0-url"), "https://meet.google.com/abc");
    await click(cancel());
    expect(field("title").value).toBe("Bina ve İzhar Şerhi");
    expect(field("lesson-1-0-url").value).toBe("https://zoom.us/j/123456");
    expect(save().disabled).toBe(true);
  });

  it("shows the platform chip as a link is typed", async () => {
    await mount();
    await typeInto(field("lesson-1-1-url"), "https://meet.google.com/abc");
    expect(
      form().querySelector(".mds-platform-chip--google-meet")
    ).not.toBeNull();
  });

  it("adds a week after the highest one and a session on its last date", async () => {
    await mount();
    await click(buttonIn(form(), "Hafta ekle"));
    await typeInto(field("week-2-title"), "Üçüncü hafta");
    await settle(10);
    // the new week is closed until opened; the form still carries it
    expect(save().disabled).toBe(false);
    await typeInto(field("lesson-1-0-title"), "Hafta 2");
    await submit();
    expect(sentBody().weeks.map((w) => w.weekNumber)).toEqual([1, 2, 3]);
    expect(sentBody().weeks[2]).not.toHaveProperty("id");
  });

  it("hides a session and a week by leaving them out of the save, never deleting", async () => {
    await mount();
    const first = document.querySelector(
      '[data-testid="lesson-1-0"]'
    ) as HTMLElement;
    await click(buttonIn(first, "Gizle"));
    expect(field("lesson-1-0-title").value).toBe("Hafta 2b");
    // the first week's own button hides that week
    await click(buttonIn(form(), "Haftayı gizle"));
    await submit();
    const sent = sentBody();
    expect(sent.weeks.map((w) => w.id)).toEqual(["w2"]);
    expect(sent.weeks[0]?.lessons.map((l) => l.id)).toEqual(["l-3", "l-4"]);
  });
});

describe("Kaydet", () => {
  it("sends the whole course with the version the page was read at and says it was saved", async () => {
    await mount();
    await typeInto(field("lesson-1-1-url"), "meet.google.com/abc-defg");
    await typeInto(field("title"), "Bina ve İzhar");
    await submit();
    expect(saveCurriculum).toHaveBeenCalledTimes(1);
    expect(saveCurriculum.mock.calls[0]?.[0]).toBe("c-1");
    const sent = sentBody();
    expect(sent.version).toBe(7);
    expect(sent.title).toBe("Bina ve İzhar");
    expect(sent.weeks).toHaveLength(2);
    expect(sent.weeks[1]?.lessons.map((l) => l.id)).toEqual([
      "l-2",
      "l-3",
      "l-4",
    ]);
    expect(sent.weeks[1]?.lessons[1]?.meetingUrl).toBe(
      "https://meet.google.com/abc-defg"
    );
    // what the form does not edit is sent back as it was
    expect(sent.muderris).toHaveLength(1);
    expect(toast("success")).toContain("Müfredat kaydedildi");
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps a session's instant when only its link changed", async () => {
    await mount();
    await typeInto(field("lesson-1-1-url"), "https://meet.google.com/abc");
    await submit();
    expect(sentBody().weeks[1]?.lessons[0]?.scheduledAt).toEqual(
      new Date("2026-10-05T21:00:00+03:00")
    );
  });

  it("is locked while the page reads the saved course, so a second save cannot send the new weeks without their ids", async () => {
    saveCurriculum.mockImplementation(async () => ({
      success: true,
      data: { courseVersion: 8 },
    }));
    await mount();
    await typeInto(field("title"), "Yeni ad");
    await submit();
    // the editor is keyed by version: the page starts a fresh form on its own
    expect(save().disabled).toBe(true);
    expect(saveCurriculum).toHaveBeenCalledTimes(1);
  });

  it("does not send a form that has a problem, and says where", async () => {
    await mount();
    await typeInto(field("week-1-title"), " ");
    await typeInto(field("lesson-1-0-url"), "http://zoom.us/j/1");
    await submit();
    expect(saveCurriculum).not.toHaveBeenCalled();
    const text = form().textContent ?? "";
    expect(text).toContain("Hafta başlığını yazın.");
    expect(text).toContain("Toplantı bağlantısı https:// ile başlamalı.");
  });

  it("words a refusal of the save from its code and keeps the form", async () => {
    saveCurriculum.mockResolvedValue({
      success: false,
      code: "AUTHZ_FORBIDDEN",
    });
    await mount();
    await typeInto(field("title"), "Yeni ad");
    await submit();
    expect(toast("error")).toContain("Müfredat kaydedilemedi");
    expect(toast("error")).toContain("Bunu yapma izniniz yok.");
    expect(field("title").value).toBe("Yeni ad");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("words any other refusal in general terms, never with the server's message", async () => {
    saveCurriculum.mockResolvedValue({ success: false, code: "" });
    await mount();
    await typeInto(field("title"), "Yeni ad");
    await submit();
    expect(toast("error")).toContain("Bir şeyler ters gitti.");
  });

  it("asks what to do when somebody saved the course since: nothing was written, and the form is kept until the course is reloaded", async () => {
    saveCurriculum.mockResolvedValue({
      success: false,
      code: "COURSE_VERSION_CONFLICT",
    });
    await mount();
    await typeInto(field("title"), "Yeni ad");
    await submit();
    const alert = document.querySelector(".mds-alert") as HTMLElement;
    expect(alert.textContent).toContain("Ders, siz düzenlerken değişti");
    expect(alert.textContent).toContain("hiçbir şeyin üzerine yazılmadı");
    expect(toast("error")).toBe("");
    expect(field("title").value).toBe("Yeni ad");
    // saving again is off until the course is reloaded
    expect(save().disabled).toBe(true);
    expect(refresh).not.toHaveBeenCalled();

    await click(buttonIn(alert, "Güncel dersi yükle"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("what each permission lets the form do", () => {
  it("gives a holder of both everything: save, add, copy and hide, and the date and time", async () => {
    state.permissions = holding("course.edit", "session.manage");
    await mount();
    expect(save()).toBeDefined();
    expect(buttonIn(form(), "Hafta ekle")).toBeDefined();
    expect(buttonIn(form(), "Celse ekle")).toBeDefined();
    expect(buttonIn(form(), "Haftayı kopyala")).toBeDefined();
    expect(buttonIn(form(), "Haftayı gizle")).toBeDefined();
    expect(form().textContent).toContain("Haftalık celse üret");
    expect(field("lesson-1-0-date").disabled).toBe(false);
    expect(field("lesson-1-0-time").disabled).toBe(false);
  });

  it("lets a holder of course.edit alone change what the course and its sessions say, and not add, move or hide a session", async () => {
    state.permissions = holding("course.edit");
    await mount();
    expect(form().textContent).toContain(
      "Celse eklemek, taşımak, saatini değiştirmek ya da gizlemek için celse yönetimi izni gerekir"
    );
    expect(buttonIn(form(), "Celse ekle")).toBeUndefined();
    expect(buttonIn(form(), "Haftayı kopyala")).toBeUndefined();
    expect(buttonIn(form(), "Haftayı gizle")).toBeUndefined();
    expect(buttonIn(form(), "Gizle")).toBeUndefined();
    expect(form().textContent).not.toContain("Haftalık celse üret");
    expect(field("lesson-1-0-date").disabled).toBe(true);
    expect(field("lesson-1-0-time").disabled).toBe(true);
    // what a session says, its link, its length and the course are still theirs
    expect(field("title").disabled).toBe(false);
    expect(field("lesson-1-0-title").disabled).toBe(false);
    expect(field("lesson-1-0-url").disabled).toBe(false);
    expect(buttonIn(form(), "Hafta ekle")).toBeDefined();

    await typeInto(field("lesson-1-1-url"), "https://meet.google.com/abc-defg");
    await submit();
    const sent = sentBody();
    expect(sent.weeks.map((w) => w.id)).toEqual(["w1", "w2"]);
    expect(sent.weeks[1]?.lessons.map((l) => l.id)).toEqual([
      "l-2",
      "l-3",
      "l-4",
    ]);
    // the times went back as they were stored
    expect(sent.weeks[1]?.lessons[0]?.scheduledAt).toEqual(
      new Date("2026-10-05T21:00:00+03:00")
    );
  });

  it("lets a course.edit holder hide a week that holds no session", async () => {
    state.course = {
      status: "ok",
      data: course({
        weeks: [
          {
            id: "w9",
            weekNumber: 1,
            title: "Boş hafta",
            summary: undefined,
            lessons: [],
          },
        ],
      }),
    };
    state.permissions = holding("course.edit");
    await mount();
    expect(buttonIn(form(), "Haftayı gizle")).toBeDefined();
  });

  it("is read-only for a holder of session.manage alone: no Kaydet, no Vazgeç, every field off", async () => {
    state.permissions = holding("session.manage");
    await mount();
    expect(save()).toBeUndefined();
    expect(cancel()).toBeUndefined();
    expect(form().textContent).toContain(
      "Bu dersin bilgilerini ve haftalarını değiştirmek için ders düzenleme izni gerekir"
    );
    for (const name of [
      "title",
      "week-1-title",
      "lesson-1-0-title",
      "lesson-1-0-date",
      "lesson-1-0-url",
    ]) {
      expect(field(name).disabled, name).toBe(true);
    }
    expect(buttonIn(form(), "Hafta ekle")).toBeUndefined();
    expect(buttonIn(form(), "Celse ekle")).toBeUndefined();
    expect(buttonIn(form(), "Haftayı gizle")).toBeUndefined();
    // planning is session.manage, so the link to it stays
    expect(form().textContent).toContain("Haftalık celse üret");
    expect(saveCurriculum).not.toHaveBeenCalled();
  });
});
