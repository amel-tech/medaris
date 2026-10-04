"use client";

import { useEffect, useState } from "react";

/**
 * Reading and moving the position of a YouTube player the page already frames
 * (MDRS-150), through YouTube's IFrame Player API. The frame must have been
 * rendered with `enablejsapi=1` (`playerApiUrlOf`); the script is loaded once
 * per page, on first use, from YouTube itself.
 */

interface YouTubePlayer {
  getCurrentTime(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
}

interface YouTubeApi {
  Player: new (
    frame: HTMLIFrameElement,
    options: { events: { onReady: () => void } }
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

/** What the notes panel asks of the player. */
export interface PlayerControl {
  /** Whole seconds from the start of the video. */
  position(): number | null;
  seekTo(seconds: number): void;
}

/**
 * The control of the YouTube player in the frame with id `frameId`, or null
 * until the player reports ready, when there is no frame to read, or when the
 * API could not be loaded. The panel then shows its manual time field.
 */
export function useYouTubePlayer(frameId: string | null): PlayerControl | null {
  const [control, setControl] = useState<PlayerControl | null>(null);

  useEffect(() => {
    setControl(null);
    if (!frameId) return;
    let live = true;
    loadYouTubeApi()
      .then((api) => {
        const frame = document.getElementById(frameId);
        if (!live || !(frame instanceof HTMLIFrameElement)) return;
        const player: YouTubePlayer = new api.Player(frame, {
          events: {
            onReady: () => {
              if (!live) return;
              setControl({
                position: () => {
                  const seconds = player.getCurrentTime();
                  return Number.isFinite(seconds)
                    ? Math.max(0, Math.floor(seconds))
                    : null;
                },
                seekTo: (seconds) => player.seekTo(seconds, true),
              });
            },
          },
        });
      })
      .catch(() => {});
    // The player is not destroyed on the way out: `destroy()` removes the
    // frame, which React owns.
    return () => {
      live = false;
    };
  }, [frameId]);

  return control;
}
