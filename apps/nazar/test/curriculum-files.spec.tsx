// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { act, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, render, settle, type as typeInto } from "./dom";
import { expand } from "./server-render";

/**
 * Files on Müfredat (MDRS-287): "Dosya yükle" beside "Bağlantı ekle" in the
 * course's resources and in a celse's own, the row it adds, the version the
 * next save carries, the refusals it words, and a file row's way off the
 * list. The reads, the save and `fetch` are stubs; `handleUnauthenticated`
 * is the spy a 401 must reach.
 */
type Answer<T> =
  | { status: "ok"; data: T }
  | { status: "forbidden" }
  | { status: "failed" };

const state = {
  course: { status: "failed" } as Answer<unknown>,
  permissions: { status: "failed" } as Answer<unknown>,
};
const refresh = vi.fn();
const saveCurriculum = vi.fn();
const signIn = vi.fn();
let fetchMock: ReturnType<typeof vi.fn>;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next-intl/server", async () => {
  const { translatorFor } = await import("./server-render");
  return {
    getTranslations: async (namespace?: string) => translatorFor(namespace),
    getLocale: async () => "tr",
  };
});
vi.mock("~/lib/tedrisat-read", () => ({
  readOnce: async (what: string) =>
    what.includes("holds in the course") ? state.permissions : state.course,
}));
vi.mock("~/features/account/reads", () => ({
  getViewer: async () => ({ id: "u-1", timeZone: "Europe/Istanbul" }),
}));
vi.mock("~/features/curriculum/actions", () => ({
  saveCurriculum: (...args: unknown[]) => saveCurriculum(...args),
}));
vi.mock("~/lib/unauthenticated", () => ({
  handleUnauthenticated: (result: unknown) => {
    const signedOut =
      result !== null &&
      typeof result === "object" &&
      (result as { kind?: unknown }).kind === "unauthenticated";
    if (signedOut) signIn(result);
    return signedOut;
  },
}));

const PDF = {
  name: "bina.pdf",
  contentType: "application/pdf",
  sizeBytes: 1_258_291,
};

const lesson = (id: string, title: string, at: string, over = {}) => ({
  id,
  weekId: "w1",
  title,
  type: "LIVE",
  scheduledAt: new Date(at),
  durationMinutes: 60,
  isPreview: false,
  orderIndex: 0,
  meetingUrl: "https://zoom.us/j/123456",
  kaynak: undefined,
  agenda: [],
  cancelledAt: null,
  cancelReason: null,
  replacementLessonId: null,
  inPerson: false,
  inPersonOverride: null,
  hasLiveStream: false,
  resources: [],
  ...over,
});

