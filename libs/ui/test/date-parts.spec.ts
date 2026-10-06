import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  addYears,
  clampIsoDate,
  dateInputPattern,
  daysInMonth,
  endOfWeek,
  firstDayOfWeek,
  formatDateInput,
  isIsoDate,
  isLeapYear,
  isTimeWithin,
  isWithin,
  joinDateTime,
  MAX_ISO_DATE,
  MIN_ISO_DATE,
  maskTimeInput,
  monthGrid,
  monthHasDayWithin,
  normalizeIsoTime,
  parseDateInput,
  parseIsoDate,
  parseIsoTime,
  parseTimeInput,
  splitDateTime,
  startOfWeek,
  stepTime,
  timeOptions,
  toAsciiDigits,
  todayIso,
  toLocaleDigits,
  weekdayOf,
} from "../src/lib/date-parts";

describe("calendar arithmetic", () => {
  it("knows the leap years", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it("accepts only real YYYY-MM-DD dates", () => {
    expect(parseIsoDate("2026-10-05")).toEqual({
      year: 2026,
      month: 10,
      day: 5,
    });
    expect(isIsoDate("2024-02-29")).toBe(true);
    for (const bad of [
      "2026-02-29",
      "2026-13-01",
      "2026-00-10",
      "2026-04-31",
      "2026-1-5",
      "05.10.2026",
      "2026-10-05T10:00",
      "",
      "0000-01-01",
    ]) {
      expect(isIsoDate(bad)).toBe(false);
    }
    expect(parseIsoDate(undefined)).toBeNull();
  });

  it("adds days across months, years and leap days without the viewer's zone", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    // across the end of daylight saving in Europe (25 October 2026)
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(addDays("2026-10-05", -7)).toBe("2026-09-28");
    expect(addDays("0050-06-01", 1)).toBe("0050-06-02");
    expect(addDays(MAX_ISO_DATE, 1)).toBe(MAX_ISO_DATE);
    expect(addDays(MIN_ISO_DATE, -1)).toBe(MIN_ISO_DATE);
  });

  it("adds months and years, clamping the day to the month's last", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
    expect(addMonths("2026-05-15", -17)).toBe("2024-12-15");
    expect(addYears("2024-02-29", 1)).toBe("2025-02-28");
    expect(addYears("2024-02-29", 4)).toBe("2028-02-29");
    expect(addMonths("9999-12-01", 1)).toBe(MAX_ISO_DATE);
  });

  it("finds weekdays and the week around a date", () => {
    expect(weekdayOf("2026-10-05")).toBe(1); // Monday
    expect(weekdayOf("2026-10-11")).toBe(7); // Sunday
    expect(startOfWeek("2026-10-08", 1)).toBe("2026-10-05");
    expect(endOfWeek("2026-10-08", 1)).toBe("2026-10-11");
    expect(startOfWeek("2026-10-05", 1)).toBe("2026-10-05");
    expect(startOfWeek("2026-10-08", 7)).toBe("2026-10-04"); // Sunday start
    expect(startOfWeek("2026-10-08", 6)).toBe("2026-10-03"); // Saturday start
    expect(endOfWeek("2026-10-08", 6)).toBe("2026-10-09");
    expect(startOfWeek("2026-10-01", 1)).toBe("2026-09-28");
  });

  it("checks and clamps against min and max, ignoring bounds that are not dates", () => {
    expect(isWithin("2026-10-05", "2026-10-01", "2026-10-31")).toBe(true);
    expect(isWithin("2026-09-30", "2026-10-01")).toBe(false);
    expect(isWithin("2026-11-01", undefined, "2026-10-31")).toBe(false);
    expect(isWithin("2026-10-01", "2026-10-01", "2026-10-01")).toBe(true);
    expect(isWithin("2026-10-05", "garbage", "")).toBe(true);
    expect(clampIsoDate("2026-09-01", "2026-10-01")).toBe("2026-10-01");
    expect(clampIsoDate("2026-12-01", null, "2026-10-31")).toBe("2026-10-31");
    expect(clampIsoDate("2026-10-05", "2026-10-01", "2026-10-31")).toBe(
      "2026-10-05"
    );
  });
});

