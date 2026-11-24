"use client";

import { useEffect, useRef, useState } from "react";
import { BUNNY_PLAYER_ORIGIN } from "./recordings-model";

/**
 * Hearing where a Bunny recording's player is (MDRS-248, the "sayaç"), and
 * moving it. Bunny's player speaks the Player.js protocol over `postMessage`
 * (https://docs.bunny.net/docs/playerjs): the page asks it for `timeupdate`,
 * `pause` and `ended`, and it answers with JSON strings. Nothing is loaded
 * from Bunny for this: the protocol is three message shapes, written here.
 *
 * A message counts only when it comes from the frame's own window and from
 * Bunny's player origin. The subscription is sent when the player says it is
 * ready, and also on mount and on the frame's `load`, because a player that
 * announced itself before this ran is not asked again; a second subscription
 * only means a second copy of each event, which the caller's throttle takes.
 */

const CONTEXT = "player.js";
const VERSION = "0.0.11";
const EVENTS = ["timeupdate", "pause", "ended"] as const;

/** What the player reported. */
export type BunnyEvent =
  | { type: "time"; seconds: number; duration: number | null }
  | { type: "pause" }
  | { type: "ended" };

/** What the page asks of the player. */
export interface BunnyControl {
  seekTo(seconds: number): void;
  play(): void;
}

const parsed = (data: unknown): Record<string, unknown> | null => {
  if (typeof data === "string") {
    try {
      const value: unknown = JSON.parse(data);
      return value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : null;
};

/**
 * The event a Player.js message carries, or null for anything else: another
 * context, an event not listened to, a time that is not a number.
 */
export const bunnyEventOf = (data: unknown): BunnyEvent | "ready" | null => {
  const message = parsed(data);
  if (!message || message.context !== CONTEXT) return null;
  switch (message.event) {
    case "ready":
      return "ready";
    case "pause":
      return { type: "pause" };
    case "ended":
      return { type: "ended" };
    case "timeupdate": {
      const value = parsed(message.value);
      const seconds = Number(value?.seconds);
      const duration = Number(value?.duration);
      if (!Number.isFinite(seconds)) return null;
      return {
        type: "time",
        seconds,
        duration: Number.isFinite(duration) && duration > 0 ? duration : null,
      };
    }
    default:
      return null;
  }
};

const post = (frame: HTMLIFrameElement, message: object) =>
  frame.contentWindow?.postMessage(
    JSON.stringify({ context: CONTEXT, version: VERSION, ...message }),
    BUNNY_PLAYER_ORIGIN
  );

/**
 * The control of the Bunny player in the frame with id `frameId`, or null
 * until it said it is ready, and when there is no frame. `onEvent` hears
 * every time, pause and end it reports; the latest function given is called.
 */
export function useBunnyPlayer(
  frameId: string | null,
  onEvent: (event: BunnyEvent) => void
): BunnyControl | null {
  const [control, setControl] = useState<BunnyControl | null>(null);
  const listener = useRef(onEvent);
  useEffect(() => {
    listener.current = onEvent;
  });

  useEffect(() => {
    setControl(null);
    if (!frameId) return;
    const frame = document.getElementById(frameId);
    if (!(frame instanceof HTMLIFrameElement)) return;

    const subscribe = () => {
      for (const event of EVENTS) {
        post(frame, {
          method: "addEventListener",
          value: event,
          listener: event,
        });
      }
    };
    const heard = (message: MessageEvent) => {
      if (
        message.source !== frame.contentWindow ||
        message.origin !== BUNNY_PLAYER_ORIGIN
      ) {
        return;
      }
      const event = bunnyEventOf(message.data);
      if (event === "ready") {
        subscribe();
        setControl({
          seekTo: (seconds) =>
            post(frame, { method: "setCurrentTime", value: seconds }),
          play: () => post(frame, { method: "play" }),
        });
      } else if (event) {
        listener.current(event);
      }
    };
    window.addEventListener("message", heard);
    frame.addEventListener("load", subscribe);
    subscribe();
    return () => {
      window.removeEventListener("message", heard);
      frame.removeEventListener("load", subscribe);
    };
  }, [frameId]);

  return control;
}
