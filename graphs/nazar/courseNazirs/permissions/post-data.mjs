// What the walks of nazar.courseNazirs.permissions make and take away besides the course (which helpers/course.mjs makes under the tag
// `cnperm`): the ders nazırı post the hoca edits, the days the end field is typed with, and the events that happen to the post while the
// dialog is open. All through tedrisat's HTTP API: as the hoca (MUDERRIS) for what the story has her do, as the başnazım (SYSTEM_ADMIN) for every
// read and every clean-up, so that nothing a crashed walk left can stand in the way of the next one, and a hoca who has lost her seat can still
// be checked against.
//
//   node ../nazar/courseNazirs/permissions/post-data.mjs up [--forever]
//   node ../nazar/courseNazirs/permissions/post-data.mjs held [same|two-dated|two-forever|one-dated|one-forever|gone]
//   node ../nazar/courseNazirs/permissions/post-data.mjs dismiss
//   node ../nazar/courseNazirs/permissions/post-data.mjs drop-course
//   node ../nazar/courseNazirs/permissions/post-data.mjs down
//
// The spare is APPLICANT_H ("Rıza Başvuran"), a man with a full profile and no enrolment; the walks edit nobody else's post and never the
// seeded ders nazırı (DERS_NAZIR). `nazar.courseNazirs.appoint` takes applicantG, so the two flows never meet on one person.
//
//   up          (after `course.mjs make cnperm`) reads graphs/.local/made/cnperm.json, dismisses a post a walk that died left, appoints the spare
//               as the hoca does on the page (POST /courses/:id/nazirs) holding "Ders kaydı ekle..." and "Celse ekle..." (recording.manage and
//               session.manage) and an end thirty days ahead at 18:00 in Istanbul (--forever: no end), writes graphs/.local/cnperm.json (a data
//               source of the binding: {cn.course}, {cn.title}, {cn.sub}, {cn.name}, {cn.email}, {cn.hoca}, {cn.today}, {cn.futureLabel},
//               {cn.later}, {cn.laterLabel}, {cn.past}) and prints `post-data up`.
//   held        reads the list as the başnazım and describes the post: `held <codes>-<end> codes=<csv|-> end=<instant|none>`, where <codes> is
//               `two` (both permissions), `one` (recording.manage only) or `other`, and <end> is `dated` (an end ahead), `forever` (none) or
//               `lapsed`; `gone` when the course has no such post any more, `course-gone` when the course itself is not there. With an argument
//               it fails unless that is what the post holds: `same` is "what it held at the last check" (a step that must write nothing),
//               the others the label above. A check that passes records what it saw, so the next `same` compares with it.
//   dismiss     the event "the post is ended elsewhere while the dialog is open": DELETE /courses/:id/nazirs/:postId as the başnazım; a post
//               that is not there is fine. Records `gone`.
//   drop-course the event "the course is deleted while the dialog is open": helpers/course.mjs remove cnperm. Records `course-gone`.
//   down        dismisses the spare's post and removes the data file; safe to run twice and with nothing recorded (`post-data down 0`).
//
// Times are the ones the page uses: the viewer's zone is the app's default, Europe/Istanbul (UTC+3 all year), and the end field takes
// `YYYY-MM-DDTHH:mm`. What these cannot undo: the audit rows (course_nazir.assign, course_nazir.update, course_nazir.revoke), the revoked role
// and grant rows kept as history, and the invitation mails of the course (course.mjs remove clears them). Run it under the replay lock when
// walks are running and you run it by hand.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  accountKey,
  call,
  env,
  Fail,
  LOCAL,
  must,
  nameOf,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const TAG = "cnperm";
const SPARE = "APPLICANT_H";
const HOCA = "MUDERRIS";
const ADMIN = "SYSTEM_ADMIN";
const TWO = ["recording.manage", "session.manage"];
const ONE = ["recording.manage"];
const MADE = resolve(LOCAL, "made", `${TAG}.json`);
const FILE = resolve(LOCAL, `${TAG}.json`);
const COURSE_HELPER = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../bindings/helpers/course.mjs"
);
const DAY = 86_400_000;
const ZONE = "Europe/Istanbul";

const read = () => {
  if (!existsSync(FILE))
    throw new Fail(`${FILE} does not exist: run \`post-data.mjs up\` first`);
  return JSON.parse(readFileSync(FILE, "utf8"));
};
const write = (data) => {
  mkdirSync(LOCAL, { recursive: true });
  writeFileSync(FILE, `${JSON.stringify(data, null, 2)}\n`);
};

/** `YYYY-MM-DD` of an instant on the clock of Istanbul, which has no daylight saving time any more (+03:00 all year). */
const dayOf = (at) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
/** A day as the page writes it in the table and the dialog's card: dayFormat(locale, zone), dateStyle long. */
const labelOf = (at) =>
  new Intl.DateTimeFormat("tr", { dateStyle: "long", timeZone: ZONE }).format(
    at
  );

function dates() {
  const now = Date.now();
  const future = `${dayOf(now + 30 * DAY)}T18:00`;
  const futureIso = new Date(`${future}:00+03:00`).toISOString();
  const later = `${dayOf(now + 45 * DAY)}T20:30`;
  const laterIso = new Date(`${later}:00+03:00`).toISOString();
  return {
    today: labelOf(now),
    future,
    futureIso,
    futureLabel: labelOf(new Date(futureIso)),
    later,
    laterIso,
    laterLabel: labelOf(new Date(laterIso)),
    past: `${dayOf(now - 30 * DAY)}T12:00`,
  };
}

const listPath = (course) => `/courses/${course}/nazirs`;

