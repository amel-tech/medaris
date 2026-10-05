// @vitest-environment happy-dom
import type { LessonNoteResponse } from "@medaris/services/tedrisat";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, render, settle } from "./dom";

/**
 * The notes panel (MDRS-150): the author's notes next to a video, a new note
 * stamped from the YouTube player when there is one, and a typed time when
 * there is not (Drive and other hosts report no position).
 */

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  player: { current: null as null | Record<string, unknown> },
}));

vi.mock("next-intl", async () => {
  const { resources } = await import("@medaris/i18n");
  return {
    useLocale: () => "tr",
    useTranslations: (namespace: string) => {
      const read = (key: string) =>
        [...namespace.split("."), ...key.split(".")].reduce<unknown>(
          (node, part) => (node as Record<string, unknown>)?.[part],
          resources.tr
        ) as string;
      return (key: string, values?: Record<string, string | number>) =>
        read(key).replace(/\{(\w+)\}/g, (_, name) =>
          String(values?.[name] ?? "")
        );
    },
  };
});

vi.mock("~/features/courses/actions/notes", () => ({
  listLessonNotes: mocks.list,
  createLessonNote: mocks.create,
  updateLessonNote: mocks.update,
  deleteLessonNote: mocks.remove,
}));
vi.mock("../features/courses/actions/notes", () => ({
  listLessonNotes: mocks.list,
  createLessonNote: mocks.create,
  updateLessonNote: mocks.update,
  deleteLessonNote: mocks.remove,
}));

// The real hook loads YouTube's script; the spec decides what the player says.
const frames: Array<string | null> = [];
vi.mock("~/features/courses/youtube-player", () => ({
  useYouTubePlayer: (frameId: string | null) => {
    frames.push(frameId);
    return frameId ? mocks.player.current : null;
  },
}));
vi.mock("../features/courses/youtube-player", () => ({
  useYouTubePlayer: (frameId: string | null) => {
    frames.push(frameId);
    return frameId ? mocks.player.current : null;
  },
}));

const note = (
  id: string,
  over: Partial<LessonNoteResponse> = {}
): LessonNoteResponse => ({
  id,
  lessonId: "l1",
  offsetSeconds: null,
  body: id,
  createdAt: new Date("2026-10-03T18:00:00Z"),
  updatedAt: new Date("2026-10-03T18:00:00Z"),
  ...over,
});

const ok = <T>(data: T) => ({ success: true as const, data });

const player = (position: number) => ({
  position: vi.fn(() => position),
  seekTo: vi.fn(),
});

beforeEach(() => {
  for (const m of [mocks.list, mocks.create, mocks.update, mocks.remove]) {
    m.mockReset();
  }
  mocks.list.mockResolvedValue(ok([]));
  mocks.player.current = null;
  frames.length = 0;
});
afterEach(cleanup);

const mount = async (props: { frameId?: string | null } = {}) => {
  const { LessonNotes } = await import(
    "~/features/courses/components/lesson-notes"
  );
  const host = await render(
    createElement(LessonNotes, { lessonId: "l1", ...props })
  );
  await settle();
  return host;
};

const set = async (el: HTMLInputElement | HTMLTextAreaElement, value: string) =>
  act(async () => {
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });

const textarea = (host: HTMLElement) =>
  host.querySelector("textarea") as HTMLTextAreaElement;
const timeInput = (host: HTMLElement) =>
  host.querySelector("input") as HTMLInputElement;
const button = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(label)
  ) as HTMLButtonElement;