describe("monthGrid", () => {
  it("lays October 2026 out from Monday, with empty cells around the month", () => {
    const weeks = monthGrid(2026, 10, 1);
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toEqual([
      null,
      null,
      null,
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
    expect(weeks[1]?.[0]).toBe("2026-10-05");
    expect(weeks[4]).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      null,
    ]);
    for (const week of weeks) expect(week).toHaveLength(7);
  });

  it("starts on Sunday or Saturday when asked", () => {
    expect(monthGrid(2026, 10, 7)[0]).toEqual([
      null,
      null,
      null,
      null,
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
    expect(monthGrid(2026, 10, 6)[0]?.slice(5)).toEqual([
      "2026-10-01",
      "2026-10-02",
    ]);
  });

  it("holds every day of a leap February once, and needs six rows when a month spills", () => {
    const feb = monthGrid(2024, 2, 1).flat().filter(Boolean);
    expect(feb).toHaveLength(29);
    expect(feb.at(-1)).toBe("2024-02-29");
    // February 2021 starts on a Monday and has 28 days: exactly four rows
    expect(monthGrid(2021, 2, 1)).toHaveLength(4);
    // August 2026 starts on a Saturday and has 31 days: six rows from Monday
    expect(monthGrid(2026, 8, 1)).toHaveLength(6);
  });

  it("tells whether a month has any day within the bounds", () => {
    expect(monthHasDayWithin(2026, 9, "2026-10-01")).toBe(false);
    expect(monthHasDayWithin(2026, 10, "2026-10-31")).toBe(true);
    expect(monthHasDayWithin(2026, 11, undefined, "2026-10-31")).toBe(false);
    expect(monthHasDayWithin(2026, 11)).toBe(true);
  });

  it("reads the week's first day from the locale, Monday when it cannot", () => {
    expect(firstDayOfWeek("tr-TR")).toBe(1);
    expect(firstDayOfWeek("tr")).toBe(1);
    expect(firstDayOfWeek("en-US")).toBe(7);
    expect(firstDayOfWeek("en-GB")).toBe(1);
    expect(firstDayOfWeek("not a tag")).toBe(1);
  });

  it("today is the viewer's calendar day", () => {
    expect(todayIso(new Date(2026, 9, 5, 23, 59))).toBe("2026-10-05");
    expect(todayIso(new Date(2026, 0, 1, 0, 0))).toBe("2026-01-01");
  });
});

describe("digits", () => {
  it("reads Arabic-Indic and Extended Arabic-Indic digits as ASCII", () => {
    expect(toAsciiDigits("٠٥/١٠/٢٠٢٦")).toBe("05/10/2026");
    expect(toAsciiDigits("۲۱:۳۰")).toBe("21:30");
    expect(toAsciiDigits("abc 12")).toBe("abc 12");
  });

  it("writes ASCII digits in the locale's digits, as Intl.NumberFormat does", () => {
    expect(toLocaleDigits("21:30", "tr-TR")).toBe("21:30");
    const egyptian = new Intl.NumberFormat("ar-EG").format(2);
    expect(toLocaleDigits("21:30", "ar-EG")).toBe(
      `${egyptian}${new Intl.NumberFormat("ar-EG").format(1)}:${new Intl.NumberFormat("ar-EG").format(3)}${new Intl.NumberFormat("ar-EG").format(0)}`
    );
  });
});

describe("typed dates", () => {
  it("derives the numeric order and the placeholder per locale", () => {
    expect(dateInputPattern("tr-TR")).toEqual({
      order: ["day", "month", "year"],
      placeholder: "GG.AA.YYYY",
    });
    expect(dateInputPattern("en-US")).toEqual({
      order: ["month", "day", "year"],
      placeholder: "MM/DD/YYYY",
    });
    expect(dateInputPattern("en-GB").order).toEqual(["day", "month", "year"]);
    expect(dateInputPattern("ar").order).toEqual(["day", "month", "year"]);
  });

  it("formats a value the way it is typed", () => {
    expect(formatDateInput("2026-10-05", "tr-TR")).toBe("05.10.2026");
    expect(formatDateInput("2026-10-05", "en-US")).toBe("10/05/2026");
    expect(formatDateInput("2026-10-05", "en-GB")).toBe("05/10/2026");
    expect(toAsciiDigits(formatDateInput("2026-10-05", "ar-EG"))).toContain(
      "2026"
    );
    expect(formatDateInput("", "tr-TR")).toBe("");
    expect(formatDateInput("2026-02-30", "tr-TR")).toBe("");
  });

  it("reads tr input in day.month.year with any separator", () => {
    for (const typed of [
      "05.10.2026",
      "5.10.2026",
      "5/10/2026",
      "5-10-2026",
      "05 10 2026",
      " 5.10.2026 ",
      "05102026",
      "2026-10-05",
    ]) {
      expect(parseDateInput(typed, "tr-TR")).toBe("2026-10-05");
    }
  });

  it("reads en-US input in month/day/year", () => {
    expect(parseDateInput("10/05/2026", "en-US")).toBe("2026-10-05");
    expect(parseDateInput("10052026", "en-US")).toBe("2026-10-05");
    expect(parseDateInput("05/10/2026", "en-GB")).toBe("2026-10-05");
  });

  it("reads Arabic input in Arabic-Indic digits, bidi marks and all", () => {
    const shown = formatDateInput("2026-10-05", "ar-EG");
    expect(parseDateInput(shown, "ar-EG")).toBe("2026-10-05");
    expect(parseDateInput("٠٥/١٠/٢٠٢٦", "ar")).toBe("2026-10-05");
    expect(parseDateInput(formatDateInput("2026-10-05", "ar"), "ar")).toBe(
      "2026-10-05"
    );
  });

  it("round-trips every day of a leap year through the field's own format", () => {
    for (const locale of ["tr-TR", "en-US", "ar-EG"]) {
      let d = "2024-01-01";
      while (d < "2025-01-01") {
        expect(parseDateInput(formatDateInput(d, locale), locale)).toBe(d);
        d = addDays(d, 1);
      }
    }
  });

  it("returns empty for empty text and null for what is not a date", () => {
    expect(parseDateInput("", "tr-TR")).toBe("");
    expect(parseDateInput("   ", "tr-TR")).toBe("");
    for (const bad of [
      "31.02.2026",
      "29.02.2026",
      "5.10.26",
      "5.10",
      "5 Ekim 2026",
      "32.01.2026",
      "05.13.2026",
      "123.10.2026",
      "0510202",
      "abc",
    ]) {
      expect(parseDateInput(bad, "tr-TR")).toBeNull();
    }
    expect(parseDateInput("29.02.2024", "tr-TR")).toBe("2024-02-29");
  });
});

describe("times", () => {
  it("parses and normalises HH:mm, dropping seconds", () => {
    expect(parseIsoTime("21:00")).toEqual({ hour: 21, minute: 0 });
    expect(parseIsoTime("00:00")).toEqual({ hour: 0, minute: 0 });
    expect(normalizeIsoTime("09:30:15")).toBe("09:30");
    expect(normalizeIsoTime("09:30:15.250")).toBe("09:30");
    for (const bad of ["24:00", "12:60", "9:30", "21", "", "9:00 PM"]) {
      expect(parseIsoTime(bad)).toBeNull();
    }
  });

  it("reads typed times on a 24-hour clock only", () => {
    expect(parseTimeInput("21:00")).toBe("21:00");
    expect(parseTimeInput("21.00")).toBe("21:00");
    expect(parseTimeInput("2100")).toBe("21:00");
    expect(parseTimeInput("930")).toBe("09:30");
    expect(parseTimeInput("9")).toBe("09:00");
    expect(parseTimeInput("21")).toBe("21:00");
    expect(parseTimeInput("09:")).toBe("09:00");
    expect(parseTimeInput("٢١:٣٠")).toBe("21:30");
    expect(parseTimeInput("")).toBe("");
    for (const bad of ["24:00", "9:3", "21:60", "9 PM", "9:00 PM", "12345"]) {
      expect(parseTimeInput(bad)).toBeNull();
    }
  });

  it("masks typing: the colon writes itself and deleting does not bring it back", () => {
    expect(maskTimeInput("2")).toBe("2");
    expect(maskTimeInput("21")).toBe("21:");
    expect(maskTimeInput("21:3")).toBe("21:3");
    expect(maskTimeInput("21:30")).toBe("21:30");
    expect(maskTimeInput("21:300")).toBe("21:30");
    expect(maskTimeInput("9")).toBe("09:");
    expect(maskTimeInput("9:")).toBe("09:");
    expect(maskTimeInput("2130")).toBe("21:30");
    expect(maskTimeInput("٢١")).toBe("21:");
    // Backspace over the colon, and over a padded hour
    expect(maskTimeInput("21", true)).toBe("21");
    expect(maskTimeInput("9", true)).toBe("9");
    expect(maskTimeInput("21:", true)).toBe("21");
  });

  it("steps the hour or the minute, wrapping within its own range", () => {
    expect(stepTime("21:00", "hour", 1)).toBe("22:00");
    expect(stepTime("23:15", "hour", 1)).toBe("00:15");
    expect(stepTime("00:15", "hour", -1)).toBe("23:15");
    expect(stepTime("21:59", "minute", 1)).toBe("21:00");
    expect(stepTime("21:00", "minute", -1)).toBe("21:59");
    expect(stepTime("", "hour", 1)).toBe("01:00");
  });

  it("lists the times of the day at a step", () => {
    const quarter = timeOptions(15);
    expect(quarter).toHaveLength(96);
    expect(quarter[0]).toBe("00:00");
    expect(quarter[1]).toBe("00:15");
    expect(quarter.at(-1)).toBe("23:45");
    expect(timeOptions(30)).toHaveLength(48);
    expect(timeOptions(60).at(-1)).toBe("23:00");
    expect(timeOptions(0)).toHaveLength(96);
  });

  it("checks a time against HH:mm bounds", () => {
    expect(isTimeWithin("09:00", "08:00", "17:00")).toBe(true);
    expect(isTimeWithin("07:59", "08:00")).toBe(false);
    expect(isTimeWithin("17:01", undefined, "17:00")).toBe(false);
    expect(isTimeWithin("17:00", "nope", "17:00")).toBe(true);
  });
});

describe("date-time", () => {
  it("splits and joins the datetime-local value", () => {
    expect(splitDateTime("2026-10-05T21:00")).toEqual({
      date: "2026-10-05",
      time: "21:00",
    });
    expect(splitDateTime("2026-10-05T21:00:30")).toEqual({
      date: "2026-10-05",
      time: "21:00",
    });
    expect(splitDateTime("")).toEqual({ date: "", time: "" });
    expect(splitDateTime("2026-02-30T21:00")).toEqual({
      date: "",
      time: "21:00",
    });
    expect(joinDateTime("2026-10-05", "21:00")).toBe("2026-10-05T21:00");
    expect(joinDateTime("2026-10-05", "")).toBe("");
    expect(joinDateTime("", "21:00")).toBe("");
  });
});
