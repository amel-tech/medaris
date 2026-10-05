// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, render, settle, type as typeInto } from "./dom";
import { expand, html, textOf, translatorFor } from "./server-render";

/**
 * Ders kayıtları of a course as the server renders it, and what can be done on
 * it: add a recording by pasting a link, change one. The reads, the viewer and
 * the actions are stubs; what is under test is what the page does with each
 * answer.
 */
type Answer<T> =
  | { status: "ok"; data: T }
  | { status: "forbidden" }
  | { status: "failed" };

const state = {
  course: { status: "failed" } as Answer<unknown>,
  recordings: { status: "failed" } as Answer<unknown>,
  viewer: { id: "u-1", timeZone: "Europe/Istanbul" } as unknown,
  permissions: { status: "failed" } as Answer<unknown>,
};
const refresh = vi.fn();
const addRecording = vi.fn();
const changeRecording = vi.fn();

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
      lessons: { listCourseRecordings: async () => {} },
    });
    if (what.includes("holds in the course")) return state.permissions;
    return what.includes("recordings") ? state.recordings : state.course;
  },
}));
vi.mock("~/features/account/reads", () => ({
  getViewer: async () => state.viewer,
}));
vi.mock("~/features/recordings/actions", () => ({
  addRecording: (...args: unknown[]) => addRecording(...args),
  changeRecording: (...args: unknown[]) => changeRecording(...args),
}));

const lesson = (id: string, title: string, at: string, over = {}) => ({
  id,
  title,
  type: "LIVE",
  scheduledAt: new Date(at),
  cancelledAt: null,
  ...over,
});

const ZOOM = "https://us02web.zoom.us/rec/share/abc123";
const VIDEO = "b2470000-0000-4000-8000-000000000001";
/** A Bunny player link as tedrisat hands it out: signed for this read. */
const SIGNED = `https://player.mediadelivery.net/embed/424242/${VIDEO}?token=${"a".repeat(64)}&expires=1791300000`;

/** Two weeks: the first has three recorded sessions, the second one that has begun, one ahead and one cancelled. */
const course = (over: Record<string, unknown> = {}) => ({
  id: "c-1",
  title: "Bina ve İzhar Şerhi",
  contentLocked: false,
  isClosed: false,
  weeks: [
    {
      id: "w1",
      weekNumber: 1,
      title: "Birinci hafta",
      lessons: [
        lesson("l-1", "Hafta 1", "2026-09-28T21:00:00+03:00"),
        lesson("l-5", "Hafta 1b", "2026-09-29T21:00:00+03:00"),
        lesson("l-6", "Hafta 1c", "2026-09-30T21:00:00+03:00"),
      ],
    },
    {
      id: "w2",
      weekNumber: 2,
      title: "",
      lessons: [
        lesson("l-2", "Hafta 2", "2026-10-05T21:00:00+03:00"),
        lesson("l-3", "Hafta 2b", "2026-10-12T21:00:00+03:00"),
        lesson("l-4", "Hafta 2c", "2026-10-07T21:00:00+03:00", {
          cancelledAt: new Date("2026-10-01T10:00:00+03:00"),
        }),
      ],
    },
  ],
  ...over,
});

const recording = (lessonId: string, over = {}) => ({
  id: `r-${lessonId}`,
  lessonId,
  weekId: "w",
  weekNumber: 1,
  weekTitle: "Hafta",
  title: `Kayıt ${lessonId}`,
  recordedAt: undefined,
  durationMinutes: undefined,
  provider: "OTHER",
  url: ZOOM,
  visibility: "ENROLLED",
  status: "READY",
  ...over,
});

const recordings = () => [
  recording("l-1"),
  recording("l-5", {
    provider: "YOUTUBE",
    url: "https://www.youtube.com/watch?v=abcdefghijk",
    visibility: "PUBLIC",
  }),
  recording("l-6", { status: "PROCESSING", url: undefined }),
];

/** What the caller holds in the course, as `GET /courses/:id/my-permissions` answers. */
const holding = (...codes: string[]): Answer<unknown> => ({
  status: "ok",
  data: { permissions: ["course.view", ...codes], staffRead: false },
});

const wrap = (node: React.ReactNode) => (
  <NextIntlClientProvider
    locale="tr"
    timeZone="Europe/Istanbul"
    messages={{ nazar: resources.tr.nazar }}
  >
    <ToastProvider>
      {node}
      <Toaster />
    </ToastProvider>
  </NextIntlClientProvider>
);

