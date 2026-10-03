// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type { CourseDetailResponse } from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionsView } from "~/features/courses/components/sessions-view";
import {
  liveStreamProblem,
  liveStreamRefusal,
} from "~/features/courses/present";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * "Canlı yayın" on Celseler (nizam 56, MDRS-228): the column and the buttons
 * only for someone tedrisat lets set the link, the inline form that adds,
 * changes and removes it, and the messages for a link that cannot be one.
 */

const actions = vi.hoisted(() => ({
  setLiveStream: vi.fn(),
  patchLesson: vi.fn(),
  cancelSession: vi.fn(),
}));
vi.mock("~/features/courses/actions", () => actions);
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@medaris/ui/components/sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const ID = "dQw4w9WgXcQ";
const STUDIO = `https://studio.youtube.com/video/${ID}/livestreaming`;
const STORED = `https://www.youtube.com/live/${ID}`;
const tr = resources.tr.nizam.Sessions;

const lesson = (
  id: string,
  at: string,
  extra: Record<string, unknown> = {}
) => ({
  id,
  weekId: "w1",
  title: `Celse ${id}`,
  type: "LIVE",
  durationMinutes: 60,
  scheduledAt: at,
  isPreview: false,
  orderIndex: 0,
  cancelledAt: null,
  meetingUrl: "https://zoom.us/j/1",
  ...extra,
});

const course = {
  id: "c1",
  koskId: "k1",
  title: "Emsile ve Bina",
  version: 3,
  timeZone: "Europe/Istanbul",
  weeks: [
    {
      id: "w1",
      weekNumber: 5,
      title: "Mehmûz fiiller",
      lessons: [
        lesson("past", "2026-09-26T18:00:00.000Z"),
        lesson("live", "2026-10-03T18:00:00.000Z"),
        lesson("gone", "2026-10-04T17:00:00.000Z", {
          cancelledAt: "2026-10-03T05:40:00.000Z",
        }),
        lesson("next", "2026-10-07T18:00:00.000Z"),
      ],
    },
  ],
} as unknown as CourseDetailResponse;

let root: Root;
let host: HTMLElement;

const mount = async (liveStreams: Record<string, string> | null) => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <NextIntlClientProvider
        locale="tr"
        timeZone="Europe/Istanbul"
        messages={{ nizam: resources.tr.nizam } as never}
      >
        <SessionsView
          kosk={{ id: "k1", name: "N" }}
          course={course}
          recordings={{}}
          liveStreams={liveStreams}
          tedrisUrl={null}
        />
      </NextIntlClientProvider>
    );
  });
};

const buttons = (text: string) =>
  [...host.querySelectorAll<HTMLButtonElement>("button")].filter(
    (b) => b.textContent?.trim() === text
  );

const click = async (button: HTMLElement | undefined) => {
  if (!button) throw new Error("no such button");
  await act(async () => button.click());
};

const type = async (text: string) => {
  const input = host.querySelector<HTMLInputElement>(
    "input[name=liveStreamUrl]"
  );
  if (!input) throw new Error("no stream field");
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const submit = async () => {
  const form = host.querySelector<HTMLFormElement>(
    "[data-testid=session-edit]"
  );
  if (!form) throw new Error("no form");
  await act(async () => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    );
  });
};

