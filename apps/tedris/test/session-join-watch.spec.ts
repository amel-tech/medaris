// @vitest-environment happy-dom
import { act, createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "./dom";

/**
 * The join card's way to the watch page (MDRS-285), on its own clock: what
 * plays there is the API's say at render time, and a card drawn before the
 * start of a celse that has a stream opens the way when its clock reaches
 * the start, as it says it will. The page around it is `session-page.spec.ts`.
 */

vi.mock("@medaris/ui/mds/toast", () => ({
  useToaster: () => ({ notify: () => "", dismiss: () => {} }),
}));
vi.mock("~/lib/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
});

const START = new Date("2026-10-03T18:00:00.000Z");
const minutes = (n: number) => new Date(START.getTime() + n * 60_000);
const WATCH = "/courses/c1/lessons/s1/izle";

const labels = {
  label: "Canlı ders",
  liveLabel: "Şu an canlı",
  endedLabel: "Sona erdi",
  cancelledLabel: "İptal edildi",
  cancelledText: "İPTAL",
  noLinkText: "BAĞLANTI YOK",
  inPersonText: "YÜZ YÜZE",
  streamText: "YAYIN SONRA",
  streamLiveText: "YAYIN ŞİMDİ",
  inPersonStreamText: "YÜZ YÜZE, YAYIN SONRA",
  inPersonStreamLiveText: "YÜZ YÜZE, YAYIN ŞİMDİ",
  joinOpensText: "{minutes} DAKİKA ÖNCE",
  joinLabel: "Celseye katıl",
  newTabLabel: " (yeni sekmede açılır)",
  revealLabel: "Bağlantıyı göster",
  localTimeLabel: "senin saatinle",
  minuteUnit: "dk",
  recordingsLabel: "Ders kayıtlarına git",
  watchStreamLabel: "Yayını izle",
  watchRecordingLabel: "Kaydı izle",
  watchOrJoinText: "İZLE YA DA KATIL",
};

const mount = async (renderedAt: Date, over: Record<string, unknown> = {}) => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(renderedAt);
  const { SessionJoinLive } = await import(
    "~/features/courses/components/session-join-live"
  );
  return render(
    createElement(SessionJoinLive, {
      renderedAt: renderedAt.toISOString(),
      startsAt: START.toISOString(),
      durationMinutes: 60,
      cancelled: false,
      title: "Mehmûz fiiller",
      courseId: "c1",
      courseTitle: "Emsile ve Bina",
      lessonId: "s1",
      locale: "tr",
      timeZone: "Europe/Istanbul",
      courseTimeZone: "Europe/Istanbul",
      labels,
      watchHref: WATCH,
      watch: null,
      ...over,
    })
  );
};

/** Lets the card's half-minute clock tick until `at`. */
const tickTo = async (at: Date) => {
  await act(async () => {
    vi.setSystemTime(at);
    vi.advanceTimersByTime(30_000);
  });
};

const watchLink = (host: HTMLElement) =>
  host.querySelector(`a[href="${WATCH}"]`) as HTMLAnchorElement | null;

describe("the join card's way to the watch page (MDRS-285)", () => {
  it("opens the way to a stream when its clock reaches the start, on a card drawn before it", async () => {
    const host = await mount(minutes(-1), { hasLiveStream: true });
    expect(watchLink(host)).toBeNull();
    expect(host.textContent).toContain("YAYIN SONRA");
    await tickTo(minutes(1));
    expect(watchLink(host)?.textContent).toBe("Yayını izle");
    expect(host.textContent).toContain("YAYIN ŞİMDİ");
  });

  it("does not open it on its own for a celse with no stream", async () => {
    const host = await mount(minutes(-1), { hasLiveStream: false });
    await tickTo(minutes(1));
    expect(watchLink(host)).toBeNull();
  });

  it("does not open it on its own once the scheduled time is over: only the API's link counts then", async () => {
    const host = await mount(minutes(61), { hasLiveStream: true });
    expect(watchLink(host)).toBeNull();
  });

  it("offers what the API sent at render time, the stream or the recording", async () => {
    const stream = await mount(minutes(75), {
      hasLiveStream: true,
      watch: "stream",
    });
    expect(watchLink(stream)?.textContent).toBe("Yayını izle");
    await cleanup();
    const recording = await mount(minutes(75), { watch: "recording" });
    expect(watchLink(recording)?.textContent).toBe("Kaydı izle");
    expect(recording.textContent).not.toContain("Ders kayıtlarına git");
  });

  it("says what the meeting is for only beside a stream, while the meeting can be joined", async () => {
    const meeting = { meetingUrl: "https://zoom.us/j/1", platform: "zoom" };
    const live = await mount(minutes(5), {
      ...meeting,
      hasLiveStream: true,
      watch: "stream",
    });
    expect(live.textContent).toContain("İZLE YA DA KATIL");
    await cleanup();
    const recording = await mount(minutes(5), {
      ...meeting,
      watch: "recording",
    });
    expect(recording.textContent).not.toContain("İZLE YA DA KATIL");
    await cleanup();
    const over = await mount(minutes(75), {
      ...meeting,
      hasLiveStream: true,
      watch: "stream",
    });
    expect(over.textContent).not.toContain("İZLE YA DA KATIL");
  });

  it("offers nothing to watch on a cancelled celse, nor where the card is given no watch page", async () => {
    const cancelled = await mount(minutes(5), {
      cancelled: true,
      hasLiveStream: true,
      watch: "stream",
    });
    expect(watchLink(cancelled)).toBeNull();
    await cleanup();
    const elsewhere = await mount(minutes(5), {
      hasLiveStream: true,
      watch: "stream",
      watchHref: undefined,
    });
    expect(elsewhere.querySelector('a[href$="/izle"]')).toBeNull();
  });
});
