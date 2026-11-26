// The dates of the walks of nazar.sessions.plan and nizam.courses.planSessions, written for the binding to read as a data source. The planner is typed dates, and a
// walk runs on whatever day it runs on, so they are worked out from today (on Istanbul's clock, the zone the form starts in):
//
//   node helpers/dates.mjs write <tag>     writes graphs/.local/made/<tag>.dates.json and prints `dates <tag> start=...`
//   node helpers/dates.mjs clear <tag>     removes that file (a second clear says `none`)
//
//   start    a Tuesday two to three weeks ahead: a weekly repeat on Tuesday and Thursday from it, ending on `end`, makes three celses
//            (Tue start, Thu start+2, Tue start+7) and four by count (Thu start+9 as well)
//   end      start + 8 days, a Wednesday
//   single   nine days ahead: one celse
//   exam     five days ahead, as exam#1 plans it (today + 5): one celse and its lesson_exams row
//   noStart  a Tuesday and noEnd the day after: a pattern on Monday and Saturday finds no day in it, so the preview is refused
//            (INVALID_SESSION_PATTERN, NO_SESSIONS) and the page says it could not make a preview
// Nothing is read from the stack and nothing is written to it. Run it from graphs/bindings/ as every helper is.
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const MADE = resolve(here, "../../.local/made");
const DAY = 86_400_000;

const usage = "usage: dates.mjs write <tag> | clear <tag>";
const [verb, tag, ...rest] = process.argv.slice(2);
if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,40}$/.test(tag ?? "") || rest.length) {
  console.error(`dates: ${usage}`);
  process.exit(2);
}
const file = resolve(MADE, `${tag}.dates.json`);

// today's calendar day in Istanbul, as a number of days since 1970-01-01
const today = (() => {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .split("-")
    .map(Number);
  return Date.UTC(y, m - 1, d) / DAY;
})();
const iso = (day) => new Date(day * DAY).toISOString().slice(0, 10);
// ISO weekday of a day number: 1 is Monday (1970-01-01 was a Thursday)
const weekday = (day) => ((((day + 3) % 7) + 7) % 7) + 1;
const tuesdayOnOrAfter = (day) => day + ((2 - weekday(day) + 7) % 7);

if (verb === "write") {
  const start = tuesdayOnOrAfter(today + 14);
  const dates = {
    start: iso(start),
    end: iso(start + 8),
    single: iso(today + 9),
    exam: iso(today + 5),
    noStart: iso(start),
    noEnd: iso(start + 1),
  };
  mkdirSync(MADE, { recursive: true, mode: 0o700 });
  writeFileSync(file, `${JSON.stringify(dates)}\n`, { mode: 0o600 });
  console.log(
    `dates ${tag} start=${dates.start} end=${dates.end} single=${dates.single} exam=${dates.exam}`
  );
} else if (verb === "clear") {
  if (existsSync(file)) {
    rmSync(file);
    console.log(`dates ${tag} cleared`);
  } else console.log(`dates ${tag} none`);
} else {
  console.error(`dates: ${usage}`);
  process.exit(2);
}
