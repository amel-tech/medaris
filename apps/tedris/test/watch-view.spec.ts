// @vitest-environment happy-dom
import type {
  LessonNoteResponse,
  LessonQuestionResponse,
} from "@medaris/services/tedrisat";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WatchVideo } from "~/features/courses/components/watch-view";
import type { ReleaseWords } from "~/features/courses/recordings-model";
import { cleanup, click, render, settle } from "./dom";

/**
 * The watch page's client half (MDRS-285): the panel beside the video follows
 * what the stream's own player reports. The player is a fake on `window.YT`,
 * as YouTube's script would leave it; the spec plays the states a real
 * broadcast would send. Ended (0) turns "Canlı sohbet" into "Soru sor";
 * playing (1) or buffering (3) brings the chat back; an error, a pause and a
 * player not started change nothing. Nothing reaches the server but the
 * questions and notes the talebe reads and writes. The chat is the real one,
 * its frame never loaded: open from the start at every width, with YouTube's
 * own chat page one link away.
 */

const mocks = vi.hoisted(() => ({
  listNotes: vi.fn(),
  listQuestions: vi.fn(),
  ask: vi.fn(),
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

const notes = {
  listLessonNotes: mocks.listNotes,
  createLessonNote: vi.fn(),
  updateLessonNote: vi.fn(),
  deleteLessonNote: vi.fn(),
};
vi.mock("~/features/courses/actions/notes", () => notes);
vi.mock("../features/courses/actions/notes", () => notes);
const questions = {
  listMyCourseQuestions: vi.fn(),
  listMyLessonQuestions: mocks.listQuestions,
  askLessonQuestion: mocks.ask,
  updateLessonQuestion: vi.fn(),
  deleteLessonQuestion: vi.fn(),
};
vi.mock("~/features/courses/actions/questions", () => questions);
vi.mock("../features/courses/actions/questions", () => questions);

interface FakeEvents {
  onReady: () => void;
  onStateChange: (event: { data: number }) => void;
  onError: (event: { data: number }) => void;
}
const players: Array<{ frame: HTMLIFrameElement; events: FakeEvents }> = [];
class FakePlayer {
  constructor(frame: HTMLIFrameElement, options: { events: FakeEvents }) {
    players.push({ frame, events: options.events });
  }
  getCurrentTime() {
    return 1450;
  }
  seekTo() {}
}

// happy-dom would fetch every frame's address; the spec never leaves the machine.
const happyDOM = (
  globalThis as {
    happyDOM?: { settings: { disableIframePageLoading: boolean } };
  }
).happyDOM;
if (happyDOM) happyDOM.settings.disableIframePageLoading = true;

const ok = <T>(data: T) => ({ success: true as const, data });

const question = (id: string, body: string): LessonQuestionResponse => ({
  id,
  lessonId: "s1",
  lessonTitle: "Mehmûz fiiller",
  weekNumber: 3,
  body,
  createdAt: new Date("2026-10-03T19:00:00Z"),
  answer: null,
});

beforeEach(() => {
  // The page's clock: 24 minutes into the celse. Only Date is faked; the
  // timers stay real, so the panels' reads settle as they do in a browser.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-03T18:24:30.000Z"));
  players.length = 0;
  (window as unknown as { YT: unknown }).YT = { Player: FakePlayer };
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.listNotes.mockResolvedValue(ok([] as LessonNoteResponse[]));
  mocks.listQuestions.mockResolvedValue(
    ok([question("q1", "Kara'e niçin hemzeli?")])
  );
});
afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (window as unknown as { YT?: unknown }).YT;
});

const STREAM = "https://www.youtube.com/live/ybHyHDBiRoE";
const STREAM_FRAME =
  "https://www.youtube-nocookie.com/embed/ybHyHDBiRoE?enablejsapi=1";
const BUNNY =
  "https://player.mediadelivery.net/embed/424242/3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b?token=9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08&expires=1790000000";

const stream: WatchVideo = {
  kind: "stream",
  url: STREAM,
  embedUrl: STREAM_FRAME,
};

const mount = async (
  over: {
    video?: WatchVideo;
    release?: ReleaseWords | null;
    notes?: boolean;
    questions?: boolean;
  } = {}
) => {
  const { WatchView } = await import(
    "~/features/courses/components/watch-view"
  );
  const host = await render(
    createElement(WatchView, {
      courseId: "c1",
      courseTitle: "Emsile ve Bina",
      timeZone: "Europe/Istanbul",
      lessonId: "s1",
      weekNumber: 3,
      title: "Mehmûz fiiller",
      startsAt: "2026-10-03T18:00:00.000Z",
      renderedAt: "2026-10-03T18:24:00.000Z",
      video: stream,
      notes: true,
      questions: true,
      ...over,
    })
  );
  await settle();
  return host;
};

/** The player reports: a state change, or an error. */
const playerSays = async (event: { state: number } | { error: number }) => {
  await act(async () => {
    for (const { events } of players) {
      if ("state" in event) events.onStateChange({ data: event.state });
      else events.onError({ data: event.error });
    }
  });
  await settle();
};

/** The "Canlı sohbet" panel: YouTube's chat of the stream. */
const chat = (host: HTMLElement) =>
  [...host.querySelectorAll("section")].find(
    (section) => section.querySelector("h2")?.textContent === "Canlı sohbet"
  ) ?? null;
const chatFrame = (host: HTMLElement) =>
  chat(host)?.querySelector<HTMLIFrameElement>("iframe") ?? null;
/** "Sohbeti YouTube'da aç": the same chat as YouTube's own page. */
const popout = (host: HTMLElement) =>
  [...host.querySelectorAll<HTMLAnchorElement>("a")].find((a) =>
    a.textContent?.includes("Sohbeti YouTube'da aç")
  );
const top = (host: HTMLElement) =>
  host.querySelector('[data-watch-panel="top"]') as HTMLElement;
const notesPanel = (host: HTMLElement) =>
  host.querySelector('[data-watch-panel="notes"]') as HTMLElement;
/** The "Soru sor" panel, when it is in sight. */
const askPanel = (host: HTMLElement) => {
  const panel = host.querySelector('section[aria-labelledby="questions-s1"]');
  return panel && !panel.closest("[hidden]") ? panel : null;
};
/** The badge of the header line, beside the title. */
const badge = (host: HTMLElement) =>
  host.querySelector("h1")?.parentElement?.querySelector(".mds-badge")
    ?.textContent;
/** What a screen reader hears change: the phase, not the minutes. */
const status = (host: HTMLElement) =>
  host.querySelector('[aria-live="polite"]')?.textContent;
const frame = (host: HTMLElement) =>
  host.querySelector<HTMLIFrameElement>("iframe#watch-frame");
const button = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement;

describe("a live stream", () => {
  it("plays with the player API on, the chat beside it and the notes under the chat", async () => {
    const host = await mount();
    expect(frame(host)?.getAttribute("src")).toBe(STREAM_FRAME);
    const src = new URL(chatFrame(host)?.src ?? "");
    expect(src.pathname).toBe("/live_chat");
    expect(src.searchParams.get("v")).toBe("ybHyHDBiRoE");
    expect(src.searchParams.get("embed_domain")).toBe(location.hostname);
    expect(askPanel(host)).toBeNull();
    expect(host.textContent).toContain("Notlarım");
    expect(badge(host)).toBe("Canlı · 24 dk");
    expect(status(host)).toBe("Canlı");
    expect(host.textContent).toContain("Soru sormak için canlı sohbete yaz.");
    // The questions are not read while nobody can see them.
    expect(mocks.listQuestions).not.toHaveBeenCalled();
  });

  it("carries 'Sohbeti YouTube'da aç' beside the chat's title: the same chat on YouTube's own page, in a new tab", async () => {
    const host = await mount();
    const link = popout(host);
    expect(link?.closest("section")).toBe(chat(host));
    expect(link?.parentElement?.querySelector("h2")?.textContent).toBe(
      "Canlı sohbet"
    );
    const href = new URL(link?.href ?? "");
    expect(href.origin + href.pathname).toBe(
      "https://www.youtube.com/live_chat"
    );
    expect(href.searchParams.get("is_popout")).toBe("1");
    expect(href.searchParams.get("v")).toBe("ybHyHDBiRoE");
    expect(link?.target).toBe("_blank");
    expect(link?.rel).toBe("noopener noreferrer");
    expect(link?.textContent).toContain("(yeni sekmede açılır)");
    // It goes with the chat when the stream ends.
    await playerSays({ state: 0 });
    expect(popout(host)).toBeUndefined();
  });

  it("fills the panel beside the video with the chat, and gives the room back to 'Soru sor' once it ended", async () => {
    const host = await mount();
    // The side column is as tall as the video beside it, and the chat takes
    // what the notes leave of it; the width is read off the page's main.
    expect(host.querySelector("main")?.className).toContain("@container");
    expect(host.querySelector("aside")?.className).toContain("self-stretch");
    expect(top(host).className).toContain("@min-[1036px]:flex-1");
    expect(top(host).className).toContain("min-block-[36rem]");
    expect(chat(host)?.className).toContain("flex-1");
    await playerSays({ state: 0 });
    // "Soru sor" keeps its own height: the notes stay right under it.
    expect(top(host).className).not.toContain("flex-1");
  });

  it("listens to the player the notes read: one player for the frame", async () => {
    await mount();
    expect(players).toHaveLength(1);
    expect(players[0].frame.id).toBe("watch-frame");
  });

  it("has a header line: back to the course, the week and title, the details link; no join card", async () => {
    const host = await mount();
    const h1 = host.querySelector("h1");
    expect(h1?.textContent).toBe("Hafta 3 · Mehmûz fiiller");
    const links = [...host.querySelectorAll("a")].map((a) => [
      a.getAttribute("href"),
      a.textContent,
    ]);
    expect(links).toContainEqual([
      "/tr/courses/c1",
      "Derse dön: Emsile ve Bina",
    ]);
    expect(links).toContainEqual([
      "/tr/courses/c1/lessons/s1",
      "Celse ayrıntıları",
    ]);
    expect(host.textContent).not.toContain("Celseye katıl");
    expect(host.querySelector(".mds-join")).toBeNull();
  });
});

describe("the live/ended switch", () => {
  it("turns the chat into 'Soru sor' when the player reports ended (0), and keeps the player", async () => {
    const host = await mount();
    await playerSays({ state: 1 });
    await playerSays({ state: 0 });
    expect(chat(host)).toBeNull();
    expect(askPanel(host)?.textContent).toContain("Soru sor");
    expect(mocks.listQuestions).toHaveBeenCalledWith("c1", "s1");
    expect(host.textContent).toContain("Kara'e niçin hemzeli?");
    expect(badge(host)).toBe("Yayın bitti");
    expect(status(host)).toBe("Yayın bitti");
    expect(host.textContent).toContain(
      "Canlı yayın bitti. Ders kaydı eklenince burada oynar."
    );
    expect(frame(host)?.getAttribute("src")).toBe(STREAM_FRAME);
  });

  it("brings the chat back when the stream plays (1) or buffers (3) again", async () => {
    const host = await mount();
    await playerSays({ state: 0 });
    await playerSays({ state: 1 });
    expect(chat(host)).not.toBeNull();
    expect(askPanel(host)).toBeNull();
    expect(badge(host)).toBe("Canlı · 24 dk");
    expect(status(host)).toBe("Canlı");

    await playerSays({ state: 0 });
    expect(chat(host)).toBeNull();
    await playerSays({ state: 3 });
    expect(chat(host)).not.toBeNull();
  });

  it("does not switch on a player error, a pause, or a player not started or cued", async () => {
    const host = await mount();
    for (const event of [
      { error: 150 },
      { error: 5 },
      { state: 2 },
      { state: -1 },
      { state: 5 },
    ]) {
      await playerSays(event);
      expect(chat(host)).not.toBeNull();
      expect(askPanel(host)).toBeNull();
    }
    await playerSays({ state: 0 });
    for (const event of [
      { error: 101 },
      { state: 2 },
      { state: -1 },
      { state: 5 },
    ]) {
      await playerSays(event);
      expect(chat(host)).toBeNull();
      expect(askPanel(host)).not.toBeNull();
    }
  });

  it("keeps a question being written when the stream starts again", async () => {
    const host = await mount();
    await playerSays({ state: 0 });
    const field = askPanel(host)?.querySelector(
      "textarea"
    ) as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      )?.set?.call(field, "Yarım kalan soru");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await playerSays({ state: 1 });
    await playerSays({ state: 0 });
    expect(
      (askPanel(host)?.querySelector("textarea") as HTMLTextAreaElement).value
    ).toBe("Yarım kalan soru");
    expect(mocks.listQuestions).toHaveBeenCalledTimes(1);
  });

  it("asks a question on this celse, with no celse to pick", async () => {
    mocks.ask.mockResolvedValue(ok(question("q2", "Yeni soru")));
    const host = await mount();
    await playerSays({ state: 0 });
    const panel = askPanel(host) as HTMLElement;
    expect(panel.querySelector('[role="combobox"], select')).toBeNull();
    expect(panel.textContent).toContain(
      "Sorularını ve cevaplarını yalnızca sen, dersin müderrisi ve ders nazırı görür; diğer talebeler görmez."
    );
    const field = panel.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      )?.set?.call(field, "Yeni soru");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      panel
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        );
    });
    await settle();
    expect(mocks.ask).toHaveBeenCalledWith("s1", "Yeni soru");
    expect(panel.textContent?.indexOf("Yeni soru")).toBeLessThan(
      panel.textContent?.indexOf("Kara'e niçin hemzeli?") ?? 0
    );
  });

  it("leaves only the video to a viewer who neither asks nor takes notes, once the stream ended", async () => {
    const host = await mount({ notes: false, questions: false });
    expect(chat(host)).not.toBeNull();
    expect(host.textContent).not.toContain("Notlarım");
    await playerSays({ state: 0 });
    expect(host.querySelector("aside")).toBeNull();
    expect(mocks.listQuestions).not.toHaveBeenCalled();
  });
});