/** The post of the spare in the course as the başnazım reads it: the item, `null` when there is none, `"course-gone"` when there is no course. */
async function postOf(course) {
  const r = await call(ADMIN, "GET", listPath(course));
  if (r.status === 404) return "course-gone";
  if (r.status >= 300)
    throw new Fail(
      `GET ${listPath(course)}: HTTP ${r.status} ${r.text.slice(0, 160)}`
    );
  const sub = subOf(SPARE).toLowerCase();
  return (
    (r.body.items ?? []).find((p) => p.user?.id?.toLowerCase() === sub) ?? null
  );
}

/** One line for what the post holds: `two-dated codes=... end=...`, `gone`, or `course-gone`. */
function describe(post) {
  if (post === null) return "gone";
  if (post === "course-gone") return "course-gone";
  const codes = [...post.permissions].sort();
  const set =
    codes.join() === [...TWO].sort().join()
      ? "two"
      : codes.join() === [...ONE].sort().join()
        ? "one"
        : "other";
  const end = post.endsAt
    ? Date.parse(post.endsAt) > Date.now()
      ? "dated"
      : "lapsed"
    : "forever";
  return `${set}-${end} codes=${codes.length ? codes.join(",") : "-"} end=${post.endsAt ? new Date(post.endsAt).toISOString() : "none"}`;
}

/** Ends the spare's post in the course if there is one; what happened, in a word. */
async function dismiss(course) {
  const post = await postOf(course);
  if (post === null) return "none";
  if (post === "course-gone") return "no course";
  const r = await call(ADMIN, "DELETE", `${listPath(course)}/${post.id}`);
  if (r.status >= 300 && r.status !== 404)
    throw new Fail(
      `DELETE ${listPath(course)}/${post.id}: HTTP ${r.status} ${r.text.slice(0, 160)}`
    );
  return "dismissed";
}

run("post-data", async () => {
  const [mode, ...rest] = process.argv.slice(2);
  if (accountKey(SPARE) !== "APPLICANT_H")
    throw new Fail("the spare account is wrong", 2);
  if (!mode)
    throw new Fail(
      "usage: post-data.mjs up [--forever] | held [same|two-dated|two-forever|one-dated|one-forever|gone] | dismiss | drop-course | down",
      2
    );

  if (mode === "down") {
    if (!existsSync(FILE)) {
      console.log("post-data down 0");
      return;
    }
    const did = await dismiss(read().course);
    rmSync(FILE, { force: true });
    console.log(`post-data down ${did}`);
    return;
  }

  if (mode === "dismiss") {
    const data = read();
    const did = await dismiss(data.course);
    write({ ...data, last: "gone" }); // what a check of "nothing was written" must now find
    console.log(`post-data dismiss ${did}`);
    return;
  }

  if (mode === "drop-course") {
    const data = read();
    const said = execFileSync(
      process.execPath,
      [COURSE_HELPER, "remove", TAG],
      {
        encoding: "utf8",
      }
    ).trim();
    write({ ...data, last: "course-gone" });
    console.log(`post-data drop-course ${said}`);
    return;
  }

  if (mode === "held") {
    const [wanted, ...more] = rest;
    if (more.length) throw new Fail("held takes one argument", 2);
    const data = read();
    const line = describe(await postOf(data.course));
    const kind = line.split(" ")[0];
    if (wanted === undefined) {
      console.log(`held ${line}`);
      return;
    }
    if (wanted === "same") {
      if (line !== data.last)
        throw new Fail(
          `the post holds something else than at the last check: now ${line}, before ${data.last}`
        );
      console.log(`held same ${kind}`);
      return;
    }
    if (
      ![
        "two-dated",
        "two-forever",
        "one-dated",
        "one-forever",
        "gone",
      ].includes(wanted)
    )
      throw new Fail(
        `held ${wanted}: same, two-dated, two-forever, one-dated, one-forever or gone`,
        2
      );
    if (kind !== wanted) throw new Fail(`the post is not ${wanted}: ${line}`);
    write({ ...data, last: line });
    console.log(`held ${wanted}`);
    return;
  }

  if (mode === "up") {
    const forever = rest.includes("--forever");
    if (!existsSync(MADE))
      throw new Fail(
        `${MADE} does not exist: run \`course.mjs make ${TAG}\` first`
      );
    const made = JSON.parse(readFileSync(MADE, "utf8"));
    // a post a walk that died left in this course: the next one starts from none
    await dismiss(made.course);
    const name = await nameOf(SPARE); // also makes the `users` row exist
    const hoca = await nameOf(HOCA);
    const d = dates();
    const appointed = await must(HOCA, "POST", listPath(made.course), {
      userId: subOf(SPARE),
      permissions: TWO,
      ...(forever ? {} : { endsAt: d.futureIso }),
    });
    const post = (appointed.body.items ?? []).find(
      (p) => p.user?.id?.toLowerCase() === subOf(SPARE).toLowerCase()
    );
    if (!post) throw new Fail("the post is not in the list after it was made");
    write({
      course: made.course,
      title: made.title,
      post: post.id,
      sub: subOf(SPARE),
      name,
      email: env()[`E2E_${accountKey(SPARE)}_EMAIL`],
      hoca,
      today: d.today,
      future: d.future,
      futureIso: d.futureIso,
      futureLabel: d.futureLabel,
      later: d.later,
      laterIso: d.laterIso,
      laterLabel: d.laterLabel,
      past: d.past,
      last: describe(post),
    });
    console.log(
      `post-data up ${name} is a ders nazırı of ${made.title}, ${forever ? "no end" : `ends ${d.futureLabel}`}`
    );
    return;
  }

  throw new Fail(`unknown mode ${mode}`, 2);
});
