// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeacherNoteEditor } from "~/features/teacher-note/components/teacher-note-editor";
import { TEACHER_NOTE_MAX } from "~/features/teacher-note/teacher-note";
import { cleanup, click, render, settle, type } from "./dom";

/**
 * "Ders notu" of a session: the Markdown as typed, the talebe's reading of it
 * beside it, and one `PUT /lessons/:id/teacher-note` on "Notu kaydet". The
 * action is a stub.
 */
const saveTeacherNote = vi.fn();

vi.mock("~/features/teacher-note/actions", () => ({
  saveTeacherNote: (...args: unknown[]) => saveTeacherNote(...args),
}));

const LESSON = "e5110000-0000-4000-8000-0000000000c1";

const mount = (note: string | null) =>
  render(
    <NextIntlClientProvider
      locale="tr"
      timeZone="Europe/Istanbul"
      messages={{ nazar: resources.tr.nazar }}
    >
      <ToastProvider>
        <TeacherNoteEditor lessonId={LESSON} note={note} />
        <Toaster />
      </ToastProvider>
    </NextIntlClientProvider>
  );

const textarea = () =>
  document.querySelector("textarea") as HTMLTextAreaElement;
const preview = () =>
  document.querySelector('section[aria-label="Önizleme"]') as HTMLElement;
const saveButton = () =>
  [...document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === "Notu kaydet"
  ) as HTMLButtonElement;
/** The "unsaved" line; the button holds an `output` of its own, for its busy state. */
const unsaved = () =>
  [...document.querySelectorAll("form output")].some(
    (o) => o.textContent === "Kaydedilmemiş değişiklik var"
  );
const toast = (tone: string) =>
  document.querySelector(`.mds-toast--${tone}`)?.textContent ?? "";
const save = async () => {
  await click(saveButton());
  await settle(40);
};

beforeEach(() => {
  saveTeacherNote.mockReset();
  saveTeacherNote.mockImplementation(
    async (_lesson: string, body: string | null) => ({
      success: true,
      data: { body },
    })
  );
});
afterEach(cleanup);

describe("Ders notu", () => {
  it("opens on the kept note, with its reading beside it and nothing to save", async () => {
    await mount("## Mâzî\n\n- **نَصَرَ**: yardım etti");
    expect(textarea().value).toBe("## Mâzî\n\n- **نَصَرَ**: yardım etti");
    expect(textarea().getAttribute("dir")).toBe("auto");
    expect(preview().querySelector("strong")?.textContent).toBe("نَصَرَ");
    expect(preview().querySelector("li")?.textContent).toBe("نَصَرَ: yardım etti");
    expect(unsaved()).toBe(false);
  });

  it("shows what the talebe will read as the müderris types, never as HTML", async () => {
    await mount(null);
    expect(preview().textContent).toContain(
      "Yazdıkça talebenin göreceği hâli burada belirir."
    );
    await type(textarea(), "**kalın** <img src=x onerror=alert(1)>");
    expect(preview().querySelector("strong")?.textContent).toBe("kalın");
    expect(preview().querySelector("img")).toBeNull();
    expect(preview().textContent).toContain("<img src=x onerror=alert(1)>");
    expect(unsaved()).toBe(true);
  });

  it("saves the note with its tail trimmed, and says so", async () => {
    await mount(null);
    await type(textarea(), "  girinti\n\n");
    await save();
    expect(saveTeacherNote).toHaveBeenCalledExactlyOnceWith(
      LESSON,
      "  girinti"
    );
    expect(toast("success")).toContain("Ders notu kaydedildi");
    expect(textarea().value).toBe("  girinti");
    expect(unsaved()).toBe(false);
  });

  it("removes the note when it is saved empty", async () => {
    await mount("eski not");
    await type(textarea(), "   ");
    await save();
    expect(saveTeacherNote).toHaveBeenCalledExactlyOnceWith(LESSON, null);
    expect(toast("success")).toContain("Ders notu kaldırıldı");
  });

  it("does not send a note over the API's length", async () => {
    await mount(null);
    await type(textarea(), "x".repeat(TEACHER_NOTE_MAX + 1));
    expect(document.body.textContent).toContain(
      `En çok ${TEACHER_NOTE_MAX} karakter olabilir.`
    );
    expect(saveButton().disabled).toBe(true);
    await save();
    expect(saveTeacherNote).not.toHaveBeenCalled();
  });

  it("keeps the draft and says so when the API refuses", async () => {
    saveTeacherNote.mockResolvedValue({ success: false, code: "FORBIDDEN" });
    await mount(null);
    await type(textarea(), "not");
    await save();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "Ders notu kaydedilemedi. Yeniden deneyin."
    );
    expect(textarea().value).toBe("not");
    expect(unsaved()).toBe(true);
  });
});