describe("a recording", () => {
  const youtube: WatchVideo = {
    kind: "recording",
    title: "Mehmûz fiiller",
    embedUrl: "https://www.youtube-nocookie.com/embed/abcdefgh?enablejsapi=1",
    openUrl: "https://www.youtube.com/watch?v=abcdefgh",
    bunny: false,
    facts: "Ders kaydı · 3 Ekim 2026 · 58 dk",
    reportsPosition: true,
  };

  it("has 'Soru sor' beside it and no chat, and its facts in the badge", async () => {
    const host = await mount({ video: youtube });
    expect(chat(host)).toBeNull();
    expect(askPanel(host)).not.toBeNull();
    expect(badge(host)).toBe("Ders kaydı · 3 Ekim 2026 · 58 dk");
  });

  it("lists the talebe's questions on this celse with their answers, as rows of the panel", async () => {
    mocks.listQuestions.mockResolvedValue(
      ok([
        {
          ...question("q1", "Kara'e niçin hemzeli?"),
          answer: {
            body: "Lâm'ül-fiili hemzedir.",
            answeredAt: new Date("2026-10-04T08:00:00Z"),
            answeredBy: { id: "m1", name: "Abdülhamit Karaosmanoğlu" },
          },
        },
        question("q2", "Emr-i hâzır nasıl?"),
      ])
    );
    const host = await mount({ video: youtube });
    const panel = askPanel(host) as HTMLElement;
    const rows = panel.querySelectorAll("li article");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Cevaplandı");
    expect(rows[0].textContent).toContain("Cevap: Abdülhamit Karaosmanoğlu");
    expect(rows[0].textContent).toContain("Lâm'ül-fiili hemzedir.");
    expect(rows[1].textContent).toContain("Cevap bekleniyor");
    // A row, not a card, and no line naming the celse the panel is about.
    expect(rows[0].classList.contains("mds-card")).toBe(false);
    expect(panel.textContent).not.toContain("Hafta 3 · Mehmûz fiiller");
    expect(button(host, "Düzenle")).toBeDefined();
  });

  it("stamps a note from the YouTube player, which the page itself does not listen to", async () => {
    const host = await mount({ video: youtube });
    expect(players).toHaveLength(1);
    await act(async () => players[0].events.onReady());
    expect(button(host, "Şimdiki an")).toBeDefined();
    // A recording's end changes nothing beside it.
    await playerSays({ state: 0 });
    expect(askPanel(host)).not.toBeNull();
  });

  it("plays a Bunny recording in its signed frame, the time of a note typed", async () => {
    const host = await mount({
      video: {
        kind: "recording",
        title: "Mehmûz fiiller",
        embedUrl: BUNNY,
        openUrl: BUNNY,
        bunny: true,
        facts: "Ders kaydı",
        reportsPosition: false,
      },
    });
    const bunny = frame(host);
    expect(bunny?.getAttribute("src")).toBe(BUNNY);
    expect(bunny?.getAttribute("title")).toBe(
      "Ders kaydı oynatıcısı: Mehmûz fiiller"
    );
    expect(bunny?.hasAttribute("sandbox")).toBe(false);
    expect(players).toHaveLength(0);
    expect(button(host, "Şimdiki an")).toBeUndefined();
    expect(host.textContent).toContain(
      "İsteğe bağlı: oynatıcıdaki süreyi yaz."
    );
  });
});