/** The text of the row whose first cell names the session. */
const rowOf = (id: string) =>
  [...host.querySelectorAll("tr")].find((tr) =>
    tr.textContent?.includes(`Celse ${id}`)
  )?.textContent ?? "";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-03T18:14:00Z"));
  actions.setLiveStream.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("Celseler — the live stream control (nizam 56, MDRS-228)", () => {
  it("is left out for someone who may not set the link", async () => {
    await mount(null);
    expect(host.textContent).not.toContain(tr.stream.column);
    expect(buttons(tr.stream.add)).toHaveLength(0);
    expect(buttons(tr.stream.update)).toHaveLength(0);
    // the meeting link's own buttons are still there
    expect(buttons(tr.updateLink).length).toBeGreaterThan(0);
  });

  it("says on each row whether a stream is set, and offers the right button", async () => {
    await mount({ next: STORED });
    expect(host.textContent).toContain(tr.stream.column);
    expect(rowOf("next")).toContain(tr.stream.set);
    expect(rowOf("live")).toContain(tr.stream.missing);
    expect(rowOf("past")).toContain(tr.stream.missing);
    // one "add" (the live session), one "update" (the planned one with a
    // link), none for the cancelled session or the past one
    expect(buttons(tr.stream.add)).toHaveLength(1);
    expect(buttons(tr.stream.update)).toHaveLength(1);
    expect(rowOf("gone")).not.toContain(tr.stream.add);
  });

  it("adds a link from YouTube Studio, stored as the /live/ link", async () => {
    actions.setLiveStream.mockResolvedValue({
      success: true,
      data: { lessonId: "live", liveStreamUrl: STORED },
    });
    await mount({});
    await click(buttons(tr.stream.add)[0]);
    expect(host.textContent).toContain(tr.stream.formHelp);
    await type(STUDIO);
    await submit();

    expect(actions.setLiveStream).toHaveBeenCalledWith(
      "k1",
      "c1",
      "live",
      STORED
    );
    expect(toast.success).toHaveBeenCalledWith(tr.stream.saved);
    expect(host.querySelector("[data-testid=session-edit]")).toBeNull();
    expect(rowOf("live")).toContain(tr.stream.set);
  });

  it("changes a link: the field opens with the stored one", async () => {
    actions.setLiveStream.mockResolvedValue({
      success: true,
      data: { lessonId: "next", liveStreamUrl: STORED },
    });
    await mount({ next: "https://www.youtube.com/live/jNQXAC9IVRw" });
    await click(buttons(tr.stream.update)[0]);
    const input = host.querySelector<HTMLInputElement>(
      "input[name=liveStreamUrl]"
    );
    expect(input?.value).toBe("https://www.youtube.com/live/jNQXAC9IVRw");
    await type(`https://youtu.be/${ID}`);
    await submit();
    expect(actions.setLiveStream).toHaveBeenCalledWith(
      "k1",
      "c1",
      "next",
      STORED
    );
  });

  it("removes a link with null", async () => {
    actions.setLiveStream.mockResolvedValue({
      success: true,
      data: { lessonId: "next", liveStreamUrl: null },
    });
    await mount({ next: STORED });
    await click(buttons(tr.stream.update)[0]);
    await click(buttons(tr.stream.remove)[0]);

    expect(actions.setLiveStream).toHaveBeenCalledWith(
      "k1",
      "c1",
      "next",
      null
    );
    expect(toast.success).toHaveBeenCalledWith(tr.stream.removed);
    expect(rowOf("next")).toContain(tr.stream.missing);
  });

  it("offers no remove button while the session has no link", async () => {
    await mount({});
    await click(buttons(tr.stream.add)[0]);
    expect(buttons(tr.stream.remove)).toHaveLength(0);
  });

  it.each([
    ["a channel link", "https://www.youtube.com/@ismailaga/live", "channel"],
    ["another host", "https://vimeo.com/123456789", "notYoutube"],
    ["a plain http link", `http://youtu.be/${ID}`, "notHttps"],
    ["an empty field", "", "empty"],
  ] as const)("refuses %s before sending it", async (_name, value, key) => {
    await mount({});
    await click(buttons(tr.stream.add)[0]);
    await type(value);
    await submit();
    expect(actions.setLiveStream).not.toHaveBeenCalled();
    expect(host.textContent).toContain(tr.stream.problems[key]);
  });

  it("shows tedrisat's refusal of the link under the field", async () => {
    actions.setLiveStream.mockResolvedValue({
      success: false,
      error: "x",
      errorBody: {
        code: "LIVE_STREAM_URL_INVALID",
        context: { problem: "channel" },
      },
    });
    await mount({});
    await click(buttons(tr.stream.add)[0]);
    await type(STUDIO);
    await submit();
    expect(host.textContent).toContain(tr.stream.problems.channel);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it.each([
    ["LESSON_CANCELLED", tr.stream.errors.cancelled],
    ["AUTHZ_FORBIDDEN", tr.errors.forbidden],
  ])("tells %s in a toast", async (code, message) => {
    actions.setLiveStream.mockResolvedValue({
      success: false,
      error: "x",
      errorBody: { code },
    });
    await mount({});
    await click(buttons(tr.stream.add)[0]);
    await type(STUDIO);
    await submit();
    expect(toast.error).toHaveBeenCalledWith(
      tr.failed,
      expect.objectContaining({ description: message })
    );
    // the form stays open with what was typed
    expect(host.querySelector("[data-testid=session-edit]")).not.toBeNull();
  });
});

describe("liveStreamProblem and liveStreamRefusal", () => {
  it("takes every link tedrisat stores, and names the reason otherwise", () => {
    expect(liveStreamProblem(STUDIO)).toBeNull();
    expect(liveStreamProblem(`youtu.be/${ID}`)).toBeNull();
    expect(liveStreamProblem("https://www.youtube.com/channel/UC1")).toBe(
      "channel"
    );
    expect(liveStreamProblem("https://www.youtube.com/")).toBe("noVideo");
  });

  it("puts the link's own problem under the field and the rest in a toast", () => {
    expect(
      liveStreamRefusal({
        code: "LIVE_STREAM_URL_INVALID",
        context: { problem: "not-youtube" },
      })
    ).toEqual({ field: "notYoutube" });
    expect(liveStreamRefusal({ code: "LIVE_STREAM_URL_INVALID" })).toEqual({
      field: "noVideo",
    });
    expect(liveStreamRefusal({ code: "LESSON_NOT_LIVE" })).toEqual({
      toast: "stream.errors.notLive",
    });
    expect(liveStreamRefusal({ code: "COURSE_VERSION_CONFLICT" })).toEqual({
      toast: "errors.versionConflict",
    });
    expect(liveStreamRefusal(undefined)).toEqual({ toast: "errors.generic" });
  });
});
