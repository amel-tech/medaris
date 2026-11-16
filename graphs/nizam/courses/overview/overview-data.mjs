// Shapes the celses of a course a walk of nizam.courses.overview has made with helpers/course.mjs, and writes the numbers its page is about
// to show, where the binding reads them (graphs/.local/overview.json, read as {ovw.*}). It runs in a scenario's `setup`, after
// `course.mjs make` and the approvals the scenario makes; nothing it writes is outside the walk's own course, and `course.mjs remove` takes the
// course (and its celses) away again.
//
//   node ../nizam/courses/overview/overview-data.mjs build <tag> <lacking|covered|empty> [--approved <n>]
//   node ../nizam/courses/overview/overview-data.mjs blank
//   node ../nizam/courses/overview/overview-data.mjs clear
//
// build   shapes the celses of the course recorded under <tag> (graphs/.local/made/<tag>.json) for the page's `programme`, then reads what the page
//         reads (GET /courses/:id, /courses/:id/stats, /courses/:id/enrollments, as the başnazım, whose reads are not locked) and writes the numbers.
//         The course has four live celses from tomorrow (course.mjs's default: two weeks of two), named "Celse 1" to "Celse 4" in programme order:
//           lacking  Celse 2 gets a Zoom link, Celse 4 the in-person mark, Celse 3 is cancelled; Celse 1 is left with no way in. The page warns
//                    about Celse 1 and draws "Eksik", "Zoom", a bare dash and "Yüz yüze".
//           covered  Celse 1 and 4 get a Zoom link, Celse 2 the in-person mark, Celse 3 is cancelled: every celse that is not cancelled has a way in.
//           empty    nothing is changed; the walk made its course with its only celse behind it (course.mjs `--start -20`), so none is ahead.
//         --approved is how many applications the scenario answered with Onayla before this ran. The counts the page must show are worked out from
//         what the course was made with (course.mjs's `talebe` map: who is PENDING and who ENROLLED) and that number, and the script fails when
//         the API's own numbers say otherwise: the walk compares the page with the data it made, not with itself.
// blank   writes the file with nothing in it, for a scenario that makes no course (the refusal screens), so that a node spelled with a number
//         still resolves under `--absent`.
// clear   removes the file.
//
// What it counts, with the page's own rules (features/kosks/overview-present.ts, features/courses/attendance.ts):
//   rows        the nearest four live celses not behind us, a cancelled one keeping its slot (NEXT_SESSIONS = 4)
//   withoutRows the rows whose Katılım says "Eksik": not cancelled, with a read that carried the attendance and no link, no live stream and no
//               in-person mark; a read that carried none (a content-locked one) is never flagged
//   cancelledRows, plannedRows (every other row, "Planlandı"), editRows ("Düzenle: ..." buttons: planned rows with a way in)
//   missingTitle the first celse of ALL those ahead, not only the four, that has no way in: the warning's body names it
// Prints `overview-data <verb> <tag> <mode> rows=.. pending=.. enrolled=..`; nothing secret is printed.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  Fail,
  LOCAL,
  must,
  options,
  run,
  seed,
} from "../../../bindings/helpers/lib.mjs";

const OUT = resolve(LOCAL, "overview.json");
const ZOOM = "https://zoom.us/j/123456789";
const NEXT_SESSIONS = 4; // overview-present.ts:180

// [index in programme order, what to do]
const SHAPES = {
  lacking: [
    [1, { meetingUrl: ZOOM }],
    [3, { inPersonOverride: true }],
    [2, "cancel"],
  ],
  covered: [
    [0, { meetingUrl: ZOOM }],
    [1, { inPersonOverride: true }],
    [2, "cancel"],
    [3, { meetingUrl: ZOOM }],
  ],
  empty: [],
};

// features/courses/attendance.ts:41 hasAccess, and :111 lessonAttendance (no `inPerson` in the read: nothing is known of the celse)
const hasWay = (l) =>
  Boolean(l.meetingUrl?.trim()) ||
  l.hasLiveStream === true ||
  l.inPerson === true;