describe("a recording held back until its release time (MDRS-288)", () => {
  const releaseLine = (host: HTMLElement) =>
    host
      .querySelector("[data-recording-release]")
      ?.textContent?.replace(/\s+/g, " ")
      .trim();

  it("tells a talebe beside the stream when the recording opens, and again once the stream ended", async () => {
    const host = await mount({
      release: {
        text: "Ders kaydı 14 Ekim Çarşamba 20:00’de açılır.",
        zone: "İstanbul saatiyle · 19:00 senin saatinle",
      },
    });
    expect(releaseLine(host)).toBe(
      "Ders kaydı 14 Ekim Çarşamba 20:00’de açılır. İstanbul saatiyle · 19:00 senin saatinle"
    );
    // In the header line, after the badge it does not take the place of.
    expect(
      host
        .querySelector("h1")
        ?.parentElement?.contains(
          host.querySelector("[data-recording-release]")
        )
    ).toBe(true);
    expect(badge(host)).toBe("Canlı · 24 dk");
    await playerSays({ state: 0 });
    expect(host.textContent).toContain(
      "Canlı yayın bitti. Ders kaydı açılınca burada oynar."
    );
    expect(host.textContent).not.toContain("Ders kaydı eklenince");
  });

  it("marks the recording the course team plays early", async () => {
    const host = await mount({
      video: {
        kind: "recording",
        title: "Mehmûz fiiller",
        embedUrl: "https://www.youtube-nocookie.com/embed/abcdefgh",
        openUrl: "https://www.youtube.com/watch?v=abcdefgh",
        bunny: false,
        facts: "Ders kaydı · 3 Ekim 2026 · 58 dk",
        reportsPosition: false,
      },
      release: {
        text: "Talebelere 14 Ekim Çarşamba 20:00’de açılacak",
        zone: null,
      },
      notes: false,
      questions: false,
    });
    expect(frame(host)?.getAttribute("src")).toBe(
      "https://www.youtube-nocookie.com/embed/abcdefgh"
    );
    expect(releaseLine(host)).toBe(
      "Talebelere 14 Ekim Çarşamba 20:00’de açılacak"
    );
  });

  it("says nothing of a release without one", async () => {
    const host = await mount();
    expect(host.querySelector("[data-recording-release]")).toBeNull();
  });
});

