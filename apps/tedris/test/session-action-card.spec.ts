// @vitest-environment happy-dom
import { act, createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionActionLabels } from "~/features/courses/components/session-action-card";
import { cleanup, render } from "./dom";

/**
 * The client pieces of the celse detail page on their own clock (MDRS-289):
 * the main card, the header badge and the agenda start from the instant the
 * server rendered at and move on every half minute, so a page left open
 * follows the celse from "upcoming" to "live" to "ended". What the card
 * offers to watch is the API's say at render time, and a card drawn before
 * the start of a celse with a stream opens the way at the start (MDRS-285),
 * as it says it will. The page around them is `session-page.spec.ts`.
 */

afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
});

const START = new Date("2026-10-03T18:00:00.000Z");
const minutes = (n: number) => new Date(START.getTime() + n * 60_000);
const WATCH = "/courses/c1/lessons/s1/izle";
const ZOOM = "https://zoom.us/j/1";

const labels: SessionActionLabels = {
  liveKind: "Canlı ders",
  inPersonKind: "Yüz yüze",
  recordingKind: "Ders kaydı",
  liveNow: "Şu an canlı",
  ended: "Sona erdi",
  cancelled: "İptal edildi",
  startsIn: "Başlamasına {time}",
  elapsed: "{minutes} dakikadır sürüyor",
  minutes: "{count} dk",
  joinOpens: "{minutes} DAKİKA ÖNCE",
  recordingTitle: "KAYIT BAŞLIĞI",
  recordingNotes: "NOTLAR YANINDA",
  streamTitle: "SÜRÜYOR",
  streamOpenTitle: "YAYIN AÇIK",
  recordingLater: "KAYIT SONRA",
  link: "BAĞLANTIYLA",
  inPerson: "YÜZ YÜZE",
  inPersonStream: "YÜZ YÜZE, YAYIN SONRA",
  stream: "YAYIN SONRA",
  noLink: "BAĞLANTI YOK",
  streamLive: "YAYIN ŞİMDİ",
  inPersonStreamLive: "YÜZ YÜZE, YAYIN ŞİMDİ",
  watchOrJoin: "İZLE YA DA KATIL",
  join: "Toplantıya katıl",
  newTab: " (yeni sekmede açılır)",
  reveal: "Bağlantıyı göster",
  watchStream: "Yayını izle",
  watchRecording: "Kaydı izle",
  noRecording: "KAYIT YOK",
  recordingPreparing: "HAZIRLANIYOR",
  recordingsGo: "Ders kayıtlarına git",
  cancelledTitle: "İPTAL",
  cancelledJoin: "BAĞLANTI YOK, İPTAL",
};

/** Lets the half-minute clocks tick until `at`. */
const tickTo = async (at: Date) => {
  await act(async () => {
    vi.setSystemTime(at);
    vi.advanceTimersByTime(30_000);
  });
};

const freeze = (renderedAt: Date) => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(renderedAt);
};

const mountCard = async (
  renderedAt: Date,
  over: Record<string, unknown> = {}
) => {
  freeze(renderedAt);
  const { SessionActionCard } = await import(
    "~/features/courses/components/session-action-card"
  );
  return render(
    createElement(SessionActionCard, {
      renderedAt: renderedAt.toISOString(),
      startsAt: START.toISOString(),
      durationMinutes: 60,
      cancelled: false,
      lessonId: "s1",
      time: {
        day: "3 Ekim Cumartesi",
        weekday: "Cumartesi",
        date: "3 Ekim",
        clock: "21:00–22:00",
        local: null,
      },
      locale: "tr",
      watchHref: WATCH,
      labels,
      ...over,
    })
  );
};

const watchLink = (host: HTMLElement) =>
  host.querySelector(`a.mds-btn[href="${WATCH}"]`) as HTMLAnchorElement | null;
const joinLink = (host: HTMLElement) =>
  host.querySelector(`a.mds-join__link`) as HTMLAnchorElement | null;
const caseOf = (host: HTMLElement) =>
  host.querySelector("[data-testid=session-action]")?.getAttribute("data-case");

