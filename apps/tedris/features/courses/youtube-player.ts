"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reading and moving the position of a YouTube player the page already frames
 * (MDRS-150), through YouTube's IFrame Player API, and hearing what it reports
 * (MDRS-285). The frame must have been rendered with `enablejsapi=1`
 * (`playerApiUrlOf`); the script is loaded once per page, on first use, from
 * YouTube itself.
 */

interface YouTubePlayer {
  getCurrentTime(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
}

interface YouTubeApi {
  Player: new (
    frame: HTMLIFrameElement,
    options: {
      events: {
        onReady: () => void;
        onStateChange: (event: { data: number }) => void;
        onError: (event: { data: number }) => void;
      };
    }
  ) => YouTubePlayer;
}

type YouTubeWindow = Window & {
  YT?: Partial<YouTubeApi>;
  onYouTubeIframeAPIReady?: () => void;
};

const API_SRC = "https://www.youtube.com/iframe_api";

let loading: Promise<YouTubeApi> | null = null;

const loadYouTubeApi = (): Promise<YouTubeApi> => {
  const w = window as YouTubeWindow;
  if (w.YT?.Player) return Promise.resolve(w.YT as YouTubeApi);
  loading ??= new Promise<YouTubeApi>((resolve, reject) => {
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(w.YT as YouTubeApi);
    };
    const script = document.createElement("script");
    script.src = API_SRC;
    script.async = true;
    script.onerror = () => {
      // A blocked script may be tried again on the next mount.
      loading = null;
      reject(new Error("The YouTube player API did not load"));
    };
    document.head.appendChild(script);
  });
  return loading;
};

/**
 * What the player reported: a new state (`onStateChange`: -1 not started,
 * 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued) or an error (`onError`).
 */
export type PlayerEvent =
  | { type: "state"; state: number }
  | { type: "error"; code: number };

/**
 * One player per frame, however many pieces of the page ask for it: on the
 * watch page the notes panel reads the position and the page hears the state
 * of the same frame (MDRS-285). The API is written for one `YT.Player` per
 * frame, so the second caller joins the first one's instead of making its own.
 */
interface Attached {
  player: YouTubePlayer | null;
  ready: boolean;
  onReady: Set<() => void>;
  onEvent: Set<(event: PlayerEvent) => void>;
}

const attached = new WeakMap<HTMLIFrameElement, Attached>();

const attach = (api: YouTubeApi, frame: HTMLIFrameElement): Attached => {
  const known = attached.get(frame);
  if (known) return known;
  const entry: Attached = {
    player: null,
    ready: false,
    onReady: new Set(),
    onEvent: new Set(),
  };
  attached.set(frame, entry);
  const report = (event: PlayerEvent) => {
    for (const listener of [...entry.onEvent]) listener(event);
  };
  entry.player = new api.Player(frame, {
    events: {
      onReady: () => {
        entry.ready = true;
        for (const listener of [...entry.onReady]) listener();
      },
      onStateChange: ({ data }) => report({ type: "state", state: data }),
      onError: ({ data }) => report({ type: "error", code: data }),
    },
  });
  return entry;
};

/** What the notes panel asks of the player. */
export interface PlayerControl {
  /** Whole seconds from the start of the video. */
  position(): number | null;
  seekTo(seconds: number): void;
}

const controlOf = (player: YouTubePlayer): PlayerControl => ({
  position: () => {
    const seconds = player.getCurrentTime();
    return Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : null;
  },
  seekTo: (seconds) => player.seekTo(seconds, true),
});

/**
 * The control of the YouTube player in the frame with id `frameId`, or null
 * until the player reports ready, when there is no frame to read, or when the
 * API could not be loaded. The panel then shows its manual time field.
 * `onEvent` hears every state change and error the player reports from then
 * on; the latest function given is the one called.
 */
export function useYouTubePlayer(
  frameId: string | null,
  onEvent?: (event: PlayerEvent) => void
): PlayerControl | null {
  const [control, setControl] = useState<PlayerControl | null>(null);
  const listener = useRef(onEvent);
  useEffect(() => {
    listener.current = onEvent;
  });

  useEffect(() => {
    setControl(null);
    if (!frameId) return;
    let live = true;
    let entry: Attached | null = null;
    const ready = () => {
      if (live && entry?.player) setControl(controlOf(entry.player));
    };
    const heard = (event: PlayerEvent) => {
      if (live) listener.current?.(event);
    };
    loadYouTubeApi()
      .then((api) => {
        const frame = document.getElementById(frameId);
        if (!live || !(frame instanceof HTMLIFrameElement)) return;
        entry = attach(api, frame);
        entry.onReady.add(ready);
        entry.onEvent.add(heard);
        if (entry.ready) ready();
      })
      .catch(() => {});
    // The player is not destroyed on the way out: `destroy()` removes the
    // frame, which React owns.
    return () => {
      live = false;
      entry?.onReady.delete(ready);
      entry?.onEvent.delete(heard);
    };
  }, [frameId]);

  return control;
}
