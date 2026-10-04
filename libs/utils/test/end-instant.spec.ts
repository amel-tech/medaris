import {
  endProblem,
  isoToZonedLocal,
  resolveEnd,
  zonedLocalToIso,
} from "../src/end-instant";

// The zones of the issue: UTC-8, UTC+1, UTC+2, UTC+3 and UTC+9 in December.
const ZONES = {
  "UTC-8": "America/Los_Angeles",
  "UTC+1": "Europe/Berlin",
  "UTC+2": "Europe/Athens",
  "UTC+3": "Europe/Istanbul",
  "UTC+9": "Asia/Tokyo",
} as const;

// An appointment that ends at the end of a Turkish day: the end MDRS-254 was
// found with, seconds included.
const APPOINTMENT_END = "2026-12-31T20:59:59.000Z";
const NOW = new Date("2026-10-04T09:00:00.000Z");

describe("zonedLocalToIso and isoToZonedLocal", () => {
  it.each([
    ["UTC-8", "2026-12-31T12:00", "2026-12-31T20:00:00.000Z"],
    ["UTC+1", "2026-12-31T21:00", "2026-12-31T20:00:00.000Z"],
    ["UTC+3", "2026-12-31T23:00", "2026-12-31T20:00:00.000Z"],
    ["UTC+9", "2027-01-01T05:00", "2026-12-31T20:00:00.000Z"],
  ] as const)("%s: %s is %s", (zone, local, iso) => {
    expect(zonedLocalToIso(local, ZONES[zone])).toBe(iso);
    expect(isoToZonedLocal(iso, ZONES[zone])).toBe(local);
  });

  it("cuts the seconds off the prefill", () => {
    expect(isoToZonedLocal(APPOINTMENT_END, "Europe/Istanbul")).toBe(
      "2026-12-31T23:59"
    );
  });

  it("reads seconds when the field has them", () => {
    expect(zonedLocalToIso("2026-12-31T23:59:59", "Europe/Istanbul")).toBe(
      APPOINTMENT_END
    );
  });

  it("answers null or empty for what is no moment", () => {
    expect(zonedLocalToIso("", "UTC")).toBeNull();
    expect(zonedLocalToIso("2026-12-31", "UTC")).toBeNull();
    expect(zonedLocalToIso("2026-02-31T10:00", "UTC")).toBeNull();
    expect(zonedLocalToIso("2026-12-31T25:00", "UTC")).toBeNull();
    expect(isoToZonedLocal(null, "UTC")).toBe("");
    expect(isoToZonedLocal("nope", "UTC")).toBe("");
  });

  describe("daylight saving (Europe/Berlin)", () => {
    const berlin = "Europe/Berlin";

    it("moves a wall time the spring change skips forward by the gap", () => {
      // 29 March 2026: 02:00 became 03:00, so 02:30 never happened.
      expect(zonedLocalToIso("2026-03-29T02:30", berlin)).toBe(
        "2026-03-29T01:30:00.000Z"
      );
      expect(isoToZonedLocal("2026-03-29T01:30:00.000Z", berlin)).toBe(
        "2026-03-29T03:30"
      );
    });

    it("takes the first occurrence of a wall time the autumn change repeats", () => {
      // 25 October 2026: 03:00 became 02:00, so 02:30 happened twice.
      expect(zonedLocalToIso("2026-10-25T02:30", berlin)).toBe(
        "2026-10-25T00:30:00.000Z"
      );
      // Both occurrences read back as the same wall time.
      expect(isoToZonedLocal("2026-10-25T01:30:00.000Z", berlin)).toBe(
        "2026-10-25T02:30"
      );
    });

    it("is exact either side of the changes", () => {
      expect(zonedLocalToIso("2026-03-29T01:59", berlin)).toBe(
        "2026-03-29T00:59:00.000Z"
      );
      expect(zonedLocalToIso("2026-03-29T03:00", berlin)).toBe(
        "2026-03-29T01:00:00.000Z"
      );
      expect(zonedLocalToIso("2026-10-25T03:00", berlin)).toBe(
        "2026-10-25T02:00:00.000Z"
      );
      expect(zonedLocalToIso("2026-10-25T01:59", berlin)).toBe(
        "2026-10-24T23:59:00.000Z"
      );
    });

    it("works in a zone west of UTC whose change falls on another day", () => {
      const la = "America/Los_Angeles";
      // 1 November 2026: 02:00 PDT became 01:00 PST; 01:30 happens twice.
      expect(zonedLocalToIso("2026-11-01T01:30", la)).toBe(
        "2026-11-01T08:30:00.000Z"
      );
      // 8 March 2026: 02:00 PST became 03:00 PDT; 02:30 never happened.
      expect(zonedLocalToIso("2026-03-08T02:30", la)).toBe(
        "2026-03-08T10:30:00.000Z"
      );
    });
  });
});

