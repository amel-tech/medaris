import {
  fromZonedDatetimeLocal,
  shiftDatetimeLocal,
  toZonedDatetimeLocal,
} from "../src/time-zone";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

describe("shiftDatetimeLocal — Haftayı kopyala (MDRS-109)", () => {
  it("moves a session exactly seven days on", () => {
    const original = "2026-10-06T21:00";
    const copy = shiftDatetimeLocal(original, 7);

    expect(copy).toBe("2026-10-13T21:00");
    const a = fromZonedDatetimeLocal(original, "Europe/Istanbul") as Date;
    const b = fromZonedDatetimeLocal(copy, "Europe/Istanbul") as Date;
    expect(b.getTime() - a.getTime()).toBe(WEEK_MS);
  });

  it("crosses month and year ends", () => {
    expect(shiftDatetimeLocal("2026-10-29T21:00", 7)).toBe("2026-11-05T21:00");
    expect(shiftDatetimeLocal("2026-12-29T09:30", 7)).toBe("2027-01-05T09:30");
    expect(shiftDatetimeLocal("2028-02-26T21:00", 7)).toBe("2028-03-04T21:00");
  });

  it("keeps the local time when daylight saving ends in between", () => {
    // Sunday 18 October 21:00 Berlin (CEST) → Sunday 25 October (CET).
    const copy = shiftDatetimeLocal("2026-10-18T21:00", 7);
    expect(copy).toBe("2026-10-25T21:00");
    const at = fromZonedDatetimeLocal(copy, "Europe/Berlin") as Date;
    expect(at.toISOString()).toBe("2026-10-25T20:00:00.000Z");
    expect(toZonedDatetimeLocal(at, "Europe/Berlin")).toBe(copy);
  });

  it("leaves an unscheduled or malformed value alone", () => {
    expect(shiftDatetimeLocal("", 7)).toBe("");
    expect(shiftDatetimeLocal("06.10.2026 21:00", 7)).toBe("06.10.2026 21:00");
  });
});
