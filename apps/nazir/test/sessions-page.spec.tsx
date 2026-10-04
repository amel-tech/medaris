// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, render, settle, type as typeInto } from "./dom";
import { expand, html, textOf, translatorFor } from "./server-render";

/**
 * Celseler of a course as the server renders it, and what can be done on it:
 * link, time, live stream, cancel and its make-up. The reads, the viewer and the
 * actions are stubs; what is under test is what the page does with each answer.
 */
type Answer<T> =
  | { status: "ok"; data: T }
  | { status: "forbidden" }
  | { status: "failed" };

const state = {
  course: { status: "failed" } as Answer<unknown>,
  streams: { status: "failed" } as Answer<unknown>,
  viewer: { id: "u-1", timeZone: "Europe/Istanbul" } as unknown,
};
const refresh = vi.fn();
const changeSession = vi.fn();
const cancelSession = vi.fn();
const setLiveStream = vi.fn();
const createSessions = vi.fn();

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
      courses: { getCourseById: async () => {} },
      lessons: { listCourseLiveStreams: async () => {} },
    });
    return what.includes("live stream") ? state.streams : state.course;
  },
}));
vi.mock("~/features/account/reads", () => ({
  getViewer: async () => state.viewer,
}));
vi.mock("~/features/sessions/actions", () => ({
  changeSession: (...args: unknown[]) => changeSession(...args),
  cancelSession: (...args: unknown[]) => cancelSession(...args),
  setLiveStream: (...args: unknown[]) => setLiveStream(...args),
  createSessions: (...args: unknown[]) => createSessions(...args),
  previewSessions: vi.fn(),
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
  cancelledAt: null,
  ...over,
});

/** One session over, one planned with a link, one planned without, one cancelled. */
const course = (over: Record<string, unknown> = {}) => ({
  id: "c-1",
  title: "Bina ve İzhar Şerhi",
  version: 7,
  timeZone: "Europe/Istanbul",
  contentLocked: false,
  weeks: [
    {
      id: "w1",
      weekNumber: 1,
      title: "Birinci hafta",
      lessons: [lesson("l-1", "Hafta 1", "2026-09-28T21:00:00+03:00")],
    },
    {
      id: "w2",
      weekNumber: 2,
      title: "İkinci hafta",
      lessons: [
        lesson("l-2", "Hafta 2", "2026-10-05T21:00:00+03:00", {
          meetingUrl: "https://zoom.us/j/123456",
        }),
      ],
    },
    {
      id: "w3",
      weekNumber: 3,
      title: "Üçüncü hafta",
      lessons: [lesson("l-3", "Hafta 3", "2026-10-12T21:00:00+03:00")],
    },
    {
      id: "w4",
      weekNumber: 4,
      title: "Dördüncü hafta",
      lessons: [
        lesson("l-4", "Hafta 4", "2026-10-19T21:00:00+03:00", {
          cancelledAt: new Date("2026-10-01T10:00:00+03:00"),
        }),
      ],
    },
  ],
  ...over,
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
  const { SessionsPage } = await import(
    "~/features/sessions/components/sessions-page"
  );
  return wrap(<SessionsPage courseId="c-1" />);
};
const markup = async () => html(await element());
const mount = async () => {
  await render((await expand(await element())) as ReactElement);
  await settle(40);
};

const dialog = () => document.querySelector(".mds-dialog") as HTMLElement;
const toast = (tone: string) =>
  document.querySelector(`.mds-toast--${tone}`)?.textContent ?? "";
const byLabel = (label: string) =>
  document.querySelector(`[aria-label="${label}"]`) as HTMLElement;
const buttonIn = (root: ParentNode, label: string) =>
  [...root.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement;
/** happy-dom does not forward a click on the box to its input; the label does, as the browser's does. */
const toggleMakeUp = () =>
  click(dialog().querySelector("label.mds-choice") as Element);
const field = (name: string) =>
  document.querySelector(`input[name=${name}]`) as HTMLInputElement;
const editor = () =>
  document.querySelector('[data-testid="session-edit"]') as HTMLElement;
const save = () => buttonIn(editor(), "Kaydet");

const L2 = "5 Eki Pzt 21:00";
const L3 = "12 Eki Pzt 21:00";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00+03:00"));
  state.course = { status: "ok", data: course() };
  state.streams = {
    status: "ok",
    data: [
      {
        lessonId: "l-2",
        liveStreamUrl: "https://www.youtube.com/watch?v=abcdefghijk",
      },
    ],
  };
  state.viewer = { id: "u-1", timeZone: "Europe/Istanbul" };
  for (const fn of [
    refresh,
    changeSession,
    cancelSession,
    setLiveStream,
    createSessions,
  ]) {
    fn.mockReset();
  }
});
afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
});