const element = async () => {
  const { RecordingsPage } = await import(
    "~/features/recordings/components/recordings-page"
  );
  return wrap(<RecordingsPage courseId="c-1" />);
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
const field = (name: string) =>
  dialog().querySelector(`[name="${name}"]`) as HTMLInputElement;
/** happy-dom does not forward a click on the box to its input; the label does, as the browser's does. */
const toggle = () =>
  click(dialog().querySelector("label.mds-choice") as Element);
const switchBox = () =>
  dialog().querySelector('[role="switch"]') as HTMLElement;
const submit = async (label: string) => {
  await click(buttonIn(dialog(), label));
  await settle(20);
};
const rowOf = (out: string, title: string) =>
  out
    .split("<tr")
    .slice(1)
    .find((row) => textOf(row).includes(title)) ?? "";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T12:00:00+03:00"));
  state.course = { status: "ok", data: course() };
  state.recordings = { status: "ok", data: recordings() };
  state.viewer = { id: "u-1", timeZone: "Europe/Istanbul" };
  state.permissions = holding("recording.manage");
  for (const fn of [refresh, addRecording, changeRecording]) fn.mockReset();
  addRecording.mockResolvedValue({ success: true, data: { id: "r-new" } });
  changeRecording.mockResolvedValue({ success: true, data: { id: "r-l-1" } });
});
afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
});

