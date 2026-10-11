import type {
  SessionRecordingResponse,
  SessionResponse,
} from "@medaris/services/tedrisat";
import type { PlayerEvent } from "./youtube-player";

/**
 * What the watch page (MDRS-285) derives from a session and from what its
 * player reports. Pure and clock-free: a spec pins every rule.
 */

/** The watch page of a celse, entered from its detail page. */
export const watchPath = (courseId: string, lessonId: string): string =>
  `/courses/${courseId}/lessons/${lessonId}/izle`;

/** What the watch page plays: the celse's recording, or its stream. */
export type WatchTarget =
  | { kind: "recording"; recording: SessionRecordingResponse }
  | { kind: "stream"; url: string };

/**
 * What a celse offers to watch now, or null when it offers nothing and the
 * page sends the viewer to the detail page. A READY recording wins: tedrisat
 * stops sending the stream once one exists. Otherwise the stream, while the
 * API sends its link: from the scheduled start until the celse has a READY
 * recording, the clock's end notwithstanding. Both are content, so a caller
 * who may not read it gets neither. A cancelled celse has no stream, but a
 * recording it holds still plays: a cancellation does not remove one, and
 * "Ders kayıtları" lists it and leads here.
 *
 * MDRS-288: a READY recording plays only with its link. Before the release
 * time the course team set, tedrisat sends a talebe the recording without
 * one and keeps sending the stream, so the stream plays, or nothing; the
 * course team gets the link and plays the recording.
 */
export const watchTargetOf = (
  session: Pick<
    SessionResponse,
    "status" | "contentLocked" | "recording" | "liveStreamUrl"
  >
): WatchTarget | null => {
  if (session.contentLocked) return null;
  if (session.recording?.status === "READY" && session.recording.url) {
    return { kind: "recording", recording: session.recording };
  }
  if (session.status === "CANCELLED") return null;
  return session.liveStreamUrl
    ? { kind: "stream", url: session.liveStreamUrl }
    : null;
};

/**
 * Whether the stream on the page is live or has ended, as its own player
 * last said. Owner's decision (MDRS-285): a lesson ends when its stream ends,
 * not when its scheduled time is over, and nothing but the player's
 * `onStateChange` on this page tells: nothing is asked of YouTube's Data API
 * and nothing is kept on the server.
 */
export type StreamPhase = "live" | "ended";

/** YouTube's `onStateChange` values the switch reads. */
const ENDED = 0;
const PLAYING = 1;
const BUFFERING = 3;

/**
 * The next phase after a player event. Ended (0) ends it; playing (1) or
 * buffering (3) brings it back, as a stream may stop and start again. A
 * pause (2), a player not started (-1) or cued (5), and an error change
 * nothing: a player that failed has said nothing about the broadcast.
 */
export const streamPhaseAfter = (
  phase: StreamPhase,
  event: PlayerEvent
): StreamPhase => {
  if (event.type !== "state") return phase;
  if (event.state === ENDED) return "ended";
  if (event.state === PLAYING || event.state === BUFFERING) return "live";
  return phase;
};

/** Whole minutes since `startsAt`, never below zero: "Canlı · 24 dk". */
export const minutesSince = (startsAt: Date, now: Date): number =>
  Math.max(0, Math.floor((now.getTime() - startsAt.getTime()) / 60_000));