describe("Celseler", () => {
  it("is headed with the course and the zone the times are on", async () => {
    const out = await markup();
    expect(out).toMatch(/<h1[^>]*>Celseler<\/h1>/);
    expect(textOf(out)).toContain(
      "Bina ve İzhar Şerhi dersinin bütün celseleri, tarihe göre. Saatler İstanbul saatiyle."
    );
  });

  it("writes the times on the viewer's clock, not the course's", async () => {
    state.viewer = { id: "u-1", timeZone: "Europe/Berlin" };
    const out = textOf(await markup());
    expect(out).toContain("Saatler Berlin saatiyle.");
    expect(out).toContain("5 Eki Pzt 20:00");
    expect(out).not.toContain(L2);
  });

  it("offers 'Celse planla' beside the title", async () => {
    const out = await markup();
    expect(out).toContain('href="/ders/c-1/celseler/planla"');
    expect(textOf(out)).toContain("Celse planla");
  });

  it("lists the upcoming sessions by date with their state, link and week, and counts them", async () => {
    const out = await markup();
    const upcoming = out.slice(
      out.indexOf('aria-labelledby="sessions-up"'),
      out.indexOf('aria-labelledby="sessions-past"')
    );
    const rows = upcoming.split("<tr").slice(2).map(textOf);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain("Hafta 2");
    expect(rows[0]).toContain(L2);
    expect(rows[0]).toContain("Zoom");
    expect(rows[0]).toContain("Planlandı");
    expect(rows[1]).toContain(L3);
    expect(rows[1]).toContain("Eklenmedi");
    expect(rows[2]).toContain("İptal edildi");
    expect(textOf(upcoming)).toContain("3 celse · 1 iptal edildi · Hafta 2–4");
  });

  it("hides a cancelled session's links and gives it no buttons", async () => {
    const out = await markup();
    const rows = out
      .slice(out.indexOf('aria-labelledby="sessions-up"'))
      .split("<tr")
      .slice(2)
      .map(textOf);
    expect(rows[2]).toContain("Bağlantı gösterilmez");
    expect(rows[2]).toContain("İşlem yok");
    expect(rows[2]).not.toContain("Bağlantı ekle");
  });

  it("lists the past sessions below, newest first", async () => {
    const out = await markup();
    const past = out.slice(out.indexOf('aria-labelledby="sessions-past"'));
    expect(textOf(past)).toContain("Geçmiş celseler");
    expect(textOf(past)).toContain("Hafta 1");
    expect(textOf(past)).toContain("Sona erdi");
  });

  it("names the button of a row by the session it is on, 'ekle' without a link and 'güncelle' with one", async () => {
    const out = await markup();
    expect(out).toContain(
      `aria-label="${L2} celsesinin bağlantısını güncelle"`
    );
    expect(out).toContain(`aria-label="${L3} celsesine bağlantı ekle"`);
    expect(out).toContain(`aria-label="${L3} celsesini iptal et"`);
    expect(out).toContain(`aria-label="${L3} celsesinin tarihini değiştir"`);
  });

  it("shows the live stream column and buttons to whoever may set the link", async () => {
    const out = await markup();
    expect(textOf(out)).toContain("Canlı yayın");
    expect(out).toContain(
      `aria-label="${L2} celsesinin canlı yayın bağlantısını güncelle"`
    );
    expect(out).toContain(
      `aria-label="${L3} celsesine canlı yayın bağlantısı ekle"`
    );
    expect(out).toContain('data-testid="stream-set"');
  });

  it("leaves the live stream column and buttons out when the links are refused or cannot be read", async () => {
    for (const streams of [{ status: "forbidden" }, { status: "failed" }]) {
      state.streams = streams as Answer<unknown>;
      const out = await markup();
      expect(textOf(out)).not.toContain("Canlı yayın");
      expect(out).not.toContain("canlı yayın bağlantısı");
      // the rest of the page stays
      expect(out).toContain(
        `aria-label="${L2} celsesinin bağlantısını güncelle"`
      );
    }
  });

  it("says there are no sessions, and where to add them, for a course without any", async () => {
    state.course = { status: "ok", data: course({ weeks: [] }) };
    const out = textOf(await markup());
    expect(out).toContain("Bu derste henüz celse yok");
    expect(out).toContain(
      "“Celse planla” ile tek bir celse ya da haftalık tekrar ekleyin."
    );
  });

  it("is the 'Bu sayfaya izniniz yok' state when the API refuses the course", async () => {
    state.course = { status: "forbidden" };
    const out = textOf(await markup());
    expect(out).toContain("Bu sayfaya izniniz yok");
    expect(out).not.toContain("Celse planla");
    expect(out).not.toContain("Yaklaşan celseler");
  });

  it("is that state too when the course comes without its content, which is how the API says the caller is not course staff", async () => {
    state.course = { status: "ok", data: course({ contentLocked: true }) };
    const out = textOf(await markup());
    expect(out).toContain("Bu sayfaya izniniz yok");
    expect(out).not.toContain("Celse planla");
    expect(out).not.toContain("Yaklaşan celseler");
  });

  it("is the retry state, not 'no access', when the course cannot be read", async () => {
    state.course = { status: "failed" };
    const out = textOf(await markup());
    expect(out).toContain("Celseler okunamadı");
    expect(out).toContain("Yeniden dene");
    expect(out).not.toContain("izniniz yok");
  });

  it("is bars while the course is read", async () => {
    const { SessionsLoading } = await import(
      "~/features/sessions/components/sessions-page"
    );
    const out = await html(<SessionsLoading />);
    expect(out).toContain('aria-busy="true"');
    expect(textOf(out)).toBe("Yükleniyor");
  });
});

