// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { act, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assignmentDescriptionBody,
  assignmentStateOf,
  assignmentsOf,
} from "~/features/curriculum/curriculum";
import { cleanup, click, render, settle, type as typeInto } from "./dom";
import { expand } from "./server-render";

/**
 * "Ödev" on Müfredat: the homework the course team sets on a celse, in a
 * block of its own under the celse's resources, never one of their rows.
 * The owner, 2026-10-12: "ders/celse kaynağı ile ödev yükleme ve gösterim
 * alanları ayrı olsun, ödevin ödev olduğu anlaşılsın". The switch, the
 * description and each file are stored at once by their own writes, under
 * `session.manage`, never by "Kaydet". The reads, the actions and `fetch`
 * are stubs.
 */
type Answer<T> =
  | { status: "ok"; data: T }
  | { status: "forbidden" }
  | { status: "failed" };

const state = {
  course: { status: "failed" } as Answer<unknown>,
  permissions: { status: "failed" } as Answer<unknown>,
};
const actions = vi.hoisted(() => ({
  saveCurriculum: vi.fn(),
  saveLessonAssignment: vi.fn(),
  deleteLessonAssignment: vi.fn(),
  deleteLessonAssignmentFile: vi.fn(),
}));
let fetchMock: ReturnType<typeof vi.fn>;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
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
vi.mock("~/features/curriculum/actions", () => actions);
vi.mock("~/lib/unauthenticated", () => ({
  handleUnauthenticated: (result: unknown) =>
    result !== null &&
    typeof result === "object" &&
    (result as { kind?: unknown }).kind === "unauthenticated",
}));

const PDF = {
  name: "yonerge.pdf",
  contentType: "application/pdf",
  sizeBytes: 1_258_291,
};

const assignment = (over: Record<string, unknown> = {}) => ({
  id: "a-1",
  lessonId: "l-1",
  description: "Birinci babı çekin.",
  files: [
    {
      id: "af-1",
      ...PDF,
      createdAt: new Date("2026-10-01T09:00:00Z"),
      downloadUrl: "/lessons/l-1/assignment/files/af-1",
    },
  ],
  createdAt: new Date("2026-10-01T09:00:00Z"),
  updatedAt: new Date("2026-10-01T09:00:00Z"),
  ...over,
});

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

/** One running week: the first celse has a link and homework, the second neither. */
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
          assignment: assignment(),
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
const block = (prefix: string) =>
  document.querySelector(
    `[data-testid="assignment-${prefix}"]`
  ) as HTMLElement | null;
const resourcesOf = (prefix: string) =>
  document.querySelector(`[data-testid="resources-${prefix}"]`) as HTMLElement;
const switchIn = (root: ParentNode) =>
  root.querySelector('[role="switch"]') as HTMLElement | null;
const description = (root: ParentNode) =>
  root.querySelector(
    'textarea[name$="-assignment-description"]'
  ) as HTMLTextAreaElement | null;
const dialog = () =>
  document.querySelector(".mds-dialog") as HTMLElement | null;