describe("the main card on its clock (MDRS-285, MDRS-289)", () => {
  it("opens the way to a stream when its clock reaches the start, on a card drawn before it", async () => {
    const host = await mountCard(minutes(-1), { hasLiveStream: true });
    expect(caseOf(host)).toBe("date");
    expect(watchLink(host)).toBeNull();
    expect(host.querySelector("h2")?.textContent).toBe("YAYIN SONRA");
    await tickTo(minutes(1));
    expect(caseOf(host)).toBe("stream");
    expect(watchLink(host)?.textContent).toBe("Yayını izle");
    expect(host.textContent).toContain("YAYIN ŞİMDİ");
    expect(
      host.querySelector(`[data-poster="stream"]`)?.getAttribute("href")
    ).toBe(WATCH);
  });

  it("does not open it on its own for a celse with no stream", async () => {
    const host = await mountCard(minutes(-1), { hasLiveStream: false });
    await tickTo(minutes(1));
    expect(caseOf(host)).toBe("date");
    expect(watchLink(host)).toBeNull();
  });

  it("does not open it on its own once the scheduled time is over: only the API's link counts then", async () => {
    const host = await mountCard(minutes(61), { hasLiveStream: true });
    expect(watchLink(host)).toBeNull();
    expect(host.querySelector("h2")?.textContent).toBe("KAYIT YOK");
  });

  it("offers what the API sent at render time, the stream or the recording", async () => {
    const stream = await mountCard(minutes(75), {
      hasLiveStream: true,
      watch: { kind: "stream", provider: "YouTube" },
    });
    expect(watchLink(stream)?.textContent).toBe("Yayını izle");
    expect(stream.querySelector("h2")?.textContent).toBe("YAYIN AÇIK");
    await cleanup();
    const recording = await mountCard(minutes(75), {
      watch: { kind: "recording", provider: "YouTube", durationMinutes: 58 },
    });
    expect(watchLink(recording)?.textContent).toBe("Kaydı izle");
    expect(recording.textContent).not.toContain("Ders kayıtlarına git");
  });

  it("opens the meeting link ten minutes before the start, on the clock", async () => {
    const host = await mountCard(minutes(-11), {
      meetingUrl: ZOOM,
      platform: "zoom",
    });
    expect(joinLink(host)).toBeNull();
    expect(host.textContent).toContain("10 DAKİKA ÖNCE");
    expect(host.querySelector(".mds-platform-chip")?.textContent).toBe("Zoom");
    await tickTo(minutes(-9));
    expect(joinLink(host)?.getAttribute("href")).toBe(ZOOM);
    expect(joinLink(host)?.getAttribute("target")).toBe("_blank");
    expect(host.textContent).not.toContain("10 DAKİKA ÖNCE");
  });

  it("says what the meeting is for only beside a stream, while the meeting can be joined", async () => {
    const meeting = { meetingUrl: ZOOM, platform: "zoom" };
    const live = await mountCard(minutes(5), {
      ...meeting,
      hasLiveStream: true,
      watch: { kind: "stream" },
    });
    expect(live.textContent).toContain("İZLE YA DA KATIL");
    expect(joinLink(live)?.className).toContain("mds-btn--outline");
    await cleanup();
    const recording = await mountCard(minutes(5), {
      ...meeting,
      watch: { kind: "recording" },
    });
    expect(recording.textContent).not.toContain("İZLE YA DA KATIL");
    await cleanup();
    const over = await mountCard(minutes(75), {
      ...meeting,
      hasLiveStream: true,
      watch: { kind: "stream" },
    });
    expect(over.textContent).not.toContain("İZLE YA DA KATIL");
    expect(joinLink(over)).toBeNull();
  });

  it("moves the date block from the time left to the time run to the end", async () => {
    const host = await mountCard(minutes(-65), { inPerson: true });
    const block = () => host.querySelector("[data-date-block]")?.textContent;
    expect(block()).toContain("Başlamasına 1 saat 5 dakika");
    await tickTo(minutes(14));
    expect(block()).toContain("14 dakikadır sürüyor");
    await tickTo(minutes(60));
    expect(block()).toContain("Sona erdi");
  });

  it("offers the calendar the page drew while the celse is ahead, and not once it runs", async () => {
    const host = await mountCard(minutes(-2), {
      inPerson: true,
      calendar: createElement("button", { type: "button" }, "Takvime ekle"),
    });
    expect(host.querySelector("button")?.textContent).toBe("Takvime ekle");
    await tickTo(minutes(1));
    expect(host.querySelector("button")).toBeNull();
  });

  it("offers nothing to watch on a cancelled celse, and no way in", async () => {
    const host = await mountCard(minutes(5), {
      cancelled: true,
      meetingUrl: ZOOM,
      hasLiveStream: true,
      watch: { kind: "stream" },
      cancellation: "TELAFİ",
    });
    expect(caseOf(host)).toBe("cancelled");
    expect(host.querySelector('a[href$="/izle"]')).toBeNull();
    expect(joinLink(host)).toBeNull();
    expect(host.textContent).toContain("TELAFİ");
    expect(host.textContent).toContain("BAĞLANTI YOK, İPTAL");
  });

  it("keeps a locked card locked through the start", async () => {
    const host = await mountCard(minutes(-1), {
      locked: {
        reason: "KAYITLI TALEBELERE AÇIK",
        action: createElement("button", { type: "button" }, "Başvur"),
      },
      hasLiveStream: true,
    });
    expect(caseOf(host)).toBe("locked");
    await tickTo(minutes(1));
    expect(caseOf(host)).toBe("locked");
    expect(host.querySelector(".mds-join__status--locked")?.textContent).toBe(
      "KAYITLI TALEBELERE AÇIK"
    );
    expect(host.querySelector("button")?.textContent).toBe("Başvur");
    expect(watchLink(host)).toBeNull();
  });
});

