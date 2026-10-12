// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type { CourseDetailResponse } from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CurriculumEditor } from "~/features/courses/components/curriculum-editor";
import { cleanup, click, render, settle, type as typeInto } from "./dom";

// MDRS-287: "Dosya yükle" beside "Kaynak ekle", for the course's resources
// and a session's own. The file goes to the app's own route; tedrisat stores
// it at once and answers its row and the course's new version, which the
// page keeps, so the next "Kaydet" neither drops the row nor conflicts. A
// file row is renamed, reordered and removed like a link, goes back by its id
// without an address, and its removal asks first.

const saveCurriculum = vi.fn();
vi.mock("~/features/courses/actions", () => ({
  saveCurriculum: (...a: unknown[]) => saveCurriculum(...a),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
const redirectIfUnauthenticated = vi.fn(
  (result: unknown) =>
    (result as { kind?: string } | null)?.kind === "unauthenticated"
);
vi.mock("~/lib/unauthenticated", () => ({
  redirectIfUnauthenticated: (result: unknown) =>
    redirectIfUnauthenticated(result),
}));

const tr = resources.tr.nizam.Curriculum;
const errors = tr.uploadErrors;

const pdf = {
  name: "bina.pdf",
  contentType: "application/pdf",
  sizeBytes: 1_468_006,
  downloadUrl: "/courses/c1/resources/f1/file",
};

const lesson = (resources: unknown[] = [], over: object = {}) => ({
  id: "l1",
  weekId: "w1",
  title: "Birinci",
  type: "LIVE",
  durationMinutes: 60,
  scheduledAt: "2030-10-14T18:00:00.000Z",
  meetingUrl: "https://zoom.us/j/1",
  kaynak: "Bina",
  agenda: [],
  isPreview: false,
  orderIndex: 0,
  cancelledAt: null,
  replacementLessonId: null,
  inPersonOverride: null,
  hasLiveStream: false,
  resources,
  ...over,
});

const course = (over: object = {}) =>
  ({
    id: "c1",
    koskId: "k1",
    title: "Emsile ve Bina",
    description: "Sarf",
    coverHue: 20,
    version: 3,
    timeZone: "Europe/Istanbul",
    contentLocked: false,
    muderris: [],
    resources: [
      {
        id: "r1",
        courseId: "c1",
        name: "Emsile",
        meta: null,
        type: "link",
        url: "https://emsile.test/",
        file: null,
        orderIndex: 0,
      },
    ],
    weeks: [
      { id: "w1", weekNumber: 1, title: "Mehmûz fiiller", lessons: [lesson()] },
    ],
    ...over,
  }) as unknown as CourseDetailResponse;

const mount = (read: CourseDetailResponse = course()) =>
  render(
    <NextIntlClientProvider
      locale="tr"
      timeZone="Europe/Istanbul"
      messages={{ nizam: resources.tr.nizam } as never}
    >
      <CurriculumEditor kosk={{ id: "k1", name: "N" }} course={read} />
    </NextIntlClientProvider>
  );

const fetchMock = vi.fn<typeof fetch>();
const answer = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  saveCurriculum.mockReset();
  saveCurriculum.mockImplementation(async () => ({
    success: true,
    data: course(),
  }));
  redirectIfUnauthenticated.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => {
  await cleanup();
  vi.unstubAllGlobals();
});

const buttonIn = (root: ParentNode, label: string) =>
  [...root.querySelectorAll("button")].find(
    (b) =>
      b.textContent?.trim() === label || b.getAttribute("aria-label") === label
  ) as HTMLButtonElement | undefined;
const button = (label: string) => buttonIn(document, label);
const field = (name: string) =>
  document.querySelector(`[name="${name}"]`) as HTMLInputElement | null;
const dirty = () => document.querySelector('[data-testid="dirty"]');
const section = () =>
  document.querySelector('[data-testid="resources"]') as HTMLElement;
const session = () =>
  document.querySelector('[data-testid="resources-lesson-0-0"]') as HTMLElement;
const dialog = () =>
  document.querySelector('[role="dialog"]') as HTMLElement | null;

const file = (name: string, type: string, size?: number) => {
  const made = new File(["%PDF-1.7 spec"], name, { type });
  if (size !== undefined) Object.defineProperty(made, "size", { value: size });
  return made;
};

/** Picks a file in the dialog's input, as the browser's picker does. */
const pick = async (chosen: File) => {
  const input = dialog()?.querySelector(
    'input[type="file"]'
  ) as HTMLInputElement;
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [chosen],
  });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

/** Sends the dialog's form, as its "Yükle" does. */
const send = async () => {
  const form = dialog()?.querySelector("form");
  if (!form) throw new Error("the upload dialog is not open");
  await act(async () => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    );
  });
  await settle();
};