/** One running week with two sessions; the first has one link of its own. */
const course = (over: Record<string, unknown> = {}) => ({
  id: "c-1",
  title: "Bina ve İzhar Şerhi",
  description: "Sarf ilminin temeli.",
  coverHue: 25,
  version: 7,
  timeZone: "Europe/Istanbul",
  contentLocked: false,
  isClosed: false,
  inPerson: false,
  weeks: [
    {
      id: "w1",
      weekNumber: 1,
      title: "Birinci hafta",
      summary: undefined,
      lessons: [
        lesson("l-1", "Hafta 1", "2026-10-05T21:00:00+03:00", {
          resources: [
            {
              id: "lr-1",
              lessonId: "l-1",
              name: "Emsile şerhi",
              meta: null,
              url: "https://drive.google.com/file/d/1a2b3c/view",
              orderIndex: 0,
            },
          ],
        }),
        lesson("l-2", "Hafta 1b", "2026-10-06T21:00:00+03:00"),
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

const holding = (...codes: string[]): Answer<unknown> => ({
  status: "ok",
  data: { permissions: ["course.view", ...codes], staffRead: false },
});

const mount = async () => {
  const { CurriculumPage } = await import(
    "~/features/curriculum/components/curriculum-page"
  );
  const page = (
    <NextIntlClientProvider
      locale="tr"
      timeZone="Europe/Istanbul"
      messages={{ nazar: resources.tr.nazar }}
    >
      <ToastProvider>
        <CurriculumPage courseId="c-1" />
        <Toaster />
      </ToastProvider>
    </NextIntlClientProvider>
  );
  await render((await expand(page)) as ReactElement);
  await settle(40);
};

const buttonIn = (root: ParentNode, label: string) =>
  [...root.querySelectorAll("button")].find(
    (b) =>
      b.textContent?.trim() === label || b.getAttribute("aria-label") === label
  ) as HTMLButtonElement | undefined;
const form = () =>
  document.querySelector('[data-testid="curriculum"]') as HTMLElement;
const field = (name: string) =>
  document.querySelector(`[name="${name}"]`) as HTMLInputElement | null;
const section = () =>
  document.querySelector('[data-testid="resources"]') as HTMLElement;
const group = () =>
  document.querySelector('[data-testid="resources-lesson-0-0"]') as HTMLElement;
const toast = (tone: string) =>
  document.querySelector(`.mds-toast--${tone}`)?.textContent ?? "";
const dialog = () =>
  document.querySelector(".mds-dialog") as HTMLElement | null;
const save = () => buttonIn(form(), "Kaydet") as HTMLButtonElement;
const submit = async () => {
  await click(save());
  await settle(20);
};
const sentBody = () =>
  saveCurriculum.mock.calls[0]?.[1] as {
    version: number;
    resources: unknown[];
    weeks: Array<{ lessons: Array<Record<string, unknown>> }>;
  };

const pdf = (size = 4096) =>
  new File([new Uint8Array(size)], "bina.pdf", { type: "application/pdf" });

/** Picks a file in the open panel, as the browser's chooser hands it over. */
const pick = async (root: ParentNode, file: File) => {
  const input = root.querySelector(
    'input[type="file"]'
  ) as HTMLInputElement | null;
  if (!input) throw new Error("no file input");
  await act(async () => {
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

/** Opens "Dosya yükle" in `root`, picks `file` and presses "Yükle". */
const uploadIn = async (root: ParentNode, file = pdf(), name?: string) => {
  await click(buttonIn(root, "Dosya yükle") as HTMLButtonElement);
  await pick(root, file);
  if (name !== undefined) {
    const input = root.querySelector(
      'input[name$="-upload-name"]'
    ) as HTMLInputElement;
    await typeInto(input, name);
  }
  await click(buttonIn(root, "Yükle") as HTMLButtonElement);
  await settle(30);
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const courseUpload = (courseVersion = 8) =>
  json(201, {
    resource: {
      id: "r-9",
      courseId: "c-1",
      name: "Bina metni",
      meta: undefined,
      type: undefined,
      file: { ...PDF, downloadUrl: "/courses/c-1/resources/r-9/file" },
      orderIndex: 0,
    },
    courseVersion,
  });

const lessonUpload = () =>
  json(201, {
    resource: {
      id: "lr-9",
      lessonId: "l-1",
      name: "bina.pdf",
      meta: null,
      url: null,
      file: { ...PDF, downloadUrl: "/lessons/l-1/resources/lr-9/file" },
      orderIndex: 1,
    },
    courseVersion: 8,
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00+03:00"));
  state.course = { status: "ok", data: course() };
  state.permissions = holding("course.edit", "session.manage");
  refresh.mockReset();
  signIn.mockReset();
  saveCurriculum.mockReset();
  saveCurriculum.mockResolvedValue({
    success: true,
    data: { courseVersion: 9 },
  });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Dosya yükle on the course's resources", () => {
  it("sits beside Bağlantı ekle, says the upload is stored at once, and offers the accepted types", async () => {
    await mount();
    expect(buttonIn(section(), "Bağlantı ekle")).toBeDefined();
    await click(buttonIn(section(), "Dosya yükle") as HTMLButtonElement);
    const panel = section().querySelector(
      '[data-testid="resource-upload"]'
    ) as HTMLElement;
    expect(panel.textContent).toContain(resources.tr.nazar.Files.uploadNote);
    expect(panel.textContent).toContain("en çok 25 MB");
    const input = panel.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toContain("application/pdf");
    expect(input.accept).toContain(".docx");
  });

  it("adds the stored row with its name, type and size, as no unsaved change, and the next save carries the new version", async () => {
    fetchMock.mockResolvedValue(courseUpload());
    await mount();
    await uploadIn(section(), pdf(), "Bina metni");

    const [route, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(route).toBe("/api/files/courses/c-1/resources");
    const body = init.body as FormData;
    expect((body.get("file") as File).name).toBe("bina.pdf");
    expect(body.get("name")).toBe("Bina metni");

    expect(toast("success")).toContain("Dosya yüklendi");
    expect(field("resource-0-name")?.value).toBe("Bina metni");
    // a file row has no address to type
    expect(field("resource-0-url")).toBeNull();
    const row = section().querySelector(
      '[data-testid="resource-0"]'
    ) as HTMLElement;
    const link = row.querySelector(
      "a[href^='/api/files/']"
    ) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(
      "/api/files/courses/c-1/resources/r-9"
    );
    expect(link.textContent).toBe("bina.pdf");
    expect(row.textContent).toContain("PDF");
    expect(row.textContent).toContain("1,2 MB");
    // stored by the upload: nothing to save yet
    expect(save().disabled).toBe(true);
    expect(document.querySelector('[data-testid="dirty"]')).toBeNull();

    await typeInto(field("resource-0-name") as HTMLInputElement, "Bina");
    await submit();
    expect(sentBody().version).toBe(8);
    expect(sentBody().resources).toEqual([
      { id: "r-9", name: "Bina", meta: null, type: undefined },
    ]);
  });

  it("keeps the version it read when somebody else saved in between, so the save meets the conflict", async () => {
    fetchMock.mockResolvedValue(courseUpload(10));
    await mount();
    await uploadIn(section());
    await typeInto(field("title") as HTMLInputElement, "Yeni ad");
    await submit();
    expect(sentBody().version).toBe(7);
  });

  it("refuses a file over 25 MB, and an empty one, before sending it", async () => {
    await mount();
    const big = pdf(1);
    Object.defineProperty(big, "size", { value: 25 * 1024 * 1024 + 1 });
    await uploadIn(section(), big);
    expect(section().textContent).toContain(
      "Bu dosya 25 MB’tan büyük. Daha küçük bir dosya seçin."
    );
    await pick(section(), pdf(0));
    await click(buttonIn(section(), "Yükle") as HTMLButtonElement);
    expect(section().textContent).toContain("Bu dosya boş.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("words tedrisat's 413 and 415, and adds no row", async () => {
    fetchMock.mockResolvedValueOnce(
      json(413, { code: "FILE_TOO_LARGE", status: 413, message: "too large" })
    );
    await mount();
    await uploadIn(section());
    expect(section().textContent).toContain("Dosya yüklenemedi");
    expect(section().textContent).toContain("Dosya 25 MB’tan büyük olamaz.");
    expect(section().textContent).not.toContain("too large");

    fetchMock.mockResolvedValueOnce(
      json(415, { code: "FILE_TYPE_NOT_ALLOWED", status: 415 })
    );
    await click(buttonIn(section(), "Yükle") as HTMLButtonElement);
    await settle(30);
    expect(section().textContent).toContain("Bu dosya türü kabul edilmiyor.");
    expect(field("resource-0-name")).toBeNull();
    expect(section().textContent).toContain(
      "Bu derse henüz kaynak bağlanmadı."
    );
  });

  it("sends a session that is over to sign in (401) and shows no error", async () => {
    fetchMock.mockResolvedValue(
      json(401, { kind: "unauthenticated", reauth: true })
    );
    await mount();
    await uploadIn(section());
    expect(signIn).toHaveBeenCalledWith({
      kind: "unauthenticated",
      reauth: true,
    });
    expect(section().textContent).not.toContain("Dosya yüklenemedi");
    expect(field("resource-0-name")).toBeNull();
  });

  it("keeps Kaydet off while a file is uploading", async () => {
    let answer: (response: Response) => void = () => undefined;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        answer = resolve;
      })
    );
    await mount();
    await typeInto(field("title") as HTMLInputElement, "Yeni ad");
    expect(save().disabled).toBe(false);
    await uploadIn(section());
    expect(section().textContent).toContain("Yükleniyor…");
    expect(save().disabled).toBe(true);
    await act(async () => {
      answer(courseUpload());
    });
    await settle(30);
    expect(save().disabled).toBe(false);
  });

  it("asks before taking a file row off; the save then leaves it out, and Vazgeç before it puts it back", async () => {
    state.course = {
      status: "ok",
      data: course({
        resources: [
          {
            id: "r-9",
            courseId: "c-1",
            name: "Bina metni",
            file: { ...PDF, downloadUrl: "/courses/c-1/resources/r-9/file" },
            orderIndex: 0,
          },
        ],
      }),
    };
    await mount();
    await click(buttonIn(section(), "Kaynağı çıkar") as HTMLButtonElement);
    expect(dialog()?.textContent).toContain("Dosyayı çıkar");
    expect(dialog()?.textContent).toContain("Bina metni");
    expect(dialog()?.textContent).toContain(
      "Müfredatı kaydettiğinizde dosya da kalıcı olarak silinir."
    );
    await click(buttonIn(dialog() as HTMLElement, "Vazgeç") as HTMLElement);
    await settle(20);
    expect(field("resource-0-name")?.value).toBe("Bina metni");

    await click(buttonIn(section(), "Kaynağı çıkar") as HTMLButtonElement);
    await click(buttonIn(dialog() as HTMLElement, "Çıkar") as HTMLElement);
    await settle(20);
    expect(field("resource-0-name")).toBeNull();
    await click(buttonIn(form(), "Vazgeç") as HTMLButtonElement);
    expect(field("resource-0-name")?.value).toBe("Bina metni");

    await click(buttonIn(section(), "Kaynağı çıkar") as HTMLButtonElement);
    await click(buttonIn(dialog() as HTMLElement, "Çıkar") as HTMLElement);
    await settle(20);
    await submit();
    expect(sentBody().resources).toEqual([]);
  });

  it("is not offered without course.edit", async () => {
    state.permissions = holding("session.manage");
    await mount();
    expect(buttonIn(section(), "Dosya yükle")).toBeUndefined();
  });
});

describe("Dosya yükle on a celse's own resources", () => {
  it("adds the stored row to that celse, and a save that does not touch the list does not send it", async () => {
    fetchMock.mockResolvedValue(lessonUpload());
    await mount();
    await uploadIn(group());
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/files/lessons/l-1/resources"
    );
    expect(field("lesson-0-0-resource-1-name")?.value).toBe("bina.pdf");
    expect(field("lesson-0-0-resource-1-url")).toBeNull();
    const link = group().querySelector(
      "a[href^='/api/files/']"
    ) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(
      "/api/files/lessons/l-1/resources/lr-9"
    );
    expect(save().disabled).toBe(true);

    await typeInto(field("title") as HTMLInputElement, "Yeni ad");
    await submit();
    expect(sentBody().version).toBe(8);
    expect(Object.keys(sentBody().weeks[0]?.lessons[0] ?? {})).not.toContain(
      "resources"
    );
  });

  it("sends a moved or renamed file row back with its id and no address", async () => {
    fetchMock.mockResolvedValue(lessonUpload());
    await mount();
    await uploadIn(group());
    const row = document.querySelector(
      '[data-testid="resource-lesson-0-0-1"]'
    ) as HTMLElement;
    await click(buttonIn(row, "Yukarı taşı") as HTMLButtonElement);
    await typeInto(
      field("lesson-0-0-resource-0-name") as HTMLInputElement,
      "Bina (PDF)"
    );
    await submit();
    expect(sentBody().weeks[0]?.lessons[0]?.resources).toEqual([
      { id: "lr-9", name: "Bina (PDF)", meta: null },
      {
        id: "lr-1",
        name: "Emsile şerhi",
        meta: null,
        url: "https://drive.google.com/file/d/1a2b3c/view",
      },
    ]);
  });

  it("asks before taking a celse's file off, and the save then leaves it out", async () => {
    fetchMock.mockResolvedValue(lessonUpload());
    await mount();
    await uploadIn(group());
    const row = document.querySelector(
      '[data-testid="resource-lesson-0-0-1"]'
    ) as HTMLElement;
    await click(buttonIn(row, "Kaynağı çıkar") as HTMLButtonElement);
    expect(dialog()?.textContent).toContain("Dosyayı çıkar");
    await click(buttonIn(dialog() as HTMLElement, "Çıkar") as HTMLElement);
    await settle(20);
    await submit();
    expect(sentBody().weeks[0]?.lessons[0]?.resources).toEqual([
      {
        id: "lr-1",
        name: "Emsile şerhi",
        meta: null,
        url: "https://drive.google.com/file/d/1a2b3c/view",
      },
    ]);
  });

  it("is off for a celse added on this page until the curriculum is saved", async () => {
    await mount();
    await click(buttonIn(form(), "Celse ekle") as HTMLButtonElement);
    const added = document.querySelector(
      '[data-testid="resources-lesson-0-2"]'
    ) as HTMLElement;
    expect((buttonIn(added, "Dosya yükle") as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(added.textContent).toContain(
      "Yeni celseye dosya yüklemek için önce müfredatı kaydedin."
    );
  });

  it("is not offered to a holder of course.edit alone", async () => {
    state.permissions = holding("course.edit");
    await mount();
    expect(buttonIn(group(), "Dosya yükle")).toBeUndefined();
    // the course's own list still offers it
    expect(buttonIn(section(), "Dosya yükle")).toBeDefined();
  });
});
