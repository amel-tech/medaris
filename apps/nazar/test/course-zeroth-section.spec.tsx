// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type { CourseZerothQuestionResponse } from "@medaris/services/tedrisat";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CourseZerothSection } from "~/features/online-exams/components/course-zeroth-section";
import { cleanup, click, render, settle, type as typeInto } from "./dom";

const save = vi.fn();
const remove = vi.fn();
vi.mock("~/features/online-exams/actions", () => ({
  saveCourseZerothQuestion: (id: string, body: unknown) => save(id, body),
  removeCourseZerothQuestion: (id: string) => remove(id),
}));

/** Answers the test lets through when it wants. */
const held: Array<() => void> = [];
const later = <T,>(value: T) =>
  new Promise<T>((resolve) => held.push(() => resolve(value)));

const AT = "2026-11-22T09:00:00.000Z";
const MEDRESE = {
  text: "Kopya çekmeyeceğine söz veriyor musun?",
  options: ["Evet", "Hayır"],
  updatedAt: new Date(AT),
};
const OWN = {
  text: "Bu hadisi ne zaman öğrendin?",
  options: ["Bu derste", "Daha önce"],
  updatedAt: new Date(AT),
};
const byDefault: CourseZerothQuestionResponse = {
  own: null,
  madrasah: MEDRESE,
  applies: "MADRASAH",
  inMadrasah: true,
};

const mount = (initial: CourseZerothQuestionResponse) =>
  render(
    <NextIntlClientProvider
      locale="tr"
      timeZone="Europe/Istanbul"
      messages={{ nazar: resources.tr.nazar }}
    >
      <ToastProvider>
        <CourseZerothSection courseId="c-1" initial={initial} />
        <Toaster />
      </ToastProvider>
    </NextIntlClientProvider>
  );

const section = () =>
  document.querySelector("[data-testid=course-zeroth]") as HTMLElement;
const button = (root: Element, label: string) =>
  [...root.querySelectorAll("button")].find(
    (b) => b.textContent === label
  ) as HTMLButtonElement;
const question = () =>
  document.querySelector("[name=zerothText]") as HTMLTextAreaElement;
const option = (n: number) =>
  document.querySelector(
    `input[aria-label="${n}. seçenek"]`
  ) as HTMLInputElement;
const toast = () =>
  document.querySelector(".mds-toast--error")?.textContent ?? "";

afterEach(async () => {
  await cleanup();
  held.length = 0;
  vi.clearAllMocks();
});

describe("a course's own zeroth question (MDRS-299)", () => {
  it("shows the medrese's by default, and saves one for the course from it", async () => {
    save.mockReturnValue(
      later({
        success: true,
        data: { ...byDefault, own: OWN, applies: "COURSE" },
      })
    );
    await mount(byDefault);
    expect(section().textContent).toContain("Medresenin sorusu");
    expect(section().textContent).toContain(MEDRESE.text);

    await click(button(section(), "Bu ders için değiştir"));
    // The form starts from the medrese's question.
    expect(question().value).toBe(MEDRESE.text);
    await typeInto(question(), OWN.text);
    await typeInto(option(1), "Bu derste");
    await typeInto(option(2), "Daha önce");
    await click(button(section(), "Kaydet"));
    expect(save).toHaveBeenCalledWith("c-1", {
      text: OWN.text,
      options: ["Bu derste", "Daha önce"],
    });
    // The fields stay open while it saves.
    expect(question().value).toBe(OWN.text);

    held.shift()?.();
    await settle();
    expect(section().textContent).toContain("Bu derse özel");
    expect(section().textContent).toContain(OWN.text);
    expect(button(section(), "Medresenin sorusuna dön")).toBeTruthy();
  });

  it("keeps what was typed when the save fails", async () => {
    save.mockResolvedValue({ success: false, code: "VALIDATION_ERROR" });
    await mount(byDefault);
    await click(button(section(), "Bu ders için değiştir"));
    await typeInto(question(), OWN.text);
    await click(button(section(), "Kaydet"));
    await settle();
    expect(question().value).toBe(OWN.text);
    expect(section().textContent).toContain("Kaydedilemedi");
  });

  it("goes back to the medrese's at once, and puts the course's own back if refused", async () => {
    remove.mockReturnValue(later({ success: false, code: "SOMETHING" }));
    await mount({ ...byDefault, own: OWN, applies: "COURSE" });
    await click(button(section(), "Medresenin sorusuna dön"));
    await settle(80);
    const ask = document.querySelector("[role=alertdialog]") as HTMLElement;
    await click(button(ask, "Medresenin sorusuna dön"));
    await settle(80);
    expect(remove).toHaveBeenCalledWith("c-1");
    expect(section().textContent).toContain("Medresenin sorusu");
    expect(section().textContent).not.toContain(OWN.text);

    held.shift()?.();
    await settle();
    expect(section().textContent).toContain(OWN.text);
    expect(toast()).toContain("kaldırılamadı");
  });

  it("asks a köşk's own course to write one, as no exam of it is published without", async () => {
    await mount({
      own: null,
      madrasah: null,
      applies: "NONE",
      inMadrasah: false,
    });
    expect(section().textContent).toContain("Sıfırıncı soru yok");
    await click(button(section(), "Bu ders için yaz"));
    expect(question().value).toBe("");
    expect(option(1).value).toBe("");
  });
});