describe("the link of a session", () => {
  const open = async (label = `${L3} celsesine bağlantı ekle`) => {
    await mount();
    await click(byLabel(label));
    await settle(40);
  };

  it("is changed alone, at the course version, on https, and the page is read again", async () => {
    changeSession.mockResolvedValue({
      success: true,
      data: { courseVersion: 8 },
    });
    await open();
    await typeInto(field("meetingUrl"), "zoom.us/j/999");
    await click(save());
    await settle(60);

    expect(changeSession).toHaveBeenCalledExactlyOnceWith("l-3", {
      version: 7,
      meetingUrl: "https://zoom.us/j/999",
    });
    expect(toast("success")).toContain("Bağlantı kaydedildi");
    expect(refresh).toHaveBeenCalledOnce();
    expect(editor()).toBeNull();
  });

  it("starts from the link the session has", async () => {
    await open(`${L2} celsesinin bağlantısını güncelle`);
    expect(field("meetingUrl").value).toBe("https://zoom.us/j/123456");
  });

  it("is refused before anything is sent when it is not https or is empty", async () => {
    await open();
    await typeInto(field("meetingUrl"), "http://zoom.us/j/1");
    await click(save());
    await settle(40);
    expect(editor().textContent).toContain(
      "Toplantı bağlantısı https:// ile başlamalı."
    );
    await typeInto(field("meetingUrl"), "");
    await click(save());
    await settle(40);
    expect(changeSession).not.toHaveBeenCalled();
  });

  it("carries the version a write left, so the next one is not stale", async () => {
    changeSession.mockResolvedValue({
      success: true,
      data: { courseVersion: 8 },
    });
    cancelSession.mockResolvedValue({
      success: true,
      data: { courseVersion: 9 },
    });
    await open();
    await typeInto(field("meetingUrl"), "https://meet.google.com/abc-defg-hij");
    await click(save());
    await settle(60);
    await click(byLabel(`${L3} celsesini iptal et`));
    await settle(60);
    await click(buttonIn(dialog(), "Celseyi iptal et"));
    await settle(80);
    expect(cancelSession).toHaveBeenCalledExactlyOnceWith("l-3", 8);
  });

  it("is told apart from an authorization refusal: the sentence says the caller may not, and nothing is read again", async () => {
    changeSession.mockResolvedValue({
      success: false,
      code: "AUTHZ_FORBIDDEN",
    });
    await open();
    await typeInto(field("meetingUrl"), "https://zoom.us/j/999");
    await click(save());
    await settle(60);
    expect(toast("error")).toContain("İşlem yapılamadı");
    expect(toast("error")).toContain("Bunu yapma izniniz yok.");
    expect(editor()).not.toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("says somebody saved the course first on a 409, and reads the page again for the new version", async () => {
    changeSession.mockResolvedValue({
      success: false,
      code: "COURSE_VERSION_CONFLICT",
    });
    await open();
    await typeInto(field("meetingUrl"), "https://zoom.us/j/999");
    await click(save());
    await settle(60);
    expect(toast("error")).toContain("başkası tarafından kaydedildi");
    expect(refresh).toHaveBeenCalledOnce();
  });
});

describe("the time of a session", () => {
  it("starts from the session's date and time on the viewer's clock and is saved as the instant they name", async () => {
    state.viewer = { id: "u-1", timeZone: "Europe/Berlin" };
    changeSession.mockResolvedValue({
      success: true,
      data: { courseVersion: 8 },
    });
    await mount();
    await click(byLabel("12 Eki Pzt 20:00 celsesinin tarihini değiştir"));
    await settle(40);
    expect(field("date").value).toBe("2026-10-12");
    expect(field("time").value).toBe("20:00");

    await typeInto(field("date"), "2026-10-14");
    await typeInto(field("time"), "19:30");
    await click(save());
    await settle(60);

    expect(changeSession).toHaveBeenCalledExactlyOnceWith("l-3", {
      version: 7,
      scheduledAt: "2026-10-14T17:30:00.000Z",
    });
    expect(toast("success")).toContain("Celse zamanı değişti");
  });

  it("asks for the date and the time when one is empty", async () => {
    await mount();
    await click(byLabel(`${L3} celsesinin tarihini değiştir`));
    await settle(40);
    await typeInto(field("time"), "");
    await click(save());
    await settle(40);
    expect(editor().textContent).toContain("Tarihi ve saati girin.");
    expect(changeSession).not.toHaveBeenCalled();
  });

  it("is not offered for a session that is live or cancelled", async () => {
    vi.setSystemTime(new Date("2026-10-05T21:10:00+03:00"));
    const out = await markup();
    expect(out).not.toContain(`${L2} celsesinin tarihini değiştir`);
    expect(out).toContain(`${L2} celsesinin bağlantısını güncelle`);
    expect(textOf(out)).toContain("Şu an canlı");
    expect(textOf(out)).toContain("10 dakikadır sürüyor");
  });
});

describe("İptal et", () => {
  const open = async () => {
    await mount();
    await click(byLabel(`${L3} celsesini iptal et`));
    await settle(60);
  };

  it("keeps the session in the programme: it is cancelled at the course version and the page is read again", async () => {
    cancelSession.mockResolvedValue({
      success: true,
      data: { courseVersion: 8 },
    });
    await open();
    expect(dialog().textContent).toContain("12 Ekim 2026 Pazartesi 21:00");
    expect(dialog().textContent).toContain(
      "İptal edilen celse programda kalır."
    );
    await click(buttonIn(dialog(), "Celseyi iptal et"));
    await settle(80);

    expect(cancelSession).toHaveBeenCalledExactlyOnceWith("l-3", 7);
    expect(createSessions).not.toHaveBeenCalled();
    expect(toast("success")).toContain("Celse iptal edildi");
    expect(toast("success")).toContain("Hafta 3 iptal edildi.");
    expect(refresh).toHaveBeenCalledOnce();
    expect(dialog()).toBeNull();
  });

  it("adds no make-up unless asked, and shows its fields only then", async () => {
    await open();
    expect(document.querySelector('[data-testid="make-up"]')).toBeNull();
    await toggleMakeUp();
    await settle(40);
    expect(document.querySelector('[data-testid="make-up"]')).not.toBeNull();
    // a week later, at the same time
    expect(field("makeUpDate").value).toBe("2026-10-19");
    expect(field("makeUpTime").value).toBe("21:00");
  });

  it("cancels, then adds the make-up as a session of the same length and says both", async () => {
    cancelSession.mockResolvedValue({
      success: true,
      data: { courseVersion: 8 },
    });
    createSessions.mockResolvedValue({ success: true, data: { count: 1 } });
    await open();
    await toggleMakeUp();
    await settle(40);
    await typeInto(field("makeUpDate"), "2026-10-14");
    await typeInto(field("makeUpTime"), "20:30");
    await click(buttonIn(dialog(), "Celseyi iptal et"));
    await settle(100);

    expect(cancelSession).toHaveBeenCalledExactlyOnceWith("l-3", 7);
    expect(createSessions).toHaveBeenCalledExactlyOnceWith("c-1", {
      weekdays: [3],
      startTime: "20:30",
      timeZone: "Europe/Istanbul",
      startDate: "2026-10-14",
      count: 1,
      title: "Hafta 3 (telafi)",
      durationMinutes: 60,
    });
    expect(toast("success")).toContain(
      "Hafta 3 iptal edildi; telafi celsesi eklendi."
    );
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("asks for the make-up's date before it cancels anything", async () => {
    await open();
    await toggleMakeUp();
    await settle(40);
    await typeInto(field("makeUpDate"), "");
    await click(buttonIn(dialog(), "Celseyi iptal et"));
    await settle(60);
    expect(dialog().textContent).toContain("Tarihi ve saati girin.");
    expect(cancelSession).not.toHaveBeenCalled();
  });

  it("says the session is cancelled but the make-up is not, when only the second call fails", async () => {
    cancelSession.mockResolvedValue({
      success: true,
      data: { courseVersion: 8 },
    });
    createSessions.mockResolvedValue({
      success: false,
      code: "INVALID_SESSION_PATTERN",
    });
    await open();
    await toggleMakeUp();
    await settle(40);
    await click(buttonIn(dialog(), "Celseyi iptal et"));
    await settle(100);

    expect(toast("error")).toContain(
      "Celse iptal edildi, telafi celsesi eklenemedi"
    );
    expect(toast("error")).toContain("geçerli bir celse üretmiyor");
    // the cancellation stands, so the list is read again
    expect(refresh).toHaveBeenCalledOnce();
    expect(dialog()).toBeNull();
  });

  it("adds no make-up for a cancellation that was refused", async () => {
    cancelSession.mockResolvedValue({
      success: false,
      code: "LESSON_ALREADY_CANCELLED",
    });
    await open();
    await toggleMakeUp();
    await settle(40);
    await click(buttonIn(dialog(), "Celseyi iptal et"));
    await settle(80);
    expect(createSessions).not.toHaveBeenCalled();
    expect(toast("error")).toContain("Bu celse zaten iptal edilmiş.");
    expect(dialog()).not.toBeNull();
  });

  it("closes on 'Vazgeç' without sending anything", async () => {
    await open();
    await click(buttonIn(dialog(), "Vazgeç"));
    await settle(60);
    expect(dialog()).toBeNull();
    expect(cancelSession).not.toHaveBeenCalled();
  });
});

describe("the live stream link", () => {
  const open = async (label: string) => {
    await mount();
    await click(byLabel(label));
    await settle(40);
  };

  it("is checked with tedrisat's own parser before it is sent, and says what is wrong", async () => {
    await open(`${L3} celsesine canlı yayın bağlantısı ekle`);
    await typeInto(field("liveStreamUrl"), "https://www.youtube.com/@medaris");
    await click(save());
    await settle(40);
    expect(editor().textContent).toContain("Bu bir kanal bağlantısı");
    await typeInto(field("liveStreamUrl"), "https://zoom.us/j/1");
    await click(save());
    await settle(40);
    expect(editor().textContent).toContain(
      "Canlı yayın yalnız YouTube’dan eklenebilir."
    );
    expect(setLiveStream).not.toHaveBeenCalled();
  });

  it("is set without the course version and shows as added at once", async () => {
    setLiveStream.mockResolvedValue({
      success: true,
      data: { liveStreamUrl: "https://www.youtube.com/watch?v=zyxwvutsrqp" },
    });
    await open(`${L3} celsesine canlı yayın bağlantısı ekle`);
    await typeInto(field("liveStreamUrl"), "https://youtu.be/zyxwvutsrqp");
    await click(save());
    await settle(60);

    // tedrisat's parser writes the link in the one form it stores
    expect(setLiveStream).toHaveBeenCalledExactlyOnceWith(
      "l-3",
      "https://www.youtube.com/live/zyxwvutsrqp"
    );
    expect(toast("success")).toContain("Canlı yayın bağlantısı kaydedildi");
    expect(
      document.querySelectorAll('[data-testid="stream-set"]')
    ).toHaveLength(2);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("is removed with its own button, and only where there is a link", async () => {
    setLiveStream.mockResolvedValue({
      success: true,
      data: { liveStreamUrl: null },
    });
    await open(`${L3} celsesine canlı yayın bağlantısı ekle`);
    expect(buttonIn(editor(), "Bağlantıyı kaldır")).toBeUndefined();
    await click(buttonIn(editor(), "Vazgeç"));
    await settle(40);
    await click(byLabel(`${L2} celsesinin canlı yayın bağlantısını güncelle`));
    await settle(40);
    await click(buttonIn(editor(), "Bağlantıyı kaldır"));
    await settle(60);

    expect(setLiveStream).toHaveBeenCalledExactlyOnceWith("l-2", null);
    expect(toast("success")).toContain("Canlı yayın bağlantısı kaldırıldı");
    expect(
      document.querySelectorAll('[data-testid="stream-set"]')
    ).toHaveLength(0);
  });

  it("is refused for whoever does not hold session.live_link, in words", async () => {
    setLiveStream.mockResolvedValue({
      success: false,
      code: "AUTHZ_FORBIDDEN",
    });
    await open(`${L3} celsesine canlı yayın bağlantısı ekle`);
    await typeInto(field("liveStreamUrl"), "https://youtu.be/zyxwvutsrqp");
    await click(save());
    await settle(60);
    expect(toast("error")).toContain("Bunu yapma izniniz yok.");
    expect(
      document.querySelectorAll('[data-testid="stream-set"]')
    ).toHaveLength(1);
  });

  it("is refused for a session that is not live or is cancelled, in the stream's own words", async () => {
    setLiveStream.mockResolvedValue({
      success: false,
      code: "LESSON_NOT_LIVE",
    });
    await open(`${L3} celsesine canlı yayın bağlantısı ekle`);
    await typeInto(field("liveStreamUrl"), "https://youtu.be/zyxwvutsrqp");
    await click(save());
    await settle(60);
    expect(toast("error")).toContain(
      "Yalnız canlı celselere yayın bağlantısı eklenebilir."
    );
  });
});