describe("endProblem", () => {
  const assignmentEnd = new Date(APPOINTMENT_END);

  it("is past when the instant is not after now, as the server says", () => {
    expect(
      endProblem({ instant: new Date(NOW), now: NOW, assignmentEnd: null })
    ).toBe("past");
    expect(
      endProblem({
        instant: new Date(NOW.getTime() - 1),
        now: NOW,
        assignmentEnd: null,
      })
    ).toBe("past");
    expect(
      endProblem({
        instant: new Date(NOW.getTime() + 1),
        now: NOW,
        assignmentEnd: null,
      })
    ).toBeNull();
  });

  it("is after the assignment only when it is later than its end", () => {
    const at = (ms: number) => new Date(assignmentEnd.getTime() + ms);
    expect(endProblem({ instant: at(0), now: NOW, assignmentEnd })).toBeNull();
    expect(
      endProblem({ instant: at(-1000), now: NOW, assignmentEnd })
    ).toBeNull();
    expect(endProblem({ instant: at(1), now: NOW, assignmentEnd })).toBe(
      "afterAssignment"
    );
  });

  it("takes the appointment's end as an ISO string too", () => {
    expect(
      endProblem({
        instant: new Date("2027-01-01T00:00:00Z"),
        now: NOW,
        assignmentEnd: APPOINTMENT_END,
      })
    ).toBe("afterAssignment");
  });

  it("calls past before after-assignment", () => {
    expect(
      endProblem({
        instant: new Date("2026-01-01T00:00:00Z"),
        now: NOW,
        assignmentEnd: new Date("2025-01-01T00:00:00Z"),
      })
    ).toBe("past");
  });
});

describe("resolveEnd, the failing case of MDRS-254", () => {
  const base = { now: NOW, assignmentEnd: APPOINTMENT_END };

  it.each(
    Object.entries(ZONES)
  )("%s: the untouched prefill saves and goes back as the stored instant", (_name, zone) => {
    const prefill = isoToZonedLocal(APPOINTMENT_END, zone);
    expect(
      resolveEnd({
        ...base,
        value: prefill,
        held: APPOINTMENT_END,
        timeZone: zone,
      })
    ).toEqual({ iso: APPOINTMENT_END, problem: null });
  });

  it.each(
    Object.entries(ZONES)
  )("%s: one minute after the end is refused before sending", (_name, zone) => {
    // 20:59:59Z ends in the minute 20:59Z; the next minute is 21:00Z.
    const value = isoToZonedLocal("2026-12-31T21:00:00.000Z", zone);
    expect(
      resolveEnd({ ...base, value, held: APPOINTMENT_END, timeZone: zone })
    ).toEqual({
      iso: "2026-12-31T21:00:00.000Z",
      problem: "afterAssignment",
    });
  });

  it.each(
    Object.entries(ZONES)
  )("%s: the last minute of the appointment is accepted", (_name, zone) => {
    const value = isoToZonedLocal("2026-12-31T20:58:00.000Z", zone);
    expect(resolveEnd({ ...base, value, held: null, timeZone: zone })).toEqual({
      iso: "2026-12-31T20:58:00.000Z",
      problem: null,
    });
  });

  it.each(
    Object.entries(ZONES)
  )("%s: a past moment is refused", (_name, zone) => {
    const value = isoToZonedLocal("2026-10-04T08:59:00.000Z", zone);
    expect(resolveEnd({ ...base, value, held: null, timeZone: zone })).toEqual({
      iso: "2026-10-04T08:59:00.000Z",
      problem: "past",
    });
  });

  it("refuses a moment of today that has gone, and accepts one that has not", () => {
    // The old screen compared days and called all of today "past".
    const zone = "Europe/Istanbul";
    expect(
      resolveEnd({
        value: "2026-10-04T13:00",
        held: null,
        timeZone: zone,
        now: NOW,
        assignmentEnd: null,
      })
    ).toEqual({ iso: "2026-10-04T10:00:00.000Z", problem: null });
    expect(
      resolveEnd({
        value: "2026-10-04T11:59",
        held: null,
        timeZone: zone,
        now: NOW,
        assignmentEnd: null,
      }).problem
    ).toBe("past");
  });

  it("leaves an empty field as no end", () => {
    expect(
      resolveEnd({ ...base, value: "", held: APPOINTMENT_END, timeZone: "UTC" })
    ).toEqual({ iso: null, problem: null });
  });

  it("does not let a value that is no moment through as 'no end'", () => {
    expect(
      resolveEnd({ ...base, value: "garbage", held: null, timeZone: "UTC" })
    ).toEqual({ iso: null, problem: "past" });
  });

  it("sends a typed moment, not the stored one, once the person changed it", () => {
    const zone = "Europe/Istanbul";
    expect(
      resolveEnd({
        value: "2026-12-30T10:00",
        held: APPOINTMENT_END,
        timeZone: zone,
        now: NOW,
        assignmentEnd: APPOINTMENT_END,
      })
    ).toEqual({ iso: "2026-12-30T07:00:00.000Z", problem: null });
  });
});
