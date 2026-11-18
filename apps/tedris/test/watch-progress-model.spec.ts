import { describe, expect, it } from "vitest";
import { bunnyEventOf } from "../features/courses/bunny-player";
import {
  reportOf,
  resumeFrom,
  viewsByLesson,
  watchMarkOf,
} from "../features/courses/watch-progress-model";

/** MDRS-248, the "sayaç": what the watch records say and what is reported. */

const view = (
  positionSeconds: number,
  durationSeconds: number | null,
  completedAt: Date | null = null
) => ({
  lessonId: "l1",
  positionSeconds,
  durationSeconds,
  completedAt,
  updatedAt: new Date(),
});

describe("watchMarkOf", () => {
  it("says watched once the API counted it, wherever the player is", () => {
    expect(watchMarkOf(view(5, 3480, new Date()))).toEqual({ kind: "watched" });
  });

  it("gives the share played while the length is known, 1 to 99", () => {
    expect(watchMarkOf(view(1740, 3480))).toEqual({
      kind: "percent",
      percent: 50,
    });
    expect(watchMarkOf(view(12, 100_000))).toEqual({
      kind: "percent",
      percent: 1,
    });
    expect(watchMarkOf(view(3479, 3480))).toEqual({
      kind: "percent",
      percent: 99,
    });
  });

  it("gives where the player was without a length, and nothing for a few seconds", () => {
    expect(watchMarkOf(view(754, null))).toEqual({
      kind: "started",
      positionSeconds: 754,
    });
    expect(watchMarkOf(view(9, 3480))).toBeNull();
    expect(watchMarkOf(undefined)).toBeNull();
  });
});

describe("resumeFrom", () => {
  it("goes back to where the player was, not to the start or the last seconds", () => {
    expect(resumeFrom(view(754, 3480))).toBe(754);
    expect(resumeFrom(view(754, null))).toBe(754);
    expect(resumeFrom(view(5, 3480))).toBeNull();
    expect(resumeFrom(view(3475, 3480))).toBeNull();
    expect(resumeFrom(null)).toBeNull();
  });
});

describe("reportOf", () => {
  it("sends whole seconds, and a length only when the player knows it", () => {
    expect(reportOf(754.8, 3480.2)).toEqual({
      positionSeconds: 754,
      durationSeconds: 3480,
    });
    expect(reportOf(10, 0)).toEqual({ positionSeconds: 10 });
    expect(reportOf(10, null, true)).toEqual({
      positionSeconds: 10,
      ended: true,
    });
  });

  it("sends nothing for a position that is not one", () => {
    expect(reportOf(null, 10)).toBeNull();
    expect(reportOf(Number.NaN, 10)).toBeNull();
    expect(reportOf(-1, 10)).toBeNull();
  });
});

describe("viewsByLesson", () => {
  it("keys the records by celse, and takes none", () => {
    expect(viewsByLesson([view(1, 2)]).get("l1")?.positionSeconds).toBe(1);
    expect(viewsByLesson(null).size).toBe(0);
  });
});

describe("bunnyEventOf (Player.js)", () => {
  const message = (event: string, value?: unknown) =>
    JSON.stringify({ context: "player.js", version: "0.0.11", event, value });

  it("reads the time, the pause, the end and the ready", () => {
    expect(
      bunnyEventOf(message("timeupdate", { seconds: 12.5, duration: 3480 }))
    ).toEqual({ type: "time", seconds: 12.5, duration: 3480 });
    expect(bunnyEventOf(message("timeupdate", { seconds: 3 }))).toEqual({
      type: "time",
      seconds: 3,
      duration: null,
    });
    expect(bunnyEventOf(message("pause"))).toEqual({ type: "pause" });
    expect(bunnyEventOf(message("ended"))).toEqual({ type: "ended" });
    expect(bunnyEventOf(message("ready", {}))).toBe("ready");
  });

  it("ignores another context, an unknown event and what is not JSON", () => {
    expect(bunnyEventOf(JSON.stringify({ event: "ended" }))).toBeNull();
    expect(bunnyEventOf(message("seeked"))).toBeNull();
    expect(bunnyEventOf(message("timeupdate", { seconds: "x" }))).toBeNull();
    expect(bunnyEventOf("{not json")).toBeNull();
    expect(bunnyEventOf(42)).toBeNull();
  });
});
