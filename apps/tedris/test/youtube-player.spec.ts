// @vitest-environment happy-dom
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PlayerControl,
  PlayerEvent,
} from "~/features/courses/youtube-player";
import { cleanup, render, settle } from "./dom";

/**
 * The YouTube player hook (MDRS-150, MDRS-285): one `YT.Player` per frame
 * however many pieces of the page read it, its position for the notes, and
 * every state change and error it reports for the watch page. The API is a
 * fake on `window.YT`, as YouTube's script would leave it.
 */

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
    return 754.6;
  }
  seekTo = vi.fn();
}

// happy-dom would fetch every frame's address; the spec never leaves the machine.
const happyDOM = (
  globalThis as {
    happyDOM?: { settings: { disableIframePageLoading: boolean } };
  }
).happyDOM;
if (happyDOM) happyDOM.settings.disableIframePageLoading = true;

beforeEach(() => {
  players.length = 0;
  (window as unknown as { YT: unknown }).YT = { Player: FakePlayer };
});
afterEach(async () => {
  await cleanup();
  delete (window as unknown as { YT?: unknown }).YT;
});

/** A frame and two readers of its player, as the watch page has them. */
const mount = async (frameId: string | null = "f1") => {
  const { useYouTubePlayer } = await import(
    "~/features/courses/youtube-player"
  );
  const heard: PlayerEvent[] = [];
  const controls: { page: PlayerControl | null; notes: PlayerControl | null } =
    { page: null, notes: null };
  const Page = () => {
    controls.page = useYouTubePlayer(frameId, (event) => heard.push(event));
    return null;
  };
  const Notes = () => {
    controls.notes = useYouTubePlayer(frameId);
    return null;
  };
  await render(
    createElement(
      "div",
      null,
      createElement("iframe", { id: "f1", title: "video" }),
      createElement(Page),
      createElement(Notes)
    )
  );
  await settle();
  return { heard, controls };
};

describe("useYouTubePlayer", () => {
  it("makes one player for the frame, whoever asks", async () => {
    await mount();
    expect(players).toHaveLength(1);
    expect(players[0].frame.id).toBe("f1");
  });

  it("gives both readers the position once the player is ready", async () => {
    const { controls } = await mount();
    expect(controls.page).toBeNull();
    expect(controls.notes).toBeNull();
    await act(async () => players[0].events.onReady());
    expect(controls.page?.position()).toBe(754);
    expect(controls.notes?.position()).toBe(754);
  });

  it("passes on every state change and error the player reports", async () => {
    const { heard } = await mount();
    await act(async () => {
      players[0].events.onStateChange({ data: 1 });
      players[0].events.onStateChange({ data: 0 });
      players[0].events.onError({ data: 150 });
    });
    expect(heard).toEqual([
      { type: "state", state: 1 },
      { type: "state", state: 0 },
      { type: "error", code: 150 },
    ]);
  });

  it("stops passing them on once the reader is gone", async () => {
    const { heard } = await mount();
    await cleanup();
    players[0].events.onStateChange({ data: 0 });
    expect(heard).toEqual([]);
  });

  it("makes no player without a frame to read", async () => {
    const { controls } = await mount(null);
    expect(players).toHaveLength(0);
    expect(controls.page).toBeNull();
  });
});