const sentForm = () => fetchMock.mock.calls[0]?.[1]?.body as FormData;

describe("Dosya yükle on the course's resources", () => {
  const uploaded = {
    resource: {
      id: "f1",
      courseId: "c1",
      name: "Bina metni",
      meta: "PDF · 124 sayfa",
      type: null,
      file: pdf,
      orderIndex: 1,
    },
    courseVersion: 4,
  };

  it("uploads through the app's route and shows the new row with its name, type and size", async () => {
    fetchMock.mockResolvedValue(answer(uploaded, 201));
    await mount();
    await click(buttonIn(section(), tr.uploadFile) as HTMLButtonElement);
    expect(dialog()?.textContent).toContain(tr.uploadFileHelp);
    const input = dialog()?.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    expect(input.accept).toContain(".pdf");
    expect(input.accept).toContain(".pptx");
    await pick(file("bina.pdf", "application/pdf"));
    await typeInto(field("upload-name") as HTMLInputElement, "Bina metni");
    await typeInto(field("upload-meta") as HTMLInputElement, "PDF · 124 sayfa");
    await send();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/files/courses/c1/resources"
    );
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect((sentForm().get("file") as File).name).toBe("bina.pdf");
    expect(sentForm().get("name")).toBe("Bina metni");
    expect(sentForm().get("meta")).toBe("PDF · 124 sayfa");
    // the dialog's submit is not the curriculum's "Kaydet"
    expect(saveCurriculum).not.toHaveBeenCalled();

    const row = section().querySelector(
      '[data-testid="resource-1"]'
    ) as HTMLElement;
    expect(field("resource-1-name")?.value).toBe("Bina metni");
    expect(field("resource-1-url")).toBeNull();
    const link = row.querySelector("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(
      "/api/files/courses/c1/resources/f1"
    );
    // A plain link: a refusal comes back to the page with ?fileError=.
    expect(link.hasAttribute("download")).toBe(false);
    expect(link.textContent).toBe("bina.pdf");
    expect(row.textContent).toContain("PDF");
    expect(row.textContent?.replace(/\s/g, " ")).toContain("1,4 MB");
    // stored already: the form has nothing unsaved
    expect(dirty()).toBeNull();
  });

  it("keeps the row and sends the new version with the next save, the file by its id and no address", async () => {
    fetchMock.mockResolvedValue(answer(uploaded, 201));
    await mount();
    await click(buttonIn(section(), tr.uploadFile) as HTMLButtonElement);
    await pick(file("bina.pdf", "application/pdf"));
    await send();
    await typeInto(field("resource-1-name") as HTMLInputElement, "Bina");
    await click(button("Kaydet") as HTMLButtonElement);
    await settle();
    expect(saveCurriculum).toHaveBeenCalledTimes(1);
    const body = saveCurriculum.mock.calls[0]?.[2];
    expect(body.version).toBe(4);
    expect(body.resources).toEqual([
      {
        id: "r1",
        name: "Emsile",
        meta: null,
        type: "link",
        url: "https://emsile.test/",
      },
      { id: "f1", name: "Bina", meta: "PDF · 124 sayfa", type: undefined },
    ]);
  });

  it("keeps the version it read when someone else saved in between, so the save is refused as out of date", async () => {
    fetchMock.mockResolvedValue(answer({ ...uploaded, courseVersion: 6 }, 201));
    await mount();
    await click(buttonIn(section(), tr.uploadFile) as HTMLButtonElement);
    await pick(file("bina.pdf", "application/pdf"));
    await send();
    await typeInto(field("title") as HTMLInputElement, "Emsile");
    await click(button("Kaydet") as HTMLButtonElement);
    await settle();
    expect(saveCurriculum.mock.calls[0]?.[2].version).toBe(3);
  });

  it("says a file past 25 MB is too large, before sending it", async () => {
    await mount();
    await click(buttonIn(section(), tr.uploadFile) as HTMLButtonElement);
    await pick(file("kitap.pdf", "application/pdf", 26 * 1024 * 1024));
    await send();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dialog()?.textContent).toContain(errors.tooLarge);
  });

  it("asks for a file when none is chosen", async () => {
    await mount();
    await click(buttonIn(section(), tr.uploadFile) as HTMLButtonElement);
    await send();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dialog()?.textContent).toContain(errors.required);
  });

  it("words tedrisat's 413 and 415 in Turkish and keeps the dialog open", async () => {
    fetchMock.mockResolvedValueOnce(
      answer({ code: "FILE_TOO_LARGE", status: 413, message: "too big" }, 413)
    );
    await mount();
    await click(buttonIn(section(), tr.uploadFile) as HTMLButtonElement);
    await pick(file("bina.pdf", "application/pdf"));
    await send();
    expect(dialog()?.textContent).toContain(errors.tooLarge);
    expect(dialog()?.textContent).not.toContain("too big");

    fetchMock.mockResolvedValueOnce(
      answer(
        { code: "FILE_TYPE_NOT_ALLOWED", status: 415, message: "Only PDF" },
        415
      )
    );
    await pick(file("sayfa.html", "text/html"));
    await send();
    expect(dialog()?.textContent).toContain(errors.typeNotAllowed);
    expect(dialog()?.textContent).not.toContain("Only PDF");
    // nothing joined the list
    expect(section().querySelector('[data-testid="resource-1"]')).toBeNull();
  });

  it("words a store that is not reachable as an alert", async () => {
    fetchMock.mockResolvedValue(
      answer({ code: "STORAGE_UNAVAILABLE", status: 503 }, 503)
    );
    await mount();
    await click(buttonIn(section(), tr.uploadFile) as HTMLButtonElement);
    await pick(file("bina.pdf", "application/pdf"));
    await send();
    expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain(
      errors.storageUnavailable
    );
  });

  it("hands a 401 to sign-in and draws no error", async () => {
    const signedOut = { kind: "unauthenticated", reauth: true };
    fetchMock.mockResolvedValue(answer(signedOut, 401));
    await mount();
    await click(buttonIn(section(), tr.uploadFile) as HTMLButtonElement);
    await pick(file("bina.pdf", "application/pdf"));
    await send();
    expect(redirectIfUnauthenticated).toHaveBeenCalledWith(signedOut);
    expect(dialog()?.querySelector('[role="alert"]')).toBeNull();
    expect(dialog()?.textContent).not.toContain(errors.generic);
  });
});

