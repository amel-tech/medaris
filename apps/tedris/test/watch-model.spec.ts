import type { SessionResponse } from "@medaris/services/tedrisat";
import { describe, expect, it } from "vitest";
import {
  minutesSince,
  type StreamPhase,
  streamPhaseAfter,
  watchPath,
  watchTargetOf,
} from "~/features/courses/watch-model";
import type { PlayerEvent } from "~/features/courses/youtube-player";

/**
 * The watch page's rules (MDRS-285): what a celse offers to watch, and the
 * live/ended switch the stream's own player drives (owner's decision: a
 * lesson ends when its stream ends, learned from `onStateChange` alone).
 */

const STREAM = "https://www.youtube.com/live/ybHyHDBiRoE";

const recording = (status: string) => ({
  id: "r1",
  title: "Mehmûz fiiller",
  provider: "YOUTUBE",
  url: status === "PROCESSING" ? null : "https://youtu.be/abcdefgh",
  visibility: "ENROLLED",
  status,
});

const session = (over: Record<string, unknown> = {}) =>
  ({
    status: "LIVE",
    contentLocked: false,
    recording: null,
    liveStreamUrl: STREAM,
    ...over,
  }) as unknown as Pick<
    SessionResponse,
    "status" | "contentLocked" | "recording" | "liveStreamUrl"
  >;

const state = (value: number): PlayerEvent => ({ type: "state", state: value });

describe("watchPath", () => {
  it("is the celse's address with izle after it", () => {
    expect(watchPath("c1", "s1")).toBe("/courses/c1/lessons/s1/izle");
  });
});

describe("watchTargetOf", () => {
  it("plays the stream while the API sends its link, whatever the clock says", () => {
    for (const status of ["LIVE", "ENDED"]) {
      expect(watchTargetOf(session({ status }))).toEqual({
        kind: "stream",
        url: STREAM,
      });
    }
  });

  it("plays a READY recording, even beside a stream link", () => {
    const ready = recording("READY");
    expect(
      watchTargetOf(session({ status: "ENDED", recording: ready }))
    ).toEqual({ kind: "recording", recording: ready });
    expect(
      watchTargetOf(session({ liveStreamUrl: null, recording: ready }))
    ).toEqual({ kind: "recording", recording: ready });
  });

  it("does not play a recording that is not READY: the stream, or nothing", () => {
    for (const status of ["PROCESSING", "FAILED"]) {
      expect(watchTargetOf(session({ recording: recording(status) }))).toEqual({
        kind: "stream",
        url: STREAM,
      });
      expect(
        watchTargetOf(
          session({ liveStreamUrl: null, recording: recording(status) })
        )
      ).toBeNull();
    }
  });

  it("offers nothing without a link or a recording, so the page goes to the detail page", () => {
    expect(watchTargetOf(session({ liveStreamUrl: null }))).toBeNull();
    expect(watchTargetOf(session({ liveStreamUrl: undefined }))).toBeNull();
    expect(watchTargetOf(session({ liveStreamUrl: "" }))).toBeNull();
  });

  it("offers nothing to a caller who may not read the content", () => {
    expect(watchTargetOf(session({ contentLocked: true }))).toBeNull();
    expect(
      watchTargetOf(
        session({ contentLocked: true, recording: recording("READY") })
      )
    ).toBeNull();
  });

  it("plays the READY recording of a cancelled celse, which the recordings tab lists, but never its stream", () => {
    const ready = recording("READY");
    expect(
      watchTargetOf(session({ status: "CANCELLED", recording: ready }))
    ).toEqual({ kind: "recording", recording: ready });
    expect(watchTargetOf(session({ status: "CANCELLED" }))).toBeNull();
    expect(
      watchTargetOf(
        session({ status: "CANCELLED", recording: recording("PROCESSING") })
      )
    ).toBeNull();
  });
});

describe("streamPhaseAfter: the live/ended switch", () => {
  it("ends the stream when the player reports ended (0)", () => {
    expect(streamPhaseAfter("live", state(0))).toBe("ended");
    expect(streamPhaseAfter("ended", state(0))).toBe("ended");
  });

  it("brings it back when the player plays (1) or buffers (3) after the end", () => {
    expect(streamPhaseAfter("ended", state(1))).toBe("live");
    expect(streamPhaseAfter("ended", state(3))).toBe("live");
    expect(streamPhaseAfter("live", state(1))).toBe("live");
    expect(streamPhaseAfter("live", state(3))).toBe("live");
  });

  it("changes nothing on a pause (2), a player not started (-1) or cued (5)", () => {
    for (const phase of ["live", "ended"] as StreamPhase[]) {
      for (const value of [2, -1, 5]) {
        expect(streamPhaseAfter(phase, state(value))).toBe(phase);
      }
    }
  });

  it("changes nothing on a player error", () => {
    for (const phase of ["live", "ended"] as StreamPhase[]) {
      for (const code of [2, 5, 100, 101, 150]) {
        expect(streamPhaseAfter(phase, { type: "error", code })).toBe(phase);
      }
    }
  });

  it("follows a stream that stops and starts again", () => {
    const events = [1, 2, 1, 0, 1, 3, 0, 5, -1];
    const phases: StreamPhase[] = [];
    let phase: StreamPhase = "live";
    for (const value of events) {
      phase = streamPhaseAfter(phase, state(value));
      phases.push(phase);
    }
    expect(phases).toEqual([
      "live",
      "live",
      "live",
      "ended",
      "live",
      "live",
      "ended",
      "ended",
      "ended",
    ]);
  });
});

describe("minutesSince", () => {
  const start = new Date("2026-10-03T18:00:00Z");

  it("counts whole minutes since the start", () => {
    expect(minutesSince(start, new Date("2026-10-03T18:24:59Z"))).toBe(24);
    expect(minutesSince(start, new Date("2026-10-03T19:30:00Z"))).toBe(90);
  });

  it("is never below zero", () => {
    expect(minutesSince(start, new Date("2026-10-03T17:59:00Z"))).toBe(0);
  });
});
