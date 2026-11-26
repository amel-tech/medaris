// Reads what a köşk's home is about to show the köşk nazımı, and writes it where the binding reads it. It changes no row of the
// stack's own data: it makes the same GET /kosks/:id/dashboard calls the page's server side and its tab buttons make, as the
// seeded köşk nazımı. (A read of that route is written to the audit log by tedrisat, as every load of the page is: course.roster_read
// and course.content_read, before the answer. Nothing else is written, nothing is created or removed.)
//
//   node ../nizam/home/koskNazimLanding/home-numbers.mjs read <köşk id>             the numbers, written to graphs/.local/koskhome.json
//   node ../nizam/home/koskNazimLanding/home-numbers.mjs read <köşk id> seeded      the same, and fails unless the köşk is the one the seed
//                                                                                   makes: a celse ahead with no way in, one with a link,
//                                                                                   celse behind it and none cancelled (scenarios seeded, phone)
//   node ../nizam/home/koskNazimLanding/home-numbers.mjs read <köşk id> empty       the same, and fails unless nothing is in the köşk: no
//                                                                                   course, no celse, no application, no hoca (scenario empty)
//
// Why a file. The four numbers, the sentence "Önümüzdeki yedi günde N celse var" and the rows of the three tabs depend on today's
// date (the page looks seven days ahead, and the seed's celse are weekly) and on what other walks leave behind, so a walk reads the
// expected value from the API's own answer, taken just before it opens the page, and compares the page with it. The walks run one
// at a time under the replay lock, so nothing changes in between. The API's answer is what the page is made from; it is not the
// database (e2e dashboard#4 compares with SQL counts, which this does not).
//
// What it counts, with the page's own rules (features/courses/attendance.ts, features/dashboard/present.ts):
//   - upcoming ways    a celse of the Yaklaşan tab with a meeting link, a live stream or the in-person mark: its Katılım cell names them
//   - upcoming missing the celse the alert counts (`withoutAccessCount`): its Katılım cell is the warning badge "Eksik"
//   - past ways, none  the same two for the Geçmiş tab; a celse behind us with no way in says "Eklenmedi", never "Eksik"
//   - cancelled        every row says "—" in Katılım (F-W1-11)
// The Geçmiş and İptal edilen tabs list at most 20 rows (TAB_ROWS), the Yaklaşan tab at most 50, whatever their badges count (KOSKHOME-2).
//
// The data this flow cannot make: a celse that is cancelled, and a week whose every celse has a way in. The owner's word for this
// phase is not to create data to make a count, so the seeded köşk has no İptal edilen row and no scenario draws one. Prints
// `kosk-home <mode> <what was read>`; nothing secret is printed.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  call,
  Fail,
  LOCAL,
  refusal,
  run,
} from "../../../bindings/helpers/lib.mjs";

const FILE = resolve(LOCAL, "koskhome.json");
const UPCOMING_ROWS = 50; // kosk-dashboard.repository.ts: the Yaklaşan tab's limit
const TAB_ROWS = 20; // and the other two tabs'

// features/courses/attendance.ts:41 hasAccess: a link, a live stream or the in-person mark
const hasWay = (s) =>
  Boolean(s.meetingUrl?.trim()) ||
  s.hasLiveStream === true ||
  s.inPerson === true;

async function read(koskId, tab) {
  const r = await call(
    "koskNazim",
    "GET",
    `/kosks/${koskId}/dashboard?sessions=${tab}`
  );
  if (r.status !== 200)
    throw new Fail(
      `GET /kosks/${koskId}/dashboard?sessions=${tab} as the köşk nazımı: ${refusal(r)}`
    );
  return r.body;
}

run("home-numbers", async () => {
  const [verb, koskId, mode] = process.argv.slice(2);
  if (
    verb !== "read" ||
    !koskId ||
    (mode !== undefined && !["seeded", "empty"].includes(mode))
  )
    throw new Fail("usage: home-numbers.mjs read <köşk id> [seeded|empty]", 2);

  const d = await read(koskId, "UPCOMING"); // what the page's server side reads
  if (d.contentLocked)
    throw new Fail(
      "the köşk nazımı's own köşk came back content-locked: the account does not manage it"
    );
  const past =
    d.sessionCounts.past > 0 ? (await read(koskId, "PAST")).sessions : [];
  const cancelled =
    d.sessionCounts.cancelled > 0
      ? (await read(koskId, "CANCELLED")).sessions
      : [];
  const first = d.muderris[0];

  const out = {
    kosk: koskId,
    name: d.greetingName ?? "",
    // the four numbers, and the three badges
    courses: d.counts.courses,
    students: d.counts.students,
    upcoming: d.counts.upcomingSessions,
    pending: d.counts.pendingApplications,
    past: d.sessionCounts.past,
    cancelled: d.sessionCounts.cancelled,
    // the alert: the number it counts and the celse it names
    withoutAccess: d.withoutAccessCount,
    missingCourse: d.firstWithoutAccess?.courseTitle ?? "",
    // the rows each tab draws (the newest 20 of the two that are not ahead)
    upcomingRows: Math.min(d.sessions.length, UPCOMING_ROWS),
    upcomingWays: d.sessions.filter(hasWay).length,
    pastRows: Math.min(past.length, TAB_ROWS),
    pastWays: past.filter(hasWay).length,
    pastNone: past.filter((s) => !hasWay(s)).length,
    cancelledRows: Math.min(cancelled.length, TAB_ROWS),
    // Hocalar
    muderrisRows: d.muderris.length,
    muderrisCourses: first?.courseCount ?? 0,
    muderrisStudents: first?.studentCount ?? 0,
    muderrisMadrasah: first?.madrasahName ?? "",
  };
  mkdirSync(LOCAL, { recursive: true });
  writeFileSync(FILE, `${JSON.stringify(out, null, 2)}\n`);

  const lacking = [];
  if (mode === "seeded") {
    if (out.upcoming === 0) lacking.push("no celse in the next seven days");
    if (out.withoutAccess === 0)
      lacking.push(
        "no celse ahead without a way in (the alert would not show)"
      );
    if (out.upcomingWays + out.withoutAccess !== out.upcomingRows)
      lacking.push(
        "a celse ahead the page would draw neither as covered nor as missing"
      );
    if (out.past === 0) lacking.push("no celse behind us");
    if (out.cancelled !== 0)
      lacking.push(
        `${out.cancelled} cancelled celse (the seeded köşk has none: another walk left one)`
      );
    if (out.muderrisRows === 0) lacking.push("no hoca");
  } else if (mode === "empty") {
    if (out.courses !== 0) lacking.push(`${out.courses} course(s)`);
    if (out.upcoming + out.past + out.cancelled !== 0) lacking.push("a celse");
    if (out.pending !== 0)
      lacking.push(`${out.pending} waiting application(s)`);
    if (out.muderrisRows !== 0) lacking.push(`${out.muderrisRows} hoca(s)`);
  }
  if (lacking.length > 0)
    throw new Fail(
      `the köşk is not as the scenario "${mode}" needs (${lacking.join(", ")}): another walk left data behind, or the date moved the seed's celse out of the week. The seed makes no cancelled celse and no fully covered week, and this walk does not make them (ask: data for nizam.home.koskNazimLanding)`
    );
  console.log(
    `kosk-home ${mode ?? "read"} courses=${out.courses} students=${out.students} upcoming=${out.upcoming} pending=${out.pending} past=${out.past} cancelled=${out.cancelled} withoutAccess=${out.withoutAccess} hocas=${out.muderrisRows}`
  );
});