describe("a file row", () => {
  const withFile = () =>
    course({
      resources: [
        {
          id: "f1",
          courseId: "c1",
          name: "Bina metni",
          meta: null,
          type: null,
          file: pdf,
          orderIndex: 0,
        },
      ],
    });

  it("asks before it is removed, says the file will be deleted, and leaves it out of the save", async () => {
    await mount(withFile());
    await click(buttonIn(section(), tr.removeResource) as HTMLButtonElement);
    const ask = document.querySelector('[role="alertdialog"]') as HTMLElement;
    expect(ask.textContent).toContain(tr.removeFileTitle);
    expect(ask.textContent).toContain(
      "Müfredatı kaydettiğinizde dosya da silinir"
    );
    // still there until "Çıkar"
    expect(field("resource-0-name")?.value).toBe("Bina metni");
    await click(buttonIn(ask, tr.removeFileConfirm) as HTMLButtonElement);
    expect(field("resource-0-name")).toBeNull();
    expect(dirty()).not.toBeNull();
    await click(button("Kaydet") as HTMLButtonElement);
    await settle();
    expect(saveCurriculum.mock.calls[0]?.[2].resources).toEqual([]);
  });

  it("stays when the question is answered Vazgeç", async () => {
    await mount(withFile());
    await click(buttonIn(section(), tr.removeResource) as HTMLButtonElement);
    const ask = document.querySelector('[role="alertdialog"]') as HTMLElement;
    await click(buttonIn(ask, tr.cancel) as HTMLButtonElement);
    await settle();
    expect(field("resource-0-name")?.value).toBe("Bina metni");
    expect(dirty()).toBeNull();
  });
});