describe("Ders kayıtları", () => {
  it("is headed with the course, says there is no upload, and counts the sessions with and without a recording", async () => {
    const out = await markup();
    expect(out).toMatch(/<h1[^>]*>Ders kayıtları<\/h1>/);
    const text = textOf(out);
    expect(text).toContain(
      "Bina ve İzhar Şerhi dersinin kayıtları, haftalara göre."
    );
    expect(text).toContain("Burada yükleme yoktur");
    expect(text).toContain("3 celsenin kaydı var, 1 celsenin yok.");
  });

  it("lists the weeks newest first, each with its own table", async () => {
    const out = await markup();
    const first = out.indexOf('aria-labelledby="week-w2"');
    const second = out.indexOf('aria-labelledby="week-w1"');
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(textOf(out)).toContain("Hafta 2 ");
    expect(textOf(out)).toContain("Hafta 1 · Birinci hafta");
  });

  it("shows each recording with its title, where it lives, whether it plays, and who may watch", async () => {
    const out = await markup();
    const zoom = textOf(rowOf(out, "Kayıt l-1"));
    expect(zoom).toContain("us02web.zoom.us");
    expect(zoom).toContain("Hazır");
    expect(zoom).toContain("Kayıtlı talebe");
    const youtube = rowOf(out, "Kayıt l-5");
    expect(youtube).toContain("mds-platform-chip--youtube");
    expect(textOf(youtube)).toContain("Herkese açık");
  });

  it("shows a Bunny recording by its host, as the kit has no Bunny chip, and an upload still processing as such", async () => {
    state.recordings = {
      status: "ok",
      data: [
        recording("l-1", { provider: "BUNNY", url: SIGNED }),
        recording("l-6", {
          provider: "BUNNY",
          status: "PROCESSING",
          url: undefined,
        }),
      ],
    };
    const out = await markup();
    const ready = rowOf(out, "Kayıt l-1");
    expect(textOf(ready)).toContain("player.mediadelivery.net");
    expect(textOf(ready)).toContain("Hazır");
    expect(ready).toContain(`href="${SIGNED.replaceAll("&", "&amp;")}"`);
    const processing = textOf(rowOf(out, "Kayıt l-6"));
    expect(processing).toContain("Hazırlanıyor");
    expect(processing).toContain("Bağlantı yok");
    expect(rowOf(out, "Kayıt l-6")).not.toContain("href=");
  });

  it("opens a link in a new tab, and says there is none while a recording is processing", async () => {
    const out = await markup();
    const zoom = rowOf(out, "Kayıt l-1");
    expect(zoom).toContain(`href="${ZOOM}"`);
    expect(zoom).toContain('target="_blank"');
    expect(zoom).toContain('rel="noopener noreferrer"');
    const processing = textOf(rowOf(out, "Kayıt l-6"));
    expect(processing).toContain("Hazırlanıyor");
    expect(processing).toContain("Bağlantı yok");
    expect(rowOf(out, "Kayıt l-6")).not.toContain("href=");
  });

  it("offers 'Kayıt ekle' only to a session that has begun and has none, and 'Düzenle' to a recording", async () => {
    const out = await markup();
    expect(out).toContain('aria-label="Kayıt ekle: Hafta 2"');
    expect(out).not.toContain('aria-label="Kayıt ekle: Hafta 2b"');
    expect(out).not.toContain('aria-label="Kayıt ekle: Hafta 2c"');
    expect(out).toContain('aria-label="Kaydı düzenle: Hafta 1"');
    expect(textOf(rowOf(out, "Hafta 2b"))).toContain("Celse henüz yapılmadı");
    // a cancelled session with nothing to record is not listed at all
    expect(out).not.toContain("Hafta 2c");
  });

  it("lists a cancelled session that still holds a recording", async () => {
    state.recordings = {
      status: "ok",
      data: [...recordings(), recording("l-4")],
    };
    const out = await markup();
    expect(out).toContain('aria-label="Kaydı düzenle: Hafta 2c"');
  });

  it("writes a session's time on the viewer's clock", async () => {
    state.viewer = { id: "u-1", timeZone: "Europe/Berlin" };
    expect(textOf(await markup())).toContain("5 Eki Pzt 20:00");
  });

  it("says there are no sessions, and where to plan them, for a course without any", async () => {
    state.course = { status: "ok", data: course({ weeks: [] }) };
    state.recordings = { status: "ok", data: [] };
    const out = textOf(await markup());
    expect(out).toContain("Bu derste henüz celse yok");
    expect(out).toContain("önce Celseler sayfasından celse planlayın");
  });

  it("is the 'Bu sayfaya izniniz yok' state when the API refuses the course", async () => {
    state.course = { status: "forbidden" };
    const out = textOf(await markup());
    expect(out).toContain("Bu sayfaya izniniz yok");
    expect(out).not.toContain("Kayıt ekle");
  });

  it("is that state for a caller who does not hold recording.manage, whatever else they hold, even on a course read in full", async () => {
    for (const held of [
      [],
      ["course.view_details", "course.edit", "session.manage"],
      ["session.live_link", "enrollment.decide"],
    ]) {
      state.permissions = holding(...held);
      const out = textOf(await markup());
      expect(out).toContain("Bu sayfaya izniniz yok");
      expect(out).not.toContain("Hafta 1");
      expect(out).not.toContain("Burada yükleme yoktur");
      expect(out).not.toContain("Kayıt ekle");
    }
  });

  it("is that state when the permissions read is refused", async () => {
    state.permissions = { status: "forbidden" };
    expect(textOf(await markup())).toContain("Bu sayfaya izniniz yok");
  });

  it("opens for a ders nazırı who holds recording.manage, and does not take a locked course for a refusal", async () => {
    state.course = { status: "ok", data: course({ contentLocked: true }) };
    state.permissions = holding("recording.manage");
    const out = textOf(await markup());
    expect(out).not.toContain("izniniz yok");
    expect(out).toContain("Burada yükleme yoktur");
    expect(out).toContain("Kayıt ekle");
  });

  it("lists an ENROLLED recording to the holder, with its title and who may watch, and offers its edit", async () => {
    const out = await markup();
    expect(textOf(rowOf(out, "Kayıt l-1"))).toContain("Kayıtlı talebe");
    expect(out).toContain('aria-label="Kaydı düzenle: Hafta 1"');
  });

  it("is the retry state, not 'no access', when the permissions cannot be read", async () => {
    state.permissions = { status: "failed" };
    const out = textOf(await markup());
    expect(out).toContain("Ders kayıtları okunamadı");
    expect(out).toContain("Yeniden dene");
    expect(out).not.toContain("izniniz yok");
    expect(out).not.toContain("Kayıt ekle");
  });

  it("is the retry state, not 'no access', when the course or the recordings cannot be read", async () => {
    for (const which of ["course", "recordings"] as const) {
      state.course = { status: "ok", data: course() };
      state.recordings = { status: "ok", data: recordings() };
      state[which] = { status: "failed" };
      const out = textOf(await markup());
      expect(out, which).toContain("Ders kayıtları okunamadı");
      expect(out, which).toContain("Yeniden dene");
      expect(out, which).not.toContain("izniniz yok");
    }
  });

  it("is bars while the course is read", async () => {
    const { RecordingsLoading } = await import(
      "~/features/recordings/components/recordings-page"
    );
    const out = await html(<RecordingsLoading />);
    expect(out).toContain('aria-busy="true"');
    expect(textOf(out)).toBe("Yükleniyor");
  });
});

