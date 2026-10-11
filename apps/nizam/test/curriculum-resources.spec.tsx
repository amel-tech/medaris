// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type { CourseDetailResponse } from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CurriculumEditor } from "~/features/courses/components/curriculum-editor";
import { cleanup, click, render, settle, type as typeInto } from "./dom";

// MDRS-279: "Bağlı kaynaklar" on the curriculum. The rows are part of the
// form: they make it dirty, "Vazgeç" puts them back, and "Kaydet" refuses a
// row tedrisat would refuse before anything is sent.

const saveCurriculum = vi.fn();
vi.mock("~/features/courses/actions", () => ({
  saveCurriculum: (...a: unknown[]) => saveCurriculum(...a),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const course = {
  id: "c1",
  koskId: "k1",
  title: "Emsile ve Bina",
  description: "Sarf",
  coverHue: 20,
  version: 3,
  timeZone: "Europe/Istanbul",
  muderris: [],
  weeks: [],
  resources: [
    {
      id: "r1",
      name: "Bina",
      meta: "PDF · 124 sayfa",
      type: "pdf",
      url: "https://files.medaris.org/bina.pdf",
    },
  ],
} as unknown as CourseDetailResponse;

const mount = (read: CourseDetailResponse = course) =>
  render(
    <NextIntlClientProvider
      locale="tr"
      timeZone="Europe/Istanbul"
      messages={{ nizam: resources.tr.nizam } as never}
    >
      <CurriculumEditor kosk={{ id: "k1", name: "N" }} course={read} />
    </NextIntlClientProvider>
  );

const button = (label: string) =>
  [...document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement;
const field = (name: string) =>
  document.querySelector(`[name="${name}"]`) as HTMLInputElement | null;
const dirty = () => document.querySelector('[data-testid="dirty"]');
const section = () =>
  document.querySelector('[data-testid="resources"]')?.textContent ?? "";

beforeEach(() => {
  saveCurriculum.mockReset();
  saveCurriculum.mockResolvedValue({ success: true, data: course });
});
afterEach(async () => {
  await cleanup();
});

describe("Bağlı kaynaklar (MDRS-279)", () => {
  it("makes the form dirty when a row is removed, and Vazgeç puts it back", async () => {
    await mount();
    expect(dirty()).toBeNull();
    await click(button("Kaynağı çıkar"));
    expect(field("resource-0-name")).toBeNull();
    expect(dirty()).not.toBeNull();
    await click(button("Vazgeç"));
    expect(field("resource-0-name")?.value).toBe("Bina");
    expect(dirty()).toBeNull();
  });

  it("does not send a row without a name or an http(s) address, and says which", async () => {
    await mount();
    await click(button("Kaynak ekle"));
    await typeInto(field("resource-1-url") as HTMLInputElement, "bina.pdf");
    await click(button("Kaydet"));
    await settle();
    expect(saveCurriculum).not.toHaveBeenCalled();
    expect(section()).toContain("Kaynağın adını yazın.");
    expect(section()).toContain(
      "Bağlantı, http:// ya da https:// ile başlayan tam bir adres olmalı."
    );
  });

  it("sends an added link after the stored one, as a link with no line", async () => {
    await mount();
    await click(button("Kaynak ekle"));
    await typeInto(field("resource-1-name") as HTMLInputElement, "Emsile");
    await typeInto(
      field("resource-1-url") as HTMLInputElement,
      "https://emsile.test/"
    );
    await click(button("Kaydet"));
    await settle();
    expect(saveCurriculum).toHaveBeenCalledTimes(1);
    expect(saveCurriculum.mock.calls[0]?.[2].resources).toEqual([
      {
        id: "r1",
        name: "Bina",
        meta: "PDF · 124 sayfa",
        type: "pdf",
        url: "https://files.medaris.org/bina.pdf",
      },
      { name: "Emsile", meta: null, type: "link", url: "https://emsile.test/" },
    ]);
  });

  it("saves a row stored without an address, sending none, so tedrisat keeps it", async () => {
    await mount({
      ...course,
      resources: [
        { id: "r2", name: "Emsile", meta: null, type: null, url: null },
      ],
    } as unknown as CourseDetailResponse);
    await typeInto(field("title") as HTMLInputElement, "Emsile");
    await click(button("Kaydet"));
    await settle();
    expect(saveCurriculum).toHaveBeenCalledTimes(1);
    expect(saveCurriculum.mock.calls[0]?.[2].resources).toEqual([
      { id: "r2", name: "Emsile", meta: null, type: undefined },
    ]);
  });

  it("shows a content-locked read's rows read-only and saves them as they are", async () => {
    await mount({
      ...course,
      contentLocked: true,
      resources: [
        { id: "r1", name: "Bina", meta: "PDF · 124 sayfa", type: "pdf" },
      ],
    } as unknown as CourseDetailResponse);
    expect(section()).toContain("Bina");
    expect(section()).toContain(
      resources.tr.nizam.Curriculum.resourcesLocked as string
    );
    expect(field("resource-0-url")).toBeNull();
    expect(field("resource-0-name")).toBeNull();
    expect(button("Kaynak ekle")).toBeUndefined();
    expect(button("Kaynağı çıkar")).toBeUndefined();
    await typeInto(field("title") as HTMLInputElement, "Emsile");
    await click(button("Kaydet"));
    await settle();
    expect(saveCurriculum).toHaveBeenCalledTimes(1);
    expect(saveCurriculum.mock.calls[0]?.[2].resources).toEqual([
      { id: "r1", name: "Bina", meta: "PDF · 124 sayfa", type: "pdf" },
    ]);
  });
});

// MDRS-286: each session's own links, under its kaynak. They are part of the
// form like the course's; a save sends a session's list only when it changed,
// as the PUT counts any change to it as session work.
describe("Celsenin kaynakları (MDRS-286)", () => {
  const links = [
    {
      id: "lr1",
      lessonId: "l1",
      name: "Emsile şerhi",
      meta: "PDF · 12 sayfa",
      url: "https://drive.google.com/file/d/1a2b3c/view",
      orderIndex: 0,
    },
    {
      id: "lr2",
      lessonId: "l1",
      name: "Tatbikat",
      meta: null,
      url: "https://files.medaris.org/tatbikat.pdf",
      orderIndex: 1,
    },
  ];
  const withSession = (
    resources: unknown[] = links,
    over: Record<string, unknown> = {}
  ) =>
    ({
      ...course,
      resources: [],
      weeks: [
        {
          id: "w1",
          weekNumber: 1,
          title: "Mehmûz fiiller",
          lessons: [
            {
              id: "l1",
              weekId: "w1",
              title: "Birinci",
              type: "LIVE",
              durationMinutes: 60,
              scheduledAt: "2026-10-14T18:00:00.000Z",
              meetingUrl: "https://zoom.us/j/1",
              kaynak: "Bina",
              agenda: [],
              isPreview: false,
              orderIndex: 0,
              cancelledAt: null,
              replacementLessonId: null,
              inPerson: false,
              inPersonOverride: null,
              hasLiveStream: false,
              resources,
            },
          ],
        },
      ],
      ...over,
    }) as unknown as CourseDetailResponse;
  const group = () =>
    document.querySelector(
      '[data-testid="resources-lesson-0-0"]'
    ) as HTMLElement;
  const row = (ri: number) =>
    document.querySelector(
      `[data-testid="resource-lesson-0-0-${ri}"]`
    ) as HTMLElement;
  const within = (root: ParentNode, label: string) =>
    [...root.querySelectorAll("button")].find(
      (b) =>
        b.textContent?.trim() === label ||
        b.getAttribute("aria-label") === label
    ) as HTMLButtonElement;
  const sentSession = () =>
    saveCurriculum.mock.calls[0]?.[2].weeks[0].lessons[0] as Record<
      string,
      unknown
    >;
  const save = async () => {
    await click(button("Kaydet"));
    await settle();
  };

  it("lists a session's links under its kaynak, in order, to edit", async () => {
    await mount(withSession());
    expect(group().textContent).toContain("Celsenin kaynakları");
    expect(field("lesson-0-0-resource-0-name")?.value).toBe("Emsile şerhi");
    expect(field("lesson-0-0-resource-0-meta")?.value).toBe("PDF · 12 sayfa");
    expect(field("lesson-0-0-resource-0-url")?.value).toBe(
      "https://drive.google.com/file/d/1a2b3c/view"
    );
    expect(field("lesson-0-0-resource-1-name")?.value).toBe("Tatbikat");
    expect(field("lesson-0-0-resource-0-url")?.maxLength).toBe(500);
    // the first row cannot go up, the last cannot go down
    expect(within(row(0), "Yukarı taşı").disabled).toBe(true);
    expect(within(row(1), "Aşağı taşı").disabled).toBe(true);
  });

  it("says so when a session has none, and offers to add one", async () => {
    await mount(withSession([]));
    expect(group().textContent).toContain(
      "Bu celseye henüz kaynak bağlanmadı."
    );
    expect(within(group(), "Kaynak ekle")).toBeDefined();
  });

  it("sends no list for a session whose links did not change", async () => {
    await mount(withSession());
    await typeInto(field("title") as HTMLInputElement, "Emsile");
    await save();
    expect(saveCurriculum).toHaveBeenCalledTimes(1);
    expect(sentSession()).toMatchObject({ id: "l1" });
    expect(Object.keys(sentSession())).not.toContain("resources");
  });

  it("adds, renames, reorders and removes a session's links, and sends the list whole", async () => {
    await mount(withSession());
    await click(within(group(), "Kaynak ekle"));
    expect(dirty()).not.toBeNull();
    await typeInto(
      field("lesson-0-0-resource-2-name") as HTMLInputElement,
      "Bina"
    );
    await typeInto(
      field("lesson-0-0-resource-2-url") as HTMLInputElement,
      "https://files.medaris.org/bina.pdf"
    );
    await typeInto(
      field("lesson-0-0-resource-1-name") as HTMLInputElement,
      "Tatbikat defteri"
    );
    await click(within(row(1), "Yukarı taşı"));
    expect(field("lesson-0-0-resource-0-name")?.value).toBe("Tatbikat defteri");
    await click(within(row(1), "Kaynağı çıkar"));
    expect(field("lesson-0-0-resource-1-name")?.value).toBe("Bina");
    await save();
    expect(saveCurriculum).toHaveBeenCalledTimes(1);
    expect(sentSession().resources).toEqual([
      {
        id: "lr2",
        name: "Tatbikat defteri",
        meta: null,
        url: "https://files.medaris.org/tatbikat.pdf",
      },
      { name: "Bina", meta: null, url: "https://files.medaris.org/bina.pdf" },
    ]);
  });

  it("puts a session's links back with Vazgeç", async () => {
    await mount(withSession());
    await click(within(row(0), "Aşağı taşı"));
    expect(field("lesson-0-0-resource-0-name")?.value).toBe("Tatbikat");
    await click(button("Vazgeç"));
    expect(field("lesson-0-0-resource-0-name")?.value).toBe("Emsile şerhi");
    expect(dirty()).toBeNull();
  });

  it("does not send a link without a name or an http(s) address, and says so on its row", async () => {
    await mount(withSession([]));
    await click(within(group(), "Kaynak ekle"));
    await typeInto(
      field("lesson-0-0-resource-0-url") as HTMLInputElement,
      "drive.google.com/file/d/1a2b3c"
    );
    await save();
    expect(saveCurriculum).not.toHaveBeenCalled();
    expect(row(0).textContent).toContain("Kaynağın adını yazın.");
    expect(row(0).textContent).toContain(
      "Bağlantı, http:// ya da https:// ile başlayan tam bir adres olmalı."
    );
    // the course's own section is not blamed
    expect(section()).not.toContain("Kaynağın adını yazın.");
  });

  it("shows a content-locked read's links by name only, and sends none back", async () => {
    await mount(
      withSession(
        links.map(({ url: _url, ...rest }) => rest),
        { contentLocked: true }
      )
    );
    expect(group().textContent).toContain("Emsile şerhi");
    expect(group().textContent).toContain(
      resources.tr.nizam.Curriculum.lessonResourcesLocked as string
    );
    expect(field("lesson-0-0-resource-0-name")).toBeNull();
    expect(within(group(), "Kaynak ekle")).toBeUndefined();
    expect(within(group(), "Kaynağı çıkar")).toBeUndefined();
    await typeInto(field("title") as HTMLInputElement, "Emsile");
    await save();
    expect(saveCurriculum).toHaveBeenCalledTimes(1);
    expect(Object.keys(sentSession())).not.toContain("resources");
  });
});
