// The walk data of nazar.courseSettings.access: a course of the walk's own (and, for the policy walks, a medrese of its own), so that the walk never
// changes a seeded course, a seeded medrese or their policies. It is the binding's `setup`, `teardown`, `before` and `effects`:
// `node access-data.mjs up|down|interfere|state ...`, run from graphs/bindings/ as `node ../nazar/courseSettings/access/access-data.mjs ...`. Only
// tedrisat's HTTP API is used, through helpers/lib.mjs (and helpers/course.mjs, course-nazir-grants.mjs and notify.mjs as commands); no SQL.
//
//   up [--medrese] [--approval] [--lock] [--codes]
//        Makes the course "Deneme dersi cs-access" with helpers/course.mjs (tag cs-access): published, one week of two LIVE celses ("Celse 1" and
//        "Celse 2", from tomorrow), MUDERRIS its hoca, anyone takes a seat, open, not in person, Europe/Istanbul, no sample. A course of that tag made
//        before (by a walk that died) is removed first, with its medrese.
//        --medrese   the course belongs to a medrese of the walk's own: "Erişim Deneme Medresesi" (handle erisim-deneme), made as the başnazım with the
//                    spare talebe APPLICANT_G as its başmüderris, given a hosting right in the seed's second köşk (the köşk no seeded flow reads), and
//                    the course is opened in it (course.mjs make --madrasah ... --kosk <kosk2>). No policy is on.
//        --approval  the course asks for approval (course.mjs make --approval): the page shows "Kayıt onayı gereksin" ticked and open.
//        --lock      with --medrese: the course is closed (PATCH /courses/<id> as the başnazım, who passes every policy), then the medrese's two
//                    policies are switched on (PATCH /madrasahs/<id>/settings: closedCourseRequired and alwaysApproval). The course's own approval
//                    flag stays false: the page shows the box ticked and shut all the same.
//        --codes     the ders nazırı account DERS_NAZIR is made a nazır of the course with course.edit and course.settings (the hoca does it, as on
//                    Ders nazırları), which is what e2e course-settings#10 holds before it takes them back.
//        The ids go to graphs/.local/made/cs-access.json (course.mjs's own file, the data source `made`: {course, title, weeks, lessons, ...}) and
//        to graphs/.local/made/csAccess.json (this helper's: {course, madrasah, second, interfered}, the data source `access`).
//   down
//        Takes everything away: the course (course.mjs remove: the talebe leave, the course goes with its celses, its post of ders nazırı and its
//        notifications), the medrese (DELETE /madrasahs/<id> as the başnazım; its settings row, hosting right and role assignments go with it) and the
//        notification the head's appointment sent to APPLICANT_G (notify.mjs clear). Safe to run twice and on a course or medrese already gone. The
//        audit rows of the walk stay: no route removes them.
//   interfere none|values|version|policy|codes|delete
//        What happens to the course behind the page of the person who opened it, once (a second call of the same walk says `already` and does
//        nothing, so a walk that reaches the state again does not move what it has just read):
//        values   someone else saves the sample session: PATCH /lessons/<Celse 2> with isPreview true and the course's version, as the hoca. The stored
//                 sample is "Celse 2" and the course's version has moved.
//        version  someone else saves the course with no change of value: PATCH /courses/<id> with the zone it already has, as the hoca. Only the
//                 version moves (the API bumps it whatever the value).
//        policy   the başnazım switches on the medrese's "Kayıt her zaman onaylı" (PATCH /madrasahs/<id>/settings).
//        codes    the hoca takes the ders nazırı's codes back (course-nazir-grants --codes none).
//        delete   the başnazım deletes the course (DELETE /courses/<id>).
//   state
//        What the course holds, read as the başnazım, on one line of JSON for an `effects` check:
//        {"isClosed":b,"requiresApproval":b,"inPerson":b,"timeZone":"...","sample":"Celse 1"|null,"status":"PUBLISHED"}; `gone` for a course that is gone.
//
// Prints one short line on stdout; a refusal is one line on stderr and a non-zero exit. Nothing secret is printed. Run by hand, every command takes the
// replay lock (CONVENTIONS, round R2).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Fail,
  LOCAL,
  must,
  options,
  run,
  seed,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const HELPERS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../bindings/helpers"
);
const TAG = "cs-access"; // the course's tag in helpers/course.mjs
const HEAD = "APPLICANT_G"; // the başmüderris of the walk's medrese: a spare talebe "Dilek Başvuran"; the other writers' medrese heads are C, E, F and H
const HANDLE = "erisim-deneme";
const NAME = "Erişim Deneme Medresesi";
const DESCRIPTION =
  "Ders ayarları sayfasının erişim kartını denemek için açılan medrese.";