const submit = async (host: HTMLElement) => {
  await act(async () => {
    host
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await settle();
};

describe("the panel", () => {
  it("lists the notes the API returns, by position, with their times", async () => {
    mocks.list.mockResolvedValue(
      ok([
        note("ikinci", { offsetSeconds: 754 }),
        note("zamansız"),
        note("birinci", { offsetSeconds: 5 }),
      ])
    );
    const host = await mount();
    expect(mocks.list).toHaveBeenCalledWith("l1");
    const text = host.textContent ?? "";
    expect(text).toContain("Notlarım");
    expect(text).toContain("Yalnızca sen görürsün.");
    expect(text.indexOf("birinci")).toBeLessThan(text.indexOf("ikinci"));
    expect(text.indexOf("ikinci")).toBeLessThan(text.indexOf("zamansız"));
    expect(text).toContain("0:05");
    expect(text).toContain("12:34");
    expect(text).toContain("Zamansız");
  });

  it("renders a note's Markdown and never its HTML", async () => {
    mocks.list.mockResolvedValue(
      ok([note("n1", { body: "**kalın** <img src=x onerror=alert(1)>" })])
    );
    const host = await mount();
    expect(host.querySelector("strong")?.textContent).toBe("kalın");
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("says so when there are no notes, and when they could not be read", async () => {
    const empty = await mount();
    expect(empty.textContent).toContain("henüz notun yok");
    await cleanup();

    mocks.list.mockResolvedValue({ success: false, error: "x", status: 500 });
    const failed = await mount();
    expect(failed.querySelector('[role="alert"]')?.textContent).toContain(
      "yüklenemedi"
    );
    mocks.list.mockResolvedValue(ok([note("geldi")]));
    await click(button(failed, "Yeniden dene"));
    await settle();
    expect(failed.textContent).toContain("geldi");
  });
});

describe("with the YouTube player", () => {
  it("fills the time from the player when the talebe starts writing", async () => {
    mocks.player.current = player(754);
    const host = await mount({ frameId: "recording-frame" });
    expect(frames).toContain("recording-frame");
    expect(host.textContent).toContain("Oynatıcıdaki an yazılır");

    await act(async () => {
      textarea(host).dispatchEvent(
        new FocusEvent("focusin", { bubbles: true })
      );
      textarea(host).focus();
    });
    expect(timeInput(host).value).toBe("12:34");
  });

  it("keeps a time the talebe typed, and refills it on 'Şimdiki an'", async () => {
    const control = player(90);
    mocks.player.current = control;
    const host = await mount({ frameId: "live-stream-frame" });
    await set(timeInput(host), "5:00");
    await act(async () => textarea(host).focus());
    expect(timeInput(host).value).toBe("5:00");

    await click(button(host, "Şimdiki an"));
    expect(control.position).toHaveBeenCalled();
    expect(timeInput(host).value).toBe("1:30");
  });

  it("saves the note with the player's position in seconds", async () => {
    mocks.player.current = player(754);
    mocks.create.mockResolvedValue(
      ok(note("yeni", { body: "Yeni not", offsetSeconds: 754 }))
    );
    const host = await mount({ frameId: "recording-frame" });
    await act(async () => textarea(host).focus());
    await set(textarea(host), "Yeni not");
    await submit(host);

    expect(mocks.create).toHaveBeenCalledWith("l1", {
      body: "Yeni not",
      offsetSeconds: 754,
    });
    expect(host.textContent).toContain("Yeni not");
    expect(textarea(host).value).toBe("");
    expect(timeInput(host).value).toBe("");
  });

  it("moves the player when a note's time is pressed", async () => {
    const control = player(0);
    mocks.player.current = control;
    mocks.list.mockResolvedValue(ok([note("n1", { offsetSeconds: 754 })]));
    const host = await mount({ frameId: "recording-frame" });
    await click(button(host, "12:34"));
    expect(control.seekTo).toHaveBeenCalledWith(754);
  });
});

describe("without a player to read (Drive and other hosts)", () => {
  it("offers a typed time and no button to take one from the player", async () => {
    const host = await mount({ frameId: null });
    expect(host.textContent).toContain("Örneğin 12:34. Boş bırakabilirsin.");
    expect(button(host, "Şimdiki an")).toBeUndefined();
    await act(async () => textarea(host).focus());
    expect(timeInput(host).value).toBe("");
  });

  it("saves the typed time as seconds", async () => {
    mocks.create.mockResolvedValue(ok(note("yeni", { offsetSeconds: 754 })));
    const host = await mount({ frameId: null });
    await set(textarea(host), "Kayıttan not");
    await set(timeInput(host), "12:34");
    await submit(host);
    expect(mocks.create).toHaveBeenCalledWith("l1", {
      body: "Kayıttan not",
      offsetSeconds: 754,
    });
  });

  it("saves a note with the time left empty, as no position", async () => {
    mocks.create.mockResolvedValue(ok(note("yeni")));
    const host = await mount({ frameId: null });
    await set(textarea(host), "Zamansız not");
    await submit(host);
    expect(mocks.create).toHaveBeenCalledWith("l1", {
      body: "Zamansız not",
      offsetSeconds: null,
    });
  });

  it("does not save a time that is not one, nor an empty note", async () => {
    const host = await mount({ frameId: null });
    await set(textarea(host), "Not");
    await set(timeInput(host), "12:75");
    await submit(host);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "12:34 ya da 1:02:03"
    );

    await set(timeInput(host), "");
    await set(textarea(host), "   ");
    await submit(host);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "boş olamaz"
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("shows a time as a plain label, not a button that seeks", async () => {
    mocks.list.mockResolvedValue(ok([note("n1", { offsetSeconds: 754 })]));
    const host = await mount({ frameId: null });
    expect(button(host, "12:34")).toBeUndefined();
    expect(host.textContent).toContain("12:34");
  });
});

describe("editing and deleting", () => {
  it("edits the body and the time, and re-places the note", async () => {
    mocks.list.mockResolvedValue(
      ok([
        note("a", { body: "ilk", offsetSeconds: 10 }),
        note("b", { body: "ikinci", offsetSeconds: 20 }),
      ])
    );
    mocks.update.mockResolvedValue(
      ok(note("a", { body: "ilk (düzeltildi)", offsetSeconds: 30 }))
    );
    const host = await mount();
    await click(button(host, "Düzenle"));
    const body = host.querySelector("li textarea");
    const inputs = host.querySelectorAll("li input");
    await set(body as HTMLTextAreaElement, "ilk (düzeltildi)");
    await set(inputs[inputs.length - 1] as HTMLInputElement, "0:30");
    await click(button(host, "Kaydet"));
    await settle();

    expect(mocks.update).toHaveBeenCalledWith("l1", "a", {
      body: "ilk (düzeltildi)",
      offsetSeconds: 30,
    });
    const text = host.textContent ?? "";
    expect(text.indexOf("ikinci")).toBeLessThan(
      text.indexOf("ilk (düzeltildi)")
    );
  });

  it("clears a note's time when the field is emptied", async () => {
    mocks.list.mockResolvedValue(ok([note("a", { offsetSeconds: 10 })]));
    mocks.update.mockResolvedValue(ok(note("a", { offsetSeconds: null })));
    const host = await mount();
    await click(button(host, "Düzenle"));
    const inputs = host.querySelectorAll("li input");
    await set(inputs[inputs.length - 1] as HTMLInputElement, "");
    await click(button(host, "Kaydet"));
    await settle();
    expect(mocks.update).toHaveBeenCalledWith("l1", "a", {
      body: "a",
      offsetSeconds: null,
    });
  });

  it("asks before deleting, then removes the note", async () => {
    mocks.list.mockResolvedValue(ok([note("a"), note("b")]));
    mocks.remove.mockResolvedValue(ok(undefined));
    const host = await mount();
    await click(button(host, "Sil"));
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Silinsin mi?");

    const confirm = [...host.querySelectorAll("button")].filter((b) =>
      b.textContent?.includes("Sil")
    );
    await click(confirm[0]);
    await settle();
    expect(mocks.remove).toHaveBeenCalledWith("l1", "a");
    expect(host.querySelectorAll("li")).toHaveLength(1);
  });

  it("says when the API refused the write, and keeps what was typed", async () => {
    mocks.create.mockResolvedValue({
      success: false,
      error: "x",
      status: 403,
    });
    const host = await mount();
    await set(textarea(host), "Not");
    await submit(host);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "derse kayıtlı olman gerekir"
    );
    expect(textarea(host).value).toBe("Not");
  });
});