describe("the header badge on its clock (MDRS-289)", () => {
  it("counts down, then says how long the celse has run, then that it is over", async () => {
    freeze(minutes(-8));
    const { SessionStateBadge } = await import(
      "~/features/courses/components/session-state-badge"
    );
    const host = await render(
      createElement(SessionStateBadge, {
        renderedAt: minutes(-8).toISOString(),
        startsAt: START.toISOString(),
        durationMinutes: 60,
        cancelled: false,
        locale: "tr",
        timeZone: "Europe/Istanbul",
        labels: {
          live: "Canlı · {minutes} dk",
          ended: "Sona erdi",
          cancelled: "İptal edildi",
        },
      })
    );
    expect(host.textContent).toBe("8 dakika sonra");
    await tickTo(minutes(24));
    expect(host.textContent).toBe("Canlı · 24 dk");
    expect(host.querySelector(".mds-badge--live")).not.toBeNull();
    await tickTo(minutes(61));
    expect(host.textContent).toBe("Sona erdi");
  });
});

describe("the agenda on its clock (MDRS-289)", () => {
  it("moves 'şimdi' to the step whose time has come", async () => {
    freeze(minutes(-1));
    const { SessionAgenda } = await import(
      "~/features/courses/components/session-agenda"
    );
    // 21:00 in İstanbul is 18:00Z.
    const host = await render(
      createElement(SessionAgenda, {
        agenda: [
          { time: "21:00", title: "Selâm" },
          { time: "21:25", title: "Kara’e" },
        ],
        renderedAt: minutes(-1).toISOString(),
        startsAt: START.toISOString(),
        durationMinutes: 60,
        courseTimeZone: "Europe/Istanbul",
        labels: {
          title: "Gündem",
          zone: "Saatler İstanbul saatiyle.",
          now: "şimdi",
        },
      })
    );
    const current = () =>
      host.querySelector('[aria-current="step"]')?.textContent ?? null;
    expect(current()).toBeNull();
    await tickTo(minutes(1));
    expect(current()).toContain("Selâm");
    expect(current()).toContain("şimdi");
    await tickTo(minutes(26));
    expect(current()).toContain("Kara’e");
    await tickTo(minutes(60));
    expect(current()).toBeNull();
  });
});
