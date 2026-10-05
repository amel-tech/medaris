// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { act, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadFingerprint } from "~/features/recordings/bunny-upload";
import {
  PENDING_REFRESH_MS,
  useRefreshWhile,
} from "~/features/recordings/use-refresh-while";
import { cleanup, click, key, render, settle, type as typeInto } from "./dom";
import { expand, html, textOf, translatorFor } from "./server-render";

/**
 * "Bunny’ye yükle" on Ders kayıtları: the two tabs of "Kayıt ekle", which of
 * them a caller sees, the upload from the file to Bunny with its progress, a
 * stop, a resume and a refusal, "Devam et" on an upload left halfway, and the
 * page read again while Bunny prepares a video. The reads, the actions and
 * tus-js-client are stubs: nothing reaches tedrisat or Bunny.
 */
type Answer<T> =
  | { status: "ok"; data: T }
  | { status: "forbidden" }
  | { status: "failed" };

const state = {
  course: { status: "failed" } as Answer<unknown>,
  recordings: { status: "failed" } as Answer<unknown>,
  permissions: { status: "failed" } as Answer<unknown>,
};
const refresh = vi.fn();
const addRecording = vi.fn();
const changeRecording = vi.fn();
const startRecordingUpload = vi.fn();
const resignRecordingUpload = vi.fn();

/** tus-js-client: an `Upload` that records what it is given, and its storage in memory. */
const tus = vi.hoisted(() => {
  interface Options {
    metadata: Record<string, string>;
    fingerprint: () => Promise<string>;
    onBeforeRequest: (req: {
      setHeader: (n: string, v: string) => void;
    }) => void;
    onProgress: (sent: number, total: number) => void;
    onSuccess: () => void;
    onError: (error: Error) => void;
  }
  const made: Upload[] = [];
  const entries = new Map<string, string>();
  class Upload {
    starts = 0;
    aborts: Array<boolean | undefined> = [];
    resumedFrom: unknown = null;
    constructor(
      readonly file: File,
      readonly options: Options
    ) {
      made.push(this);
    }
    start() {
      this.starts += 1;
    }
    abort(shouldTerminate?: boolean) {
      this.aborts.push(shouldTerminate);
      return Promise.resolve();
    }
    resumeFromPreviousUpload(previous: unknown) {
      this.resumedFrom = previous;
    }
  }
  const urlStorage = {
    findAllUploads: async () => [],
    findUploadsByFingerprint: async (fingerprint: string) =>
      [...entries]
        .filter(([key]) => key.startsWith(`tus::${fingerprint}::`))
        .map(([key, value]) => ({ ...JSON.parse(value), urlStorageKey: key })),
    removeUpload: async (key: string) => {
      entries.delete(key);
    },
    addUpload: async (fingerprint: string, upload: unknown) => {
      const key = `tus::${fingerprint}::${entries.size + 1}`;
      entries.set(key, JSON.stringify(upload));
      return key;
    },
  };
  return { made, entries, Upload, urlStorage };
});

vi.mock("tus-js-client", () => ({
  Upload: tus.Upload,
  defaultOptions: { urlStorage: tus.urlStorage },
}));
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
  readOnce: async (what: string) => {
    if (what.includes("holds in the course")) return state.permissions;
    return what.includes("recordings") ? state.recordings : state.course;
  },
}));
vi.mock("~/features/account/reads", () => ({
  getViewer: async () => ({ id: "u-1", timeZone: "Europe/Istanbul" }),
}));
vi.mock("~/features/recordings/actions", () => ({
  addRecording: (...args: unknown[]) => addRecording(...args),
  changeRecording: (...args: unknown[]) => changeRecording(...args),
  startRecordingUpload: (...args: unknown[]) => startRecordingUpload(...args),
  resignRecordingUpload: (...args: unknown[]) => resignRecordingUpload(...args),
}));

const lesson = (id: string, title: string, at: string) => ({
  id,
  title,
  type: "LIVE",
  scheduledAt: new Date(at),
  cancelledAt: null,
});

const course = (over: Record<string, unknown> = {}) => ({
  id: "c-1",
  title: "Bina ve İzhar Şerhi",
  contentLocked: false,
  isClosed: false,
  weeks: [
    {
      id: "w1",
      weekNumber: 1,
      title: "",
      lessons: [
        lesson("l-1", "Hafta 1", "2026-09-28T21:00:00+03:00"),
        lesson("l-6", "Hafta 1c", "2026-09-30T21:00:00+03:00"),
        lesson("l-2", "Hafta 2", "2026-10-05T21:00:00+03:00"),
      ],
    },
  ],
  ...over,
});