describe("Dosya yükle on a session's own resources", () => {
  const uploaded = {
    resource: {
      id: "lf1",
      lessonId: "l1",
      name: "tatbikat",
      meta: null,
      url: null,
      file: { ...pdf, name: "tatbikat.pdf" },
      orderIndex: 1,
    },
    courseVersion: 4,
  };
  const link = {
    id: "lr1",
    lessonId: "l1",
    name: "Şerh",
    meta: null,
    url: "https://drive.google.com/file/d/1/view",
    file: null,
    orderIndex: 0,
  };

  it("uploads to the session's route, adds the row, and sends it back by its id after a reorder", async () => {
    fetchMock.mockResolvedValue(answer(uploaded, 201));
    await mount(
      course({
        weeks: [
          {
            id: "w1",
            weekNumber: 1,
            title: "Mehmûz fiiller",
            lessons: [lesson([link])],
          },
        ],
      })
    );
    await click(buttonIn(session(), tr.uploadFile) as HTMLButtonElement);
    await pick(file("tatbikat.pdf", "application/pdf"));
    await send();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/files/lessons/l1/resources"
    );
    expect(sentForm().get("name")).toBeNull();
    expect(saveCurriculum).not.toHaveBeenCalled();

    const row = session().querySelector(
      '[data-testid="resource-lesson-0-0-1"]'
    ) as HTMLElement;
    expect(row.querySelector("a")?.getAttribute("href")).toBe(
      "/api/files/lessons/l1/resources/lf1"
    );
    expect(field("lesson-0-0-resource-1-url")).toBeNull();
    expect(dirty()).toBeNull();

    await click(buttonIn(row, tr.moveResourceUp) as HTMLButtonElement);
    await click(button("Kaydet") as HTMLButtonElement);
    await settle();
    const sent = saveCurriculum.mock.calls[0]?.[2];
    expect(sent.version).toBe(4);
    expect(sent.weeks[0].lessons[0].resources).toEqual([
      { id: "lf1", name: "tatbikat", meta: null },
      {
        id: "lr1",
        name: "Şerh",
        meta: null,
        url: "https://drive.google.com/file/d/1/view",
      },
    ]);
  });

  it("is not offered for a session added on this page until it is saved", async () => {
    await mount();
    await click(button("Celse ekle") as HTMLButtonElement);
    const added = document.querySelector(
      '[data-testid="resources-lesson-0-1"]'
    ) as HTMLElement;
    expect(buttonIn(added, tr.uploadFile)?.disabled).toBe(true);
    expect(added.textContent).toContain(tr.lessonUploadAfterSave);
    expect(buttonIn(session(), tr.uploadFile)?.disabled).toBe(false);
  });

  it("is not offered on a content-locked read", async () => {
    await mount(course({ contentLocked: true }));
    expect(buttonIn(section(), tr.uploadFile)).toBeUndefined();
    expect(buttonIn(session(), tr.uploadFile)).toBeUndefined();
  });
});