describe("on a phone", () => {
  it("opens the chat in its tab from the start: the frame and the link to YouTube, nothing to unfold", async () => {
    // Every media query answers as a phone's would (narrow, light).
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const host = await mount();
    expect(button(host, "Canlı sohbet").getAttribute("aria-pressed")).toBe(
      "true"
    );
    const panel = top(host);
    expect(panel.className).not.toContain("max-md:hidden");
    expect(panel.querySelector("details, summary")).toBeNull();
    expect(chatFrame(host)?.closest('[data-watch-panel="top"]')).toBe(panel);
    expect(chatFrame(host)?.src).toContain("/live_chat?v=ybHyHDBiRoE");
    expect(popout(host)?.closest('[data-watch-panel="top"]')).toBe(panel);
  });

  it("puts the two panels under two tabs, the chat's or the questions' first", async () => {
    const host = await mount();
    const tabs = host.querySelector("fieldset.mds-tabs") as HTMLElement;
    expect(tabs.className).toContain("md:hidden");
    expect(tabs.querySelector("legend")?.textContent).toBe("Bölümler");
    expect(button(host, "Canlı sohbet").getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(top(host).className).not.toContain("max-md:hidden");
    expect(notesPanel(host).className).toContain("max-md:hidden");

    await click(button(host, "Notlarım"));
    expect(button(host, "Notlarım").getAttribute("aria-pressed")).toBe("true");
    expect(top(host).className).toContain("max-md:hidden");
    expect(notesPanel(host).className).not.toContain("max-md:hidden");

    await playerSays({ state: 0 });
    expect(button(host, "Soru sor")).toBeDefined();
    expect(button(host, "Canlı sohbet")).toBeUndefined();
  });

  it("draws no tabs with one panel only", async () => {
    const host = await mount({ notes: false, questions: false });
    expect(host.querySelector("fieldset.mds-tabs")).toBeNull();
  });
});