const recording = (lessonId: string, over = {}) => ({
  id: `r-${lessonId}`,
  lessonId,
  weekId: "w1",
  weekNumber: 1,
  weekTitle: "",
  title: `Kayıt ${lessonId}`,
  provider: "OTHER",
  url: "https://us02web.zoom.us/rec/share/abc123",
  visibility: "ENROLLED",
  status: "READY",
  ...over,
});

/** l-1 holds a pasted link; l-6 a Bunny upload still PROCESSING; l-2 has begun and has none. */
const recordings = () => [
  recording("l-1"),
  recording("l-6", { provider: "BUNNY", status: "PROCESSING", url: null }),
];

const holding = (...codes: string[]): Answer<unknown> => ({
  status: "ok",
  data: { permissions: ["course.view", ...codes], staffRead: false },
});

const grant = (over = {}) => ({
  endpoint: "https://video.bunnycdn.com/tusupload",
  libraryId: "424242",
  videoId: "v-1",
  authorizationExpire: 1_791_300_000,
  authorizationSignature: "a".repeat(64),
  ...over,
});

const element = async () => {
  const { RecordingsPage } = await import(
    "~/features/recordings/components/recordings-page"
  );
  return (
    <NextIntlClientProvider
      locale="tr"
      timeZone="Europe/Istanbul"
      messages={{ nazar: resources.tr.nazar }}
    >
      <ToastProvider>
        <RecordingsPage courseId="c-1" />
        <Toaster />
      </ToastProvider>
    </NextIntlClientProvider>
  );
};
const markup = async () => html(await element());
const mount = async () => {
  await render((await expand(await element())) as ReactElement);
  await settle(40);
};

const dialog = () => document.querySelector(".mds-dialog") as HTMLElement;
const byLabel = (label: string) =>
  document.querySelector(`[aria-label="${label}"]`) as HTMLElement;
const buttonIn = (root: ParentNode, label: string) =>
  [...root.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement | undefined;
const tab = (label: string) =>
  [...document.querySelectorAll("[role=tab]")].find(
    (t) => t.textContent?.trim() === label
  ) as HTMLElement | undefined;
const fileInput = () =>
  dialog().querySelector('input[type="file"]') as HTMLInputElement | null;
const toast = (tone: string) =>
  document.querySelector(`.mds-toast--${tone}`)?.textContent ?? "";
const press = async (label: string) => {
  const button = buttonIn(dialog(), label);
  if (!button) throw new Error(`no button ${label}`);
  await click(button);
  await settle(20);
};

const video = (name = "celse-3.mp4", type = "video/mp4", bytes = 4096) =>
  new File([new Uint8Array(bytes)], name, {
    type,
    lastModified: 1_790_000_000_000,
  });

/** Picks a file, as the browser's file chooser hands it to the input. */
const pick = async (file: File) => {
  const input = fileInput();
  if (!input) throw new Error("no file input");
  await act(async () => {
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

const openAdd = async () => {
  await mount();
  await click(byLabel("Kayıt ekle: Hafta 2"));
  await settle(20);
};
const lastTus = () => tus.made.at(-1) as InstanceType<typeof tus.Upload>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T12:00:00+03:00"));
  state.course = { status: "ok", data: course() };
  state.recordings = { status: "ok", data: recordings() };
  state.permissions = holding("recording.manage", "recording.upload");
  for (const fn of [
    refresh,
    addRecording,
    changeRecording,
    startRecordingUpload,
    resignRecordingUpload,
  ]) {
    fn.mockReset();
  }
  tus.made.length = 0;
  tus.entries.clear();
  addRecording.mockResolvedValue({ success: true, data: { id: "r-new" } });
  startRecordingUpload.mockResolvedValue({ success: true, data: grant() });
  resignRecordingUpload.mockImplementation(
    async (_lessonId: string, videoId: string) => ({
      success: true,
      data: grant({ videoId, authorizationSignature: "b".repeat(64) }),
    })
  );
});
afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
});