const known = (l) => l.inPerson !== undefined && l.inPerson !== null;

/** overview-present.ts:184-243: the live celses with a date, and how each one that is not behind us stands. */
export function aheadOf(course, now) {
  return course.weeks
    .flatMap((week) =>
      week.lessons
        .filter((l) => l.type === "LIVE" && l.scheduledAt)
        .map((lesson) => ({ week, lesson }))
    )
    .map(({ week, lesson }) => ({
      lesson,
      week: week.weekNumber,
      at: new Date(lesson.scheduledAt),
      status: lesson.cancelledAt
        ? "cancelled"
        : known(lesson) && !hasWay(lesson)
          ? "withoutAccess"
          : "planned",
    }))
    .filter((s) => s.at.getTime() >= now)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** The numbers the page shows for a course, from the API's own answers. */
export function compute({ course, kosk, stats, enrollments, now }) {
  const liveCount = course.weeks.flatMap((w) =>
    w.lessons.filter((l) => l.type === "LIVE" && l.scheduledAt)
  ).length;
  const ahead = aheadOf(course, now);
  const rows = ahead.slice(0, NEXT_SESSIONS);
  const withoutRows = rows.filter((s) => s.status === "withoutAccess").length;
  const cancelledRows = rows.filter((s) => s.status === "cancelled").length;
  const plannedRows = rows.length - cancelledRows;
  const pending = enrollments.filter((e) => e.status === "PENDING");
  const firstMissing = ahead.find((s) => s.status === "withoutAccess");
  return {
    course: course.id,
    kosk: course.koskId,
    title: course.title,
    koskName: kosk.name,
    zone: course.timeZone,
    weeks: stats.weekCount,
    sessions: liveCount,
    started: stats.startedWeekCount,
    enrolled: stats.enrolledCount,
    pending: stats.pendingCount,
    // the line under the h1 up to the days the course meets, which depend on the zone and the weekday of the walk
    headline: `${course.title} · ${kosk.name} · ${stats.weekCount} hafta · ${liveCount} celse`,
    rows: rows.length,
    plannedRows,
    cancelledRows,
    withoutRows,
    editRows: plannedRows - withoutRows,
    wayRows: rows.filter((s) => s.status === "planned" && known(s.lesson))
      .length,
    missingTitle: firstMissing?.lesson.title ?? "",
    pendingRows: pending.length,
    pendingFirst: pending[0]?.studentName?.trim() ?? "",
    hocas: course.muderris.length,
  };
}

function madeOf(tag) {
  const file = resolve(LOCAL, "made", `${tag}.json`);
  if (!existsSync(file))
    throw new Fail(
      `${file} does not exist: run helpers/course.mjs make ${tag} first`
    );
  return JSON.parse(readFileSync(file, "utf8"));
}

async function shape(made, mode) {
  const steps = SHAPES[mode];
  const needed = Math.max(-1, ...steps.map(([i]) => i)) + 1;
  if (made.lessons.length < needed)
    throw new Fail(
      `the course ${made.tag} has ${made.lessons.length} celse(s); the shape "${mode}" needs ${needed}`
    );
  let version = (await must("SYSTEM_ADMIN", "GET", `/courses/${made.course}`))
    .body.version;
  for (const [i, what] of steps) {
    const lesson = made.lessons[i];
    const r =
      what === "cancel"
        ? await must("SYSTEM_ADMIN", "POST", `/lessons/${lesson}/cancel`, {
            version,
            reason: "Deneme iptali",
          })
        : await must("SYSTEM_ADMIN", "PATCH", `/lessons/${lesson}`, {
            version,
            ...what,
          });
    // every write bumps the course's version: the answer says the new one
    version =
      r.body?.courseVersion ??
      (await must("SYSTEM_ADMIN", "GET", `/courses/${made.course}`)).body
        .version;
  }
}

const BLANK = {
  course: "none",
  kosk: "none",
  title: "(none)",
  koskName: "(none)",
  zone: "(none)",
  weeks: 0,
  sessions: 0,
  started: 0,
  enrolled: 0,
  pending: 0,
  headline: "(no course)",
  rows: 0,
  plannedRows: 0,
  cancelledRows: 0,
  withoutRows: 0,
  editRows: 0,
  wayRows: 0,
  missingTitle: "(none)",
  pendingRows: 0,
  pendingFirst: "(none)",
  hocas: 0,
};

function write(out) {
  mkdirSync(LOCAL, { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
}

async function build(tag, mode, approved) {
  if (!(mode in SHAPES))
    throw new Fail(
      `the shape is one of ${Object.keys(SHAPES).join(", ")}, not ${mode}`,
      2
    );
  const made = madeOf(tag);
  await shape(made, mode);
  const read = async (path) => (await must("SYSTEM_ADMIN", "GET", path)).body;
  const [course, stats, enrollments, kosk] = await Promise.all([
    read(`/courses/${made.course}`),
    read(`/courses/${made.course}/stats`),
    read(`/courses/${made.course}/enrollments`),
    read(`/kosks/${made.kosk}`),
  ]);
  const out = compute({ course, kosk, stats, enrollments, now: Date.now() });

  // what the course was made with says what the numbers must be
  const seats = Object.values(made.talebe ?? {});
  const wantPending = seats.filter((s) => s === "PENDING").length - approved;
  const wantEnrolled = seats.filter((s) => s === "ENROLLED").length + approved;
  const lacking = [];
  if (out.pending !== wantPending)
    lacking.push(
      `${out.pending} waiting application(s), the course was made with ${wantPending}`
    );
  if (out.enrolled !== wantEnrolled)
    lacking.push(
      `${out.enrolled} enrolled, the course was made with ${wantEnrolled}`
    );
  if (mode === "lacking") {
    if (out.withoutRows < 1)
      lacking.push("no celse without a way in (the warning would not show)");
    if (out.cancelledRows < 1)
      lacking.push("no cancelled celse among the rows");
    if (out.wayRows < 1) lacking.push("no celse with a way in among the rows");
    if (out.missingTitle !== "Celse 1")
      lacking.push(`the warning would name "${out.missingTitle}", not Celse 1`);
  } else if (mode === "covered") {
    if (out.withoutRows !== 0 || out.missingTitle !== "")
      lacking.push("a celse ahead has no way in");
    if (out.cancelledRows < 1)
      lacking.push("no cancelled celse among the rows");
    if (out.wayRows < 1) lacking.push("no celse with a way in among the rows");
  } else if (out.rows !== 0) {
    lacking.push(`${out.rows} celse(s) ahead, the scenario needs none`);
  }
  if (lacking.length > 0)
    throw new Fail(
      `the course ${tag} is not as the scenario "${mode}" needs (${lacking.join("; ")}); another walk changed it, or the date moved a celse`
    );
  write(out);
  console.log(
    `overview-data build ${tag} ${mode} rows=${out.rows} missing=${out.withoutRows} cancelled=${out.cancelledRows} pending=${out.pending} enrolled=${out.enrolled} weeks=${out.weeks} hocas=${out.hocas}`
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  run("overview-data", async () => {
    const [verb, ...args] = process.argv.slice(2);
    if (verb === "build") {
      const { rest, approved } = options(args, { values: ["approved"] });
      const [tag, mode] = rest;
      if (
        !tag ||
        !mode ||
        rest.length > 2 ||
        (approved !== undefined && !/^\d+$/.test(approved))
      )
        throw new Fail(
          "usage: overview-data.mjs build <tag> <lacking|covered|empty> [--approved <n>]",
          2
        );
      await build(tag, mode, Number(approved ?? 0));
    } else if (verb === "blank" && args.length === 0) {
      write({ ...BLANK, kosk: seed().kosk2 });
      console.log("overview-data blank");
    } else if (verb === "clear" && args.length === 0) {
      rmSync(OUT, { force: true });
      console.log("overview-data clear");
    } else {
      throw new Fail(
        "usage: overview-data.mjs build <tag> <lacking|covered|empty> [--approved <n>] | blank | clear",
        2
      );
    }
  });