const save = () =>
  buttonIn(
    document.querySelector('[data-testid="curriculum"]') as HTMLElement,
    "Kaydet"
  ) as HTMLButtonElement;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00+03:00"));
  state.course = { status: "ok", data: course() };
  state.permissions = holding("course.edit", "session.manage");
  for (const action of Object.values(actions)) action.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Ödev on a celse of Müfredat", () => {
  it("is a block of its own under the celse's resources, with its description and files, none of them a resource row", async () => {
    await mount();
    const own = block("lesson-0-0") as HTMLElement;
    expect(own.querySelector("legend")?.textContent).toBe("Ödev");
    expect(switchIn(own)?.getAttribute("aria-checked")).toBe("true");
    expect(description(own)?.value).toBe("Birinci babı çekin.");
    const link = own.querySelector(
      "a[href^='/api/files/']"
    ) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(
      "/api/files/lessons/l-1/assignment/af-1"
    );
    expect(link.textContent).toBe("yonerge.pdf");
    // the resource list holds its link alone
    const list = resourcesOf("lesson-0-0");
    expect(list.contains(own)).toBe(false);
    expect(list.textContent).not.toContain("yonerge.pdf");
    expect(
      (
        list.querySelector(
          '[name="lesson-0-0-resource-0-name"]'
        ) as HTMLInputElement
      ).value
    ).toBe("Emsile şerhi");
    expect(
      list.querySelector('[name="lesson-0-0-resource-1-name"]')
    ).toBeNull();
    // the second celse has none
    expect(
      switchIn(block("lesson-0-1") as HTMLElement)?.getAttribute("aria-checked")
    ).toBe("false");
  });

  it("turns homework on at once, with no description, and leaves the form with nothing to save", async () => {
    actions.saveLessonAssignment.mockResolvedValue({
      success: true,
      data: assignment({
        id: "a-2",
        lessonId: "l-2",
        description: null,
        files: [],
      }),
    });
    await mount();
    const other = block("lesson-0-1") as HTMLElement;
    expect(description(other)).toBeNull();
    await click(switchIn(other) as HTMLElement);
    await settle(30);
    expect(actions.saveLessonAssignment).toHaveBeenCalledWith("l-2", null);
    expect(switchIn(other)?.getAttribute("aria-checked")).toBe("true");
    expect(description(other)?.value).toBe("");
    expect(other.textContent).toContain("Bu ödeve henüz dosya eklenmedi.");
    expect(save().disabled).toBe(true);
    expect(actions.saveCurriculum).not.toHaveBeenCalled();
  });

  it("saves the description on its own, trimmed, and says so", async () => {
    actions.saveLessonAssignment.mockResolvedValue({
      success: true,
      data: assignment({ description: "İkinci babı da çekin." }),
    });
    await mount();
    const own = block("lesson-0-0") as HTMLElement;
    const button = buttonIn(own, "Açıklamayı kaydet") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await typeInto(
      description(own) as HTMLTextAreaElement,
      "  İkinci babı da çekin.  "
    );
    expect(own.textContent).toContain(
      "Açıklamada kaydedilmemiş değişiklik var."
    );
    await click(button);
    await settle(30);
    expect(actions.saveLessonAssignment).toHaveBeenCalledWith(
      "l-1",
      "İkinci babı da çekin."
    );
    expect(own.textContent).toContain("Açıklama kaydedildi.");
    expect(save().disabled).toBe(true);
  });

  it("asks before taking homework with a description or files off, then removes it", async () => {
    actions.deleteLessonAssignment.mockResolvedValue({
      success: true,
      data: undefined,
    });
    await mount();
    const own = block("lesson-0-0") as HTMLElement;
    await click(switchIn(own) as HTMLElement);
    await settle(30);
    expect(actions.deleteLessonAssignment).not.toHaveBeenCalled();
    expect(dialog()?.textContent).toContain(
      "Talebelerin teslim ettiği ödevler silinmez."
    );
    await click(
      buttonIn(dialog() as HTMLElement, "Ödevi kaldır") as HTMLElement
    );
    await settle(30);
    expect(actions.deleteLessonAssignment).toHaveBeenCalledWith("l-1");
    expect(switchIn(own)?.getAttribute("aria-checked")).toBe("false");
    expect(description(own)).toBeNull();
    expect(own.textContent).not.toContain("yonerge.pdf");
  });

  it("uploads a file to the homework's own route, the file alone, and lists it under the homework", async () => {
    fetchMock.mockResolvedValue(
      json(201, {
        ...assignment(),
        files: [
          ...assignment().files,
          {
            id: "af-2",
            name: "ornek.docx",
            contentType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            sizeBytes: 2048,
            createdAt: "2026-10-02T09:00:00Z",
            downloadUrl: "/lessons/l-1/assignment/files/af-2",
          },
        ],
      })
    );
    await mount();
    const own = block("lesson-0-0") as HTMLElement;
    await click(buttonIn(own, "Dosya yükle") as HTMLButtonElement);
    expect(own.textContent).toContain(
      resources.tr.nazar.Files.assignmentUploadNote
    );
    // a homework file has no name or line of its own
    expect(own.querySelector('input[name$="-upload-name"]')).toBeNull();
    const input = own.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [new File([new Uint8Array(2048)], "ornek.docx")],
      });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await click(buttonIn(own, "Yükle") as HTMLButtonElement);
    await settle(30);

    const [route, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(route).toBe("/api/files/lessons/l-1/assignment");
    expect((init.body as FormData).get("name")).toBeNull();
    const links = [...own.querySelectorAll("a[href^='/api/files/']")].map((a) =>
      a.getAttribute("href")
    );
    expect(links).toEqual([
      "/api/files/lessons/l-1/assignment/af-1",
      "/api/files/lessons/l-1/assignment/af-2",
    ]);
    expect(resourcesOf("lesson-0-0").textContent).not.toContain("ornek.docx");
    expect(save().disabled).toBe(true);
  });

  it("removes a file after asking, for good", async () => {
    actions.deleteLessonAssignmentFile.mockResolvedValue({
      success: true,
      data: undefined,
    });
    await mount();
    const own = block("lesson-0-0") as HTMLElement;
    await click(buttonIn(own, "yonerge.pdf dosyasını sil") as HTMLElement);
    await settle(20);
    expect(dialog()?.textContent).toContain("ödevden kalıcı olarak silinir.");
    await click(buttonIn(dialog() as HTMLElement, "Sil") as HTMLElement);
    await settle(30);
    expect(actions.deleteLessonAssignmentFile).toHaveBeenCalledWith(
      "l-1",
      "af-1"
    );
    expect(own.textContent).toContain("Bu ödeve henüz dosya eklenmedi.");
  });

  it("words a refusal and changes nothing", async () => {
    actions.saveLessonAssignment.mockResolvedValue({
      success: false,
      code: "AUTHZ_FORBIDDEN",
    });
    await mount();
    const other = block("lesson-0-1") as HTMLElement;
    await click(switchIn(other) as HTMLElement);
    await settle(30);
    expect(document.querySelector(".mds-toast--error")?.textContent).toContain(
      "Ödev kaydedilemedi"
    );
    expect(switchIn(other)?.getAttribute("aria-checked")).toBe("false");
  });

  it("is read-only without session.manage", async () => {
    state.permissions = holding("course.edit");
    await mount();
    const own = block("lesson-0-0") as HTMLElement;
    expect(own.textContent).toContain(
      "Celsenin ödevini değiştirmek için celse yönetimi izni gerekir."
    );
    expect(switchIn(own)?.getAttribute("aria-disabled")).toBe("true");
    expect(description(own)).toBeNull();
    expect(own.textContent).toContain("Birinci babı çekin.");
    expect(buttonIn(own, "Dosya yükle")).toBeUndefined();
    expect(buttonIn(own, "yonerge.pdf dosyasını sil")).toBeUndefined();
    expect((block("lesson-0-1") as HTMLElement).textContent).toContain(
      "Bu celsenin ödevi yok."
    );
  });

  it("offers nothing on a content-locked read, and waits for a new celse to be saved", async () => {
    state.course = {
      status: "ok",
      data: course({
        contentLocked: true,
        weeks: [
          {
            ...course().weeks[0],
            // a locked read carries no homework key at all
            lessons: course().weeks[0].lessons.map((one) => {
              const { assignment: _a, ...rest } = one as typeof one & {
                assignment?: unknown;
              };
              return rest;
            }),
          },
        ],
      }),
    };
    await mount();
    const own = block("lesson-0-0") as HTMLElement;
    expect(own.textContent).toContain(
      "celsenin ödevi gösterilmez ve burada değiştirilemez"
    );
    expect(switchIn(own)).toBeNull();

    await cleanup();
    state.course = { status: "ok", data: course() };
    await mount();
    await click(buttonIn(document.body, "Celse ekle") as HTMLButtonElement);
    await settle(20);
    const fresh = block("lesson-0-2") as HTMLElement;
    expect(fresh.textContent).toContain(
      "Yeni celseye ödev vermek için önce müfredatı kaydedin."
    );
    expect(switchIn(fresh)).toBeNull();
  });
});

describe("the rules of a celse's homework", () => {
  it("read each stored celse's homework, null for none and for a locked read", () => {
    expect(assignmentsOf(course() as never)).toEqual({
      "l-1": {
        description: "Birinci babı çekin.",
        files: [{ id: "af-1", ...PDF }],
      },
      "l-2": null,
    });
    expect(assignmentStateOf({ description: null, files: [] })).toEqual({
      description: "",
      files: [],
    });
  });

  it("send a trimmed description, and null for a blank one", () => {
    expect(assignmentDescriptionBody("  Çekin.\nYazın.  ")).toBe(
      "Çekin.\nYazın."
    );
    expect(assignmentDescriptionBody("   ")).toBeNull();
  });
});