describe("who sees what", () => {
  it("opens the page for a holder of recording.upload alone, says where to upload, and offers no Düzenle", async () => {
    state.permissions = holding("recording.upload");
    const out = await markup();
    const text = textOf(out);
    expect(text).not.toContain("izniniz yok");
    expect(text).toContain("Medaris’in video kütüphanesine (Bunny) yükleyin");
    expect(text).not.toContain("Burada yükleme yoktur");
    expect(out).toContain('aria-label="Kayıt ekle: Hafta 2"');
    expect(out).not.toContain('aria-label="Kaydı düzenle: Hafta 1"');
  });

  it("keeps the paste note for a holder of recording.manage alone", async () => {
    state.permissions = holding("recording.manage");
    expect(textOf(await markup())).toContain("Burada yükleme yoktur");
  });

  it("offers Devam et on a Bunny upload still processing to a holder of recording.upload, beside Düzenle", async () => {
    const out = await markup();
    expect(out).toContain('aria-label="Yüklemeye devam et: Hafta 1c"');
    expect(out).toContain('aria-label="Kaydı düzenle: Hafta 1c"');
    // a pasted link has nothing to continue
    expect(out).not.toContain('aria-label="Yüklemeye devam et: Hafta 1"');
    state.permissions = holding("recording.manage");
    const manageOnly = await markup();
    expect(manageOnly).not.toContain("Yüklemeye devam et");
    expect(manageOnly).toContain('aria-label="Kaydı düzenle: Hafta 1c"');
  });

  it("opens Kayıt ekle on 'Bunny’ye yükle', with 'Bağlantı yapıştır' beside it and the title and the switch shared", async () => {
    await openAdd();
    expect(tab("Bunny’ye yükle")?.getAttribute("aria-selected")).toBe("true");
    expect(tab("Bağlantı yapıştır")?.getAttribute("aria-selected")).toBe(
      "false"
    );
    expect(fileInput()?.getAttribute("accept")).toBe("video/*");
    expect(
      (dialog().querySelector('[name="title"]') as HTMLInputElement).value
    ).toBe("Hafta 2 kaydı");
    expect(dialog().querySelector('[role="switch"]')).not.toBeNull();
    expect(buttonIn(dialog(), "Yükle")).toBeDefined();
    await click(tab("Bağlantı yapıştır") as HTMLElement);
    await settle(20);
    expect(fileInput()).toBeNull();
    expect(dialog().querySelector('[name="url"]')).not.toBeNull();
    expect(dialog().querySelector('[name="title"]')).not.toBeNull();
    expect(buttonIn(dialog(), "Kaydı ekle")).toBeDefined();
  });

  it("shows the upload alone to a holder of recording.upload alone, and the paste form alone to recording.manage alone", async () => {
    state.permissions = holding("recording.upload");
    await openAdd();
    expect(document.querySelector("[role=tab]")).toBeNull();
    expect(fileInput()).not.toBeNull();
    expect(dialog().querySelector('[name="url"]')).toBeNull();
    await cleanup();
    state.permissions = holding("recording.manage");
    await openAdd();
    expect(document.querySelector("[role=tab]")).toBeNull();
    expect(fileInput()).toBeNull();
    expect(dialog().querySelector('[name="url"]')).not.toBeNull();
  });
});