describe("Kayıt ekle", () => {
  const open = async () => {
    await mount();
    await click(byLabel("Kayıt ekle: Hafta 2"));
    await settle(20);
  };

  it("opens a form for the session, titled from its name, with the switch off", async () => {
    await open();
    expect(dialog().textContent).toContain("Kayıt ekle");
    expect(field("title").value).toBe("Hafta 2 kaydı");
    expect(field("url").value).toBe("");
    expect(switchBox().getAttribute("aria-checked")).toBe("false");
  });

  it("adds a pasted link, closed to everyone but the course, and reads the page again", async () => {
    await open();
    await typeInto(field("url"), `  ${ZOOM} `);
    await submit("Kaydı ekle");
    expect(addRecording).toHaveBeenCalledWith("l-2", {
      title: "Hafta 2 kaydı",
      url: ZOOM,
      visibility: "ENROLLED",
    });
    expect(toast("success")).toContain("Kayıt eklendi");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
  });

  it("adds a public recording when the switch is turned on", async () => {
    await open();
    await typeInto(field("title"), "Birinci celse");
    await typeInto(field("url"), "drive.google.com/file/d/xyz/view");
    await toggle();
    await submit("Kaydı ekle");
    expect(addRecording).toHaveBeenCalledWith("l-2", {
      title: "Birinci celse",
      url: "https://drive.google.com/file/d/xyz/view",
      visibility: "PUBLIC",
    });
  });

  it("names the provider as the link is typed", async () => {
    await open();
    await typeInto(field("url"), "https://youtu.be/abcdefghijk");
    expect(
      dialog().querySelector(".mds-platform-chip--youtube")
    ).not.toBeNull();
    await typeInto(field("url"), "https://drive.google.com/file/d/xyz/view");
    expect(
      dialog().querySelector(".mds-platform-chip--google-drive")
    ).not.toBeNull();
  });

  it("takes a YouTube link with the switch off, closed to everyone but the course", async () => {
    await open();
    await typeInto(field("url"), "https://youtu.be/abcdefghijk");
    expect(switchBox().hasAttribute("data-disabled")).toBe(false);
    expect(dialog().textContent).not.toContain("YouTube yalnızca");
    await submit("Kaydı ekle");
    expect(addRecording).toHaveBeenCalledWith("l-2", {
      title: "Hafta 2 kaydı",
      url: "https://youtu.be/abcdefghijk",
      visibility: "ENROLLED",
    });
  });

  it("shows the host of a Bunny player link as it is typed, Bunny having no chip of its own", async () => {
    await open();
    await typeInto(
      field("url"),
      `player.mediadelivery.net/embed/424242/${VIDEO}`
    );
    const chip = dialog().querySelector(".mds-platform-chip--bunny");
    expect(chip?.textContent).toContain("player.mediadelivery.net");
    expect(chip?.getAttribute("role")).toBe("status");
    await typeInto(field("url"), ZOOM);
    expect(dialog().querySelector(".mds-platform-chip--bunny")).toBeNull();
  });

  it.each([
    [
      "bunny-video-used",
      "Bu Bunny videosu başka bir celsenin kaydı olarak ekli.",
    ],
    [
      "bunny-foreign-library",
      "Bu Bunny videosu Medaris’in video kütüphanesinde değil.",
    ],
    ["youtube-no-video", "YouTube bağlantısı bir videoyu göstermiyor"],
    ["something-new", "Bağlantı okunamadı."],
  ])("words a link tedrisat cannot store (%s) from its reason, and keeps the form", async (reason, sentence) => {
    addRecording.mockResolvedValue({
      success: false,
      code: "RECORDING_LINK_INVALID",
      reason,
    });
    await open();
    await typeInto(field("url"), `player.mediadelivery.net/embed/1/${VIDEO}`);
    await submit("Kaydı ekle");
    expect(toast("error")).toContain("Kayıt kaydedilemedi");
    expect(toast("error")).toContain(sentence);
    expect(dialog()).not.toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not send a form with a problem, and says where", async () => {
    await open();
    await typeInto(field("title"), " ");
    await submit("Kaydı ekle");
    expect(dialog().textContent).toContain("Başlığı yazın.");
    expect(dialog().textContent).toContain("Bağlantıyı yapıştırın.");
    await typeInto(field("url"), "http://zoom.us/rec/1");
    expect(dialog().textContent).toContain("https:// ile başlamalı");
    expect(addRecording).not.toHaveBeenCalled();
  });

  it("locks the switch off in a closed course, and says why", async () => {
    state.course = { status: "ok", data: course({ isClosed: true }) };
    await open();
    expect(switchBox().hasAttribute("data-disabled")).toBe(true);
    expect(dialog().textContent).toContain(
      "Kapalı derste kayıtlar herkese açılmaz."
    );
  });

  it("words a refusal from its code and keeps the form", async () => {
    addRecording.mockResolvedValue({ success: false, code: "AUTHZ_FORBIDDEN" });
    await open();
    await typeInto(field("url"), ZOOM);
    await submit("Kaydı ekle");
    expect(toast("error")).toContain("Kayıt kaydedilemedi");
    expect(toast("error")).toContain("Bunu yapma izniniz yok.");
    expect(dialog()).not.toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("closes and reads the page again when the session has a recording by now", async () => {
    addRecording.mockResolvedValue({
      success: false,
      code: "RECORDING_EXISTS",
    });
    await open();
    await typeInto(field("url"), ZOOM);
    await submit("Kaydı ekle");
    expect(toast("error")).toContain("zaten bir kaydı var");
    expect(dialog()).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("words any other refusal in general terms, never with the server's message", async () => {
    addRecording.mockResolvedValue({ success: false, code: "" });
    await open();
    await typeInto(field("url"), ZOOM);
    await submit("Kaydı ekle");
    expect(toast("error")).toContain("Bir şeyler ters gitti.");
  });
});

describe("Düzenle", () => {
  const open = async (label: string) => {
    await mount();
    await click(byLabel(label));
    await settle(20);
  };

  it("opens the form with what the recording holds", async () => {
    await open("Kaydı düzenle: Hafta 1");
    expect(dialog().textContent).toContain("Kaydı düzenle");
    expect(field("title").value).toBe("Kayıt l-1");
    expect(field("url").value).toBe(ZOOM);
    expect(switchBox().getAttribute("aria-checked")).toBe("false");
  });

  it("sends only what changed", async () => {
    await open("Kaydı düzenle: Hafta 1");
    await typeInto(field("title"), "Birinci celse");
    await submit("Kaydet");
    expect(changeRecording).toHaveBeenCalledWith("r-l-1", {
      title: "Birinci celse",
    });
    expect(toast("success")).toContain("Kayıt kaydedildi");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("replaces the link, and opens the recording to everyone", async () => {
    await open("Kaydı düzenle: Hafta 1");
    await typeInto(field("url"), "https://drive.google.com/file/d/xyz/view");
    await toggle();
    await submit("Kaydet");
    expect(changeRecording).toHaveBeenCalledWith("r-l-1", {
      url: "https://drive.google.com/file/d/xyz/view",
      visibility: "PUBLIC",
    });
  });

  it("closes without writing when nothing changed", async () => {
    await open("Kaydı düzenle: Hafta 1");
    await submit("Kaydet");
    expect(changeRecording).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });

  it("closes a public YouTube recording to everyone but the course", async () => {
    await open("Kaydı düzenle: Hafta 1b");
    expect(switchBox().getAttribute("aria-checked")).toBe("true");
    expect(switchBox().hasAttribute("data-disabled")).toBe(false);
    await toggle();
    await submit("Kaydet");
    expect(changeRecording).toHaveBeenCalledWith("r-l-5", {
      visibility: "ENROLLED",
    });
  });

  it("starts a recording that is still processing with an empty link", async () => {
    await open("Kaydı düzenle: Hafta 1c");
    expect(field("url").value).toBe("");
  });

  it("closes and reads the page again when the recording is gone", async () => {
    changeRecording.mockResolvedValue({
      success: false,
      code: "RECORDING_NOT_FOUND",
    });
    await open("Kaydı düzenle: Hafta 1");
    await typeInto(field("title"), "Yeni");
    await submit("Kaydet");
    expect(toast("error")).toContain("artık yok");
    expect(dialog()).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