const NAZIR = "DERS_NAZIR";
const FILE = resolve(LOCAL, "made", "csAccess.json");
const usage =
  "usage: access-data.mjs up [--medrese] [--approval] [--lock] [--codes] | down | interfere none|values|version|policy|codes|delete | state";

const read = () => {
  try {
    return JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
};
function keep(patch) {
  mkdirSync(dirname(FILE), { recursive: true, mode: 0o700 });
  writeFileSync(FILE, `${JSON.stringify({ ...read(), ...patch })}\n`, {
    mode: 0o600,
  });
}

// another helper of graphs/bindings/helpers, run as a command; its failure is one line
function helper(file, ...args) {
  try {
    return execFileSync(process.execPath, [resolve(HELPERS, file), ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (e) {
    throw new Fail(
      `${file} ${args.join(" ")}: ${String(e.stderr || e.message).trim()}`
    );
  }
}

// every medrese of this handle (hidden ones too), and the one recorded
async function ours() {
  const ids = new Set();
  if (read().madrasah) ids.add(read().madrasah);
  const listed = await must(
    "SYSTEM_ADMIN",
    "GET",
    `/madrasahs/directory?status=ALL&limit=50&q=${encodeURIComponent(HANDLE)}`
  );
  for (const m of listed.body.items ?? [])
    if (m.handle === HANDLE || m.handle.startsWith(`${HANDLE}-`)) ids.add(m.id);
  return [...ids];
}

async function down() {
  helper("course.mjs", "remove", TAG);
  const ids = await ours();
  for (const id of ids)
    await must("SYSTEM_ADMIN", "DELETE", `/madrasahs/${id}`, undefined, [404]);
  helper("notify.mjs", HEAD, "clear"); // the appointment as başmüderris told her; she starts with no notification
  rmSync(FILE, { force: true });
  return ids;
}

async function up(flags) {
  await down(); // a walk that died leaves nothing for this one
  if (flags.lock && !flags.medrese)
    throw new Fail("--lock needs --medrese: a policy is a medrese's", 2);
  let madrasah;
  const make = ["make", TAG, "--weeks", "1", "--lessons", "2"];
  if (flags.approval) make.push("--approval");
  if (flags.medrese) {
    const kosk = seed().kosk2;
    const head = subOf(HEAD);
    await must(HEAD, "GET", "/me"); // the head's row in tedrisat's users table
    const made = await must("SYSTEM_ADMIN", "POST", "/madrasahs", {
      name: NAME,
      handle: HANDLE,
      description: DESCRIPTION,
      headMuderrisUserId: head,
    });
    madrasah = made.body.id;
    keep({ madrasah, handle: HANDLE });
    await must("SYSTEM_ADMIN", "POST", `/kosks/${kosk}/hosting-rights`, {
      madrasahId: madrasah,
    });
    make.push("--madrasah", madrasah, "--kosk", kosk);
  }
  const course = JSON.parse(helper("course.mjs", ...make));
  keep({
    course: course.course,
    madrasah,
    second: course.lessons[1],
    interfered: false,
  });
  if (flags.lock) {
    // the başnazım passes every policy, so the course can be closed before the policy that holds it closed comes on
    await must("SYSTEM_ADMIN", "PATCH", `/courses/${course.course}`, {
      isClosed: true,
    });
    await must("SYSTEM_ADMIN", "PATCH", `/madrasahs/${madrasah}/settings`, {
      policies: { closedCourseRequired: true, alwaysApproval: true },
    });
  }
  if (flags.codes)
    helper(
      "course-nazir-grants.mjs",
      "--course",
      course.course,
      "--nazir",
      NAZIR,
      "--codes",
      "course.edit,course.settings"
    );
  return `up ${course.course}${madrasah ? ` in ${madrasah}` : ""}${flags.lock ? " locked" : ""}`;
}

async function interfere(how) {
  const data = read();
  if (!["none", "values", "version", "policy", "codes", "delete"].includes(how))
    throw new Fail(usage, 2);
  if (how === "none") return "interfere none";
  if (!data.course) throw new Fail("no course is recorded: run `up` first");
  if (data.interfered) return `interfere ${how} already`;
  if (how === "values") {
    const course = (
      await must("SYSTEM_ADMIN", "GET", `/courses/${data.course}`)
    ).body;
    await must("MUDERRIS", "PATCH", `/lessons/${data.second}`, {
      version: course.version,
      isPreview: true,
    });
  } else if (how === "version") {
    const course = (
      await must("SYSTEM_ADMIN", "GET", `/courses/${data.course}`)
    ).body;
    await must("MUDERRIS", "PATCH", `/courses/${data.course}`, {
      timeZone: course.timeZone,
    });
  } else if (how === "policy") {
    if (!data.madrasah)
      throw new Fail(
        "interfere policy needs a course of a medrese (--medrese)"
      );
    await must(
      "SYSTEM_ADMIN",
      "PATCH",
      `/madrasahs/${data.madrasah}/settings`,
      {
        policies: { alwaysApproval: true },
      }
    );
  } else if (how === "codes") {
    helper(
      "course-nazir-grants.mjs",
      "--course",
      data.course,
      "--nazir",
      NAZIR,
      "--codes",
      "none"
    );
  } else if (how === "delete") {
    await must(
      "SYSTEM_ADMIN",
      "DELETE",
      `/courses/${data.course}`,
      undefined,
      [404]
    );
  }
  keep({ interfered: true });
  return `interfere ${how} ${data.course}`;
}

async function state() {
  const { course: id } = read();
  if (!id) throw new Fail("no course is recorded: run `up` first");
  const r = await must(
    "SYSTEM_ADMIN",
    "GET",
    `/courses/${id}`,
    undefined,
    [404]
  );
  if (r.status === 404) return "gone";
  const c = r.body;
  const sample =
    (c.weeks ?? []).flatMap((w) => w.lessons ?? []).find((l) => l.isPreview)
      ?.title ?? null;
  return JSON.stringify({
    isClosed: c.isClosed,
    requiresApproval: c.requiresApproval,
    inPerson: c.inPerson,
    timeZone: c.timeZone,
    sample,
    status: c.status,
  });
}

run("access-data", async () => {
  const [verb, ...rest] = process.argv.slice(2);
  if (verb === "up") {
    const o = options(rest, {
      flags: ["medrese", "approval", "lock", "codes"],
    });
    if (o.rest.length) throw new Fail(usage, 2);
    console.log(await up(o));
  } else if (verb === "down") {
    if (rest.length) throw new Fail(usage, 2);
    const ids = await down();
    console.log(`down ${ids.length ? ids.join(" ") : "none"}`);
  } else if (verb === "interfere") {
    if (rest.length !== 1) throw new Fail(usage, 2);
    console.log(await interfere(rest[0]));
  } else if (verb === "state") {
    if (rest.length) throw new Fail(usage, 2);
    console.log(await state());
  } else throw new Fail(usage, 2);
});