describe("Bunny’ye yükle", () => {
  it("names the chosen file and its size, and refuses what is not a video before asking anything", async () => {
    await openAdd();
    await pick(video("kapak.png", "image/png"));
    expect(dialog().textContent).toContain("Bu bir video dosyası değil.");
    await press("Yükle");
    expect(startRecordingUpload).not.toHaveBeenCalled();
    await pick(video());
    expect(dialog().textContent).not.toContain("Bu bir video dosyası değil.");
    expect(
      dialog().querySelector('[data-testid="upload-file"]')?.textContent
    ).toBe("celse-3.mp4 · 4 kB");
  });

  it("asks for a file when none is chosen", async () => {
    await openAdd();
    await press("Yükle");
    expect(dialog().textContent).toContain("Bir video dosyası seçin.");
    expect(startRecordingUpload).not.toHaveBeenCalled();
  });

  it("starts the upload with the title, who may watch and the session's time, then sends the file and shows how far it got", async () => {
    await openAdd();
    await pick(video());
    await press("Yükle");
    expect(startRecordingUpload).toHaveBeenCalledWith("l-2", {
      title: "Hafta 2 kaydı",
      visibility: "ENROLLED",
      recordedAt: "2026-10-05T18:00:00.000Z",
    });
    const upload = lastTus();
    expect(upload.file.name).toBe("celse-3.mp4");
    expect(upload.starts).toBe(1);
    expect(upload.options.metadata).toEqual({
      filetype: "video/mp4",
      title: "Hafta 2 kaydı",
    });
    await act(async () => upload.options.onProgress(2048, 4096));
    const bar = dialog().querySelector('[data-testid="upload-progress"]');
    expect(bar?.textContent).toContain("%50");
    expect(bar?.textContent).toContain("2 kB / 4 kB");
    // while the bytes go: only İptal, and nothing else can be changed
    expect(buttonIn(dialog(), "İptal")).toBeDefined();
    expect(buttonIn(dialog(), "Yükle")).toBeUndefined();
    expect(buttonIn(dialog(), "Vazgeç")).toBeUndefined();
    expect(fileInput()?.disabled).toBe(true);
    expect(
      (dialog().querySelector('[name="title"]') as HTMLInputElement).disabled
    ).toBe(true);
    // Esc does not drop it either
    await key(dialog(), "Escape");
    await settle(20);
    expect(dialog()).not.toBeNull();
    expect(upload.aborts).toEqual([]);
  });

  it("closes, says so and reads the page again once Bunny has the whole file", async () => {
    const leave = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    await openAdd();
    await pick(video());
    await press("Yükle");
    // while the bytes go, the browser asks before the page is left
    expect(leave()).toBe(true);
    await act(async () => lastTus().options.onSuccess());
    await settle(20);
    expect(dialog()).toBeNull();
    expect(toast("success")).toContain("Video yüklendi");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(leave()).toBe(false);
  });

  it.each([
    ["BUNNY_STREAM_NOT_CONFIGURED", "Video kütüphanesi ayarlı değil", 0],
    ["RECORDING_EXISTS", "Bu celsenin zaten bir kaydı var", 1],
    ["AUTHZ_FORBIDDEN", "Bunu yapma izniniz yok.", 0],
  ])("words a refused start (%s) in the dialog and sends nothing", async (code, sentence, reads) => {
    startRecordingUpload.mockResolvedValue({ success: false, code });
    await openAdd();
    await pick(video());
    await press("Yükle");
    const alert = dialog().querySelector("[role=alert]");
    expect(alert?.textContent).toContain("Video yüklenemedi");
    expect(alert?.textContent).toContain(sentence);
    expect(tus.made).toHaveLength(0);
    expect(refresh).toHaveBeenCalledTimes(reads);
    // nothing was made: the next try starts over
    expect(buttonIn(dialog(), "Yükle")).toBeDefined();
  });

  it("İptal stops it, and Devam et continues the same video signed again, from where it stopped", async () => {
    await openAdd();
    await pick(video());
    await press("Yükle");
    await act(async () => lastTus().options.onProgress(1024, 4096));
    await press("İptal");
    expect(lastTus().aborts).toEqual([false]);
    expect(dialog().textContent).toContain("Yükleme durduruldu.");
    expect(fileInput()?.disabled).toBe(true);
    await press("Devam et");
    expect(resignRecordingUpload).toHaveBeenCalledWith("l-2", "v-1");
    expect(startRecordingUpload).toHaveBeenCalledTimes(1);
    expect(tus.made).toHaveLength(1);
    expect(lastTus().starts).toBe(2);
  });

  it("reads the page again when closed after a stop, as the session now holds the video", async () => {
    await openAdd();
    await pick(video());
    await press("Yükle");
    await press("İptal");
    expect(refresh).not.toHaveBeenCalled();
    await press("Vazgeç");
    expect(dialog()).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("stops the upload, keeping what Bunny got, when the page is left inside the app", async () => {
    await openAdd();
    await pick(video());
    await press("Yükle");
    const upload = lastTus();
    await cleanup();
    expect(upload.aborts).toEqual([false]);
  });

  it("words a dropped connection and offers to continue", async () => {
    await openAdd();
    await pick(video());
    await press("Yükle");
    await act(async () =>
      lastTus().options.onError(
        Object.assign(new Error("tus: failed"), {
          originalRequest: {},
          originalResponse: null,
        })
      )
    );
    expect(dialog().querySelector("[role=alert]")?.textContent).toContain(
      "Bağlantı koptu."
    );
    expect(buttonIn(dialog(), "Devam et")).toBeDefined();
  });

  it("keeps to the upload once a video exists: the link tab does not open", async () => {
    await openAdd();
    await pick(video());
    await press("Yükle");
    await press("İptal");
    await click(tab("Bağlantı yapıştır") as HTMLElement);
    await settle(20);
    expect(tab("Bunny’ye yükle")?.getAttribute("aria-selected")).toBe("true");
    expect(fileInput()).not.toBeNull();
  });

  it("leaves the paste tab as it was", async () => {
    await openAdd();
    await click(tab("Bağlantı yapıştır") as HTMLElement);
    await settle(20);
    await typeInto(
      dialog().querySelector('[name="url"]') as HTMLInputElement,
      "https://us02web.zoom.us/rec/share/xyz"
    );
    await press("Kaydı ekle");
    expect(addRecording).toHaveBeenCalledWith("l-2", {
      title: "Hafta 2 kaydı",
      url: "https://us02web.zoom.us/rec/share/xyz",
      visibility: "ENROLLED",
    });
    expect(startRecordingUpload).not.toHaveBeenCalled();
  });
});

describe("Devam et on an upload left halfway", () => {
  const openResume = async () => {
    await mount();
    await click(byLabel("Yüklemeye devam et: Hafta 1c"));
    await settle(20);
  };

  it("continues the upload this browser stored for that file, with its video signed again", async () => {
    const file = video();
    tus.entries.set(
      `tus::${uploadFingerprint("l-6", file)}::1`,
      JSON.stringify({
        size: file.size,
        metadata: { filetype: "video/mp4", title: "Kayıt l-6" },
        creationTime: new Date().toString(),
        uploadUrl: "https://video.bunnycdn.com/tusupload/abc",
        videoId: "v-9",
      })
    );
    await openResume();
    expect(dialog().textContent).toContain("Yüklemeye devam et");
    expect(dialog().querySelector('[name="title"]')).toBeNull();
    expect(dialog().querySelector('[role="switch"]')).toBeNull();
    await pick(file);
    await press("Devam et");
    expect(resignRecordingUpload).toHaveBeenCalledWith("l-6", "v-9");
    expect(startRecordingUpload).not.toHaveBeenCalled();
    expect(lastTus().resumedFrom).toMatchObject({
      uploadUrl: "https://video.bunnycdn.com/tusupload/abc",
    });
  });

  it("says so when this browser has no halfway upload of that file, and starts nothing", async () => {
    await openResume();
    await pick(video());
    await press("Devam et");
    expect(dialog().querySelector("[role=alert]")?.textContent).toContain(
      "yarım kalan yüklemesi bu tarayıcıda bulunamadı"
    );
    expect(startRecordingUpload).not.toHaveBeenCalled();
    expect(resignRecordingUpload).not.toHaveBeenCalled();
    expect(tus.made).toHaveLength(0);
  });
});

describe("the page while Bunny prepares a video", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-10-06T12:00:00+03:00"));
  });
  const tick = (ms: number) =>
    act(async () => {
      vi.advanceTimersByTime(ms);
    });

  it("is read again every 10 seconds while a Bunny upload is processing", async () => {
    await mount();
    await tick(PENDING_REFRESH_MS - 1);
    expect(refresh).not.toHaveBeenCalled();
    await tick(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    await tick(PENDING_REFRESH_MS);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("is not read again when no Bunny upload is processing, a pasted link that is included", async () => {
    state.recordings = {
      status: "ok",
      data: [
        recording("l-1"),
        recording("l-6", { status: "PROCESSING", url: null }),
      ],
    };
    await mount();
    await tick(PENDING_REFRESH_MS * 6);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("reading again while something is pending", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  });

  function Probe({ active, call }: { active: boolean; call: () => void }) {
    useRefreshWhile(active, call);
    return null;
  }

  it("starts only while active, stops as soon as it is not, and skips a hidden tab", async () => {
    const call = vi.fn();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host);
    await act(async () => root.render(<Probe active={false} call={call} />));
    await act(async () => vi.advanceTimersByTime(PENDING_REFRESH_MS * 3));
    expect(call).not.toHaveBeenCalled();
    await act(async () => root.render(<Probe active call={call} />));
    await act(async () => vi.advanceTimersByTime(PENDING_REFRESH_MS));
    expect(call).toHaveBeenCalledTimes(1);
    const hidden = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    await act(async () => vi.advanceTimersByTime(PENDING_REFRESH_MS));
    expect(call).toHaveBeenCalledTimes(1);
    hidden.mockRestore();
    await act(async () => root.render(<Probe active={false} call={call} />));
    await act(async () => vi.advanceTimersByTime(PENDING_REFRESH_MS * 3));
    expect(call).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    host.remove();
  });
});
