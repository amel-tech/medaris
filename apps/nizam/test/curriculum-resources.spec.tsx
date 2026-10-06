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
